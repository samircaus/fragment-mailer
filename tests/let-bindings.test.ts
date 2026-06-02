import { describe, expect, it } from 'vitest';
import {
	buildLetUEBindings,
	cfExpressionToFragmentRef,
	collectLetVariableBindings,
	parseLetFragmentAliases,
	resolveLetSourceCfPath
} from '../src/lib/render/let-bindings.js';
import { collectCFOutputBindings, injectUEAttributes, instrumentCFOutputTokens } from '../src/lib/render/inject-ue.js';
import { buildUEBindings } from '../src/lib/render/ue-bindings.js';
import { ensureLoadTagsInTemplate } from '../src/lib/render/ajo-load-inject.js';
import { resolve } from '../src/lib/render/resolve.js';

describe('let-bindings', () => {
	it('maps cf.offers.0 to this.offers[0] for AJO load', () => {
		expect(cfExpressionToFragmentRef('cf.offers.0')).toBe('this.offers[0]');
		expect(cfExpressionToFragmentRef('cf.offers[1]')).toBe('this.offers[1]');
		expect(cfExpressionToFragmentRef('cf.heroOffer')).toBe('this.heroOffer');
	});

	it('parses let aliases from MJML', () => {
		const mjml = `{% let offer0 = cf.offers.0 %}{% let offer1 = cf.offers[1] %}`;
		const aliases = parseLetFragmentAliases(mjml);
		expect(aliases.get('offer0')).toBe('this.offers[0]');
		expect(aliases.get('offer1')).toBe('this.offers[1]');
	});

	it('collects offer0.title bindings', () => {
		const aliases = new Map([['offer0', 'this.offers[0]']]);
		const paths = collectLetVariableBindings(
			'<mj-text>{{offer0.title}}</mj-text><mj-image src="{{{offer0.bannerImage}}}" />',
			aliases
		);
		expect(paths).toContain('offer0.title');
		expect(paths).toContain('offer0.bannerImage');
	});

	it('resolves referenced offer CF path from hydrated offers array', () => {
		const path = resolveLetSourceCfPath(
			{
				offers: [
					{
						_path: '/content/dam/offers/offer-a',
						title: 'A',
						bannerImage: 'https://example.com/a.jpg'
					}
				]
			},
			'cf.offers.0',
			'/content/dam/campaigns/email'
		);
		expect(path).toBe('/content/dam/offers/offer-a');
	});
});

describe('UE — let alias cards', () => {
	it('instruments offer0 tokens and stamps per-offer data-aue-resource', async () => {
		const mjml = `<mjml><mj-body>
{% let offer0 = cf.offers.0 %}
<mj-text>{{offer0.title}}</mj-text>
<mj-image src="{{{offer0.bannerImage}}}" alt="x" />
</mj-body></mjml>`;

		const context = {
			cf: {
				offers: [
					{
						_path: '/content/dam/offers/offer-a',
						title: 'Surf sale',
						bannerImage: 'https://example.com/a.jpg'
					}
				]
			},
			profile: {},
			preserveProfile: false,
			static: {}
		};

		const instrumented = instrumentCFOutputTokens(mjml);
		expect(instrumented).toContain('data-fm-binding="offer0.title"');
		expect(instrumented).toContain('<!-- fm-binding:offer0.bannerImage -->');

		const { html: resolved } = resolve(instrumented, context);
		const bindings = buildUEBindings({
			definition: {
				id: 'summer',
				name: 'Summer',
				version: '1.0.0',
				cfModel: 'Email',
				fields: {},
				profileTokens: [],
				previewSize: { width: 600, height: 900 }
			},
			discoveredBindings: collectCFOutputBindings(mjml),
			defaultCfPath: '/content/dam/campaigns/email',
			cfFields: context.cf,
			mjml
		});

		const titleBinding = bindings.find((b) => b.fieldPath === 'offer0.title');
		expect(titleBinding?.cfPath).toBe('/content/dam/offers/offer-a');
		expect(titleBinding?.fieldName).toBe('title');

		const out = injectUEAttributes(`<span data-fm-binding="offer0.title">Surf sale</span>`, bindings);
		expect(out).toContain('data-aue-prop="title"');
		expect(out).toMatch(/data-aue-resource="[^"]*offer-a/);
	});

	it('injects AJO load tags from let aliases', () => {
		const mjml = `<mj-body>
{% let offer0 = cf.offers.0 %}
<mj-text>{{offer0.title}}</mj-text>
</mj-body>`;
		const { mjml: out, injected } = ensureLoadTagsInTemplate(mjml);
		expect(injected).toContainEqual({ varName: 'offer0', refExpression: 'this.offers[0]' });
		expect(out).toContain("{% load offer0 as fragment ref='this.offers[0]' %}");
	});
});
