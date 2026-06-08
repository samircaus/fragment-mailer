import { describe, it, expect } from 'vitest';
import promoDefinition from '../src/lib/templates/files/promo.template.json';
import { syncTemplateFromAemModel } from '../src/lib/templates/cf-fields.js';
import {
	collectCfRootsUsedInTemplate,
	collectReferenceFieldNames,
	ensureLoadTagsInTemplate,
	inferLoadTagSpecs,
	isFragmentReferenceField,
	restoreCfReferencePaths
} from '../src/lib/render/ajo-load-inject.js';
import type { TemplateDefinition } from '../src/lib/templates/registry.js';

const promoDef = promoDefinition as TemplateDefinition;

/** Offer fields as AEM Author would return them (asset vs fragment-reference). */
const offerDef = syncTemplateFromAemModel({
	templateId: 'offer',
	aemModel: {
		id: 'offer-model',
		title: 'Offer',
		fields: [
			{ name: 'title', label: 'Title', type: 'text', required: true, multiple: false },
			{
				name: 'bannerImage',
				label: 'Banner',
				type: 'asset-reference',
				required: false,
				multiple: false
			},
			{ name: 'emailCopy', label: 'Email Copy', type: 'text/html', required: true, multiple: false }
		]
	}
}).definition;

describe('inferLoadTagSpecs', () => {
	it('infers only cf load from promo-style cf.* usage (nested refs stay under cf)', () => {
		const mjml = `
<mj-body>
  {{ cf.heroHeadline }}
  {% if cf.featuredOffer.headline %}{{ cf.featuredOffer.headline }}{% endif %}
</mj-body>`;

		const specs = inferLoadTagSpecs(mjml, promoDef);
		expect(specs).toEqual([{ varName: 'cf', refExpression: 'this' }]);
	});

	it('infers only cf for offer template scalar bindings', () => {
		const mjml = `<mj-body>{{ cf.title }}{{{ cf.emailCopy }}}</mj-body>`;
		const specs = inferLoadTagSpecs(mjml);
		expect(specs).toEqual([{ varName: 'cf', refExpression: 'this' }]);
	});

	it('does not treat bannerImage as a fragment load when it is a DAM asset field', () => {
		const mjml = `<mj-body>{% if cf.bannerImage %}<mj-image src="{{{cf.bannerImage}}}" />{% endif %}</mj-body>`;
		const refs = collectReferenceFieldNames(offerDef);
		expect(refs.has('bannerImage')).toBe(false);
		expect(isFragmentReferenceField(offerDef.fields.bannerImage!, 'bannerImage')).toBe(false);

		const specs = inferLoadTagSpecs(mjml, offerDef);
		expect(specs).toEqual([{ varName: 'cf', refExpression: 'this' }]);
		expect(specs.some((s) => s.varName === 'bannerImage')).toBe(false);
	});
});

describe('ensureLoadTagsInTemplate', () => {
	it('injects only cf load tag and keeps cf.featuredOffer paths', () => {
		const mjml = `<mjml><mj-body>
{{ cf.heroHeadline }}
{% if cf.featuredOffer.headline %}{{ cf.featuredOffer.headline }}{% endif %}
</mj-body></mjml>`;

		const { mjml: out, injected } = ensureLoadTagsInTemplate(mjml, promoDef);
		expect(injected).toEqual([{ varName: 'cf', refExpression: 'this' }]);
		expect(out).toContain("{% load cf as fragment ref='this' %}");
		expect(out).toContain('{{ cf.featuredOffer.headline }}');
		expect(out).not.toMatch(/\{\{\s*featuredOffer\./);
	});

	it('does not duplicate existing load tags', () => {
		const mjml = `<mj-body>
{% load cf as fragment ref='this' %}
{{ cf.heroHeadline }}
</mj-body>`;
		const { injected } = ensureLoadTagsInTemplate(mjml, promoDef);
		expect(injected).toHaveLength(0);
	});
});

describe('restoreCfReferencePaths', () => {
	it('restores cf prefix for legacy reference var paths', () => {
		const out = restoreCfReferencePaths('{{ featuredOffer.headline }}', ['featuredOffer']);
		expect(out).toBe('{{ cf.featuredOffer.headline }}');
		expect(collectCfRootsUsedInTemplate(out)).toContain('featuredOffer');
	});
});
