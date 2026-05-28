import { describe, expect, it } from 'vitest';
import { collectCFOutputBindings, instrumentCFOutputTokens } from '../src/lib/render/inject-ue.js';

describe('instrumentCFOutputTokens', () => {
	it('wraps cf output tokens in body text', () => {
		const mjml = '<mj-text>Hello {{cf.heroHeadline}}</mj-text>';
		const instrumented = instrumentCFOutputTokens(mjml);
		expect(instrumented).toContain(
			'<span data-fm-binding="cf.heroHeadline">{{cf.heroHeadline}}</span>'
		);
	});

	it('does not wrap cf tokens used in tag attributes', () => {
		const mjml = '<mj-button href="{{cf.ctaUrl}}">{{cf.ctaText}}</mj-button>';
		const instrumented = instrumentCFOutputTokens(mjml);
		expect(instrumented).toContain('href="{{cf.ctaUrl}}"');
		expect(instrumented).toContain('<span data-fm-binding="cf.ctaText">{{cf.ctaText}}</span>');
	});
});

describe('collectCFOutputBindings', () => {
	it('collects nested and top-level cf paths outside tags', () => {
		const mjml = `
			<mj-text>{{cf.heroHeadline}}</mj-text>
			<mj-text>{{ cf.featuredOffer.headline | default: "none" }}</mj-text>
			<mj-button href="{{cf.ctaUrl}}">Buy</mj-button>
		`;
		const bindings = collectCFOutputBindings(mjml);
		expect(bindings).toContain('cf.heroHeadline');
		expect(bindings).toContain('cf.featuredOffer.headline');
		expect(bindings).not.toContain('cf.ctaUrl');
	});
});
