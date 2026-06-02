import { describe, expect, it } from 'vitest';
import {
	collectCFOutputBindings,
	injectUEAttributes,
	instrumentCFOutputTokens
} from '../src/lib/render/inject-ue.js';
import { compileMJML } from '../src/lib/render/mjml.js';
import { resolve } from '../src/lib/render/resolve.js';

describe('instrumentCFOutputTokens', () => {
	it('wraps cf output tokens in body text', () => {
		const mjml = '<mj-text>Hello {{cf.heroHeadline}}</mj-text>';
		const instrumented = instrumentCFOutputTokens(mjml);
		expect(instrumented).toContain(
			'<span data-fm-binding="cf.heroHeadline">{{cf.heroHeadline}}</span>'
		);
	});

	it('adds fm-binding comments for cf tokens in mj-image src', () => {
		const mjml = `<mj-image src="{{{cf.heroOffer.bannerImage}}}" alt="{{cf.title}}" />`;
		const instrumented = instrumentCFOutputTokens(mjml);
		expect(instrumented).toContain('<!-- fm-binding:cf.heroOffer.bannerImage -->');
		expect(instrumented).toContain('src="{{{cf.heroOffer.bannerImage}}}"');
	});

	it('still wraps cf tokens in mj-button body text', () => {
		const mjml = '<mj-button href="{{cf.ctaUrl}}">{{cf.ctaText}}</mj-button>';
		const instrumented = instrumentCFOutputTokens(mjml);
		expect(instrumented).toContain('href="{{cf.ctaUrl}}"');
		expect(instrumented).toContain('<span data-fm-binding="cf.ctaText">{{cf.ctaText}}</span>');
		expect(instrumented).toContain('<!-- fm-binding:cf.ctaUrl -->');
	});
});

describe('collectCFOutputBindings', () => {
	it('collects nested paths from text and image attributes', () => {
		const mjml = `
			<mj-text>{{cf.heroHeadline}}</mj-text>
			<mj-text>{{ cf.featuredOffer.headline | default: "none" }}</mj-text>
			<mj-button href="{{cf.ctaUrl}}">Buy</mj-button>
			<mj-image src="{{{cf.heroOffer.bannerImage}}}" />
		`;
		const bindings = collectCFOutputBindings(mjml);
		expect(bindings).toContain('cf.heroHeadline');
		expect(bindings).toContain('cf.featuredOffer.headline');
		expect(bindings).toContain('cf.ctaUrl');
		expect(bindings).toContain('cf.heroOffer.bannerImage');
	});
});

describe('injectUEAttributes — images from referenced CF', () => {
	it('stamps data-aue-* on compiled img after fm-binding comment', async () => {
		const mjml = `<mjml><mj-body><mj-section><mj-column>
<!-- fm-binding:cf.heroOffer.bannerImage --><mj-image src="{{{cf.heroOffer.bannerImage}}}" alt="x" />
</mj-column></mj-section></mj-body></mjml>`;
		const context = {
			cf: {
				heroOffer: {
					_path: '/content/dam/email/en/offers/hero-offer-1',
					bannerImage: 'https://publish.example.com/surfer.jpg'
				}
			},
			profile: {},
			preserveProfile: false,
			static: {}
		};
		const { html: resolved } = resolve(mjml, context);
		const compiled = await compileMJML(resolved);
		expect(compiled.html).toBeTruthy();

		const out = injectUEAttributes(compiled.html!, [
			{
				fieldPath: 'cf.heroOffer.bannerImage',
				cfPath: '/content/dam/email/en/offers/hero-offer-1',
				fieldName: 'bannerImage',
				fieldType: 'reference'
			}
		]);

		expect(out).toContain('data-aue-prop="bannerImage"');
		expect(out).toContain('data-aue-type="reference"');
		expect(out).toMatch(/<img[^>]*data-aue-resource="[^"]*hero-offer-1/);
		expect(out).toContain('src="https://publish.example.com/surfer.jpg"');
	});
});
