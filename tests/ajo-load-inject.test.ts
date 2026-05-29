import { describe, it, expect } from 'vitest';
import promoDefinition from '../src/lib/templates/files/promo.template.json';
import {
	collectCfRootsUsedInTemplate,
	ensureLoadTagsInTemplate,
	inferLoadTagSpecs,
	rewriteLegacyCfReferencePaths
} from '../src/lib/render/ajo-load-inject.js';
import type { TemplateDefinition } from '../src/lib/templates/registry.js';

const promoDef = promoDefinition as TemplateDefinition;

describe('inferLoadTagSpecs', () => {
	it('infers cf + reference loads from promo-style cf.* usage', () => {
		const mjml = `
<mj-body>
  {{ cf.heroHeadline }}
  {% if cf.featuredOffer.headline %}{{ cf.featuredOffer.headline }}{% endif %}
</mj-body>`;

		const specs = inferLoadTagSpecs(mjml, promoDef);
		expect(specs).toContainEqual({ varName: 'cf', refExpression: 'this' });
		expect(specs).toContainEqual({ varName: 'featuredOffer', refExpression: 'this.featuredOffer' });
	});

	it('infers only cf for offer template scalar bindings', () => {
		const mjml = `<mj-body>{{ cf.title }}{{{ cf.emailCopy }}}</mj-body>`;
		const specs = inferLoadTagSpecs(mjml);
		expect(specs).toEqual([{ varName: 'cf', refExpression: 'this' }]);
	});
});

describe('ensureLoadTagsInTemplate', () => {
	it('injects load tags and rewrites cf.featuredOffer paths', () => {
		const mjml = `<mjml><mj-body>
{{ cf.heroHeadline }}
{% if cf.featuredOffer.headline %}{{ cf.featuredOffer.headline }}{% endif %}
</mj-body></mjml>`;

		const { mjml: out, injected } = ensureLoadTagsInTemplate(mjml, promoDef);
		expect(injected.map((s) => s.varName).sort()).toEqual(['cf', 'featuredOffer']);
		expect(out).toContain("{% load cf as fragment ref='this' %}");
		expect(out).toContain("{% load featuredOffer as fragment ref='this.featuredOffer' %}");
		expect(out).toContain('{{ featuredOffer.headline }}');
		expect(out).not.toContain('cf.featuredOffer');
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

describe('rewriteLegacyCfReferencePaths', () => {
	it('rewrites nested reference paths only', () => {
		const out = rewriteLegacyCfReferencePaths('{{ cf.featuredOffer.headline }}', ['featuredOffer']);
		expect(out).toBe('{{ featuredOffer.headline }}');
		expect(collectCfRootsUsedInTemplate(out)).not.toContain('featuredOffer');
	});
});
