import { describe, it, expect } from 'vitest';
import { resolve } from '../src/lib/render/resolve.js';
import type { RenderContext } from '../src/lib/render/resolve.js';

const BASE_CONTEXT: RenderContext = {
	cf: {
		heroHeadline: 'Spring into Savings',
		subtitle: 'Up to 40% off',
		bodyCopy: 'Shop the season.',
		ctaText: 'Shop Now',
		ctaUrl: 'https://example.com/sale',
		featuredOffer: {
			headline: 'Bundle Deal',
			description: '3 for 2 on everything'
		}
	},
	profile: {
		'person.name.firstName': 'Sarah',
		'person.name.lastName': 'Mitchell',
		'person.email': 'sarah@example.com'
	},
	preserveProfile: false,
	static: {
		year: 2025,
		companyName: 'Acme Corp'
	}
};

describe('resolve — simple tokens', () => {
	it('resolves a cf token', () => {
		const { html } = resolve('Hello {{cf.heroHeadline}}', BASE_CONTEXT);
		expect(html).toBe('Hello Spring into Savings');
	});

	it('resolves a nested cf token (referenced CF)', () => {
		const { html } = resolve('Offer: {{cf.featuredOffer.headline}}', BASE_CONTEXT);
		expect(html).toBe('Offer: Bundle Deal');
	});

	it('resolves a static token', () => {
		const { html } = resolve('© {{static.year}}', BASE_CONTEXT);
		expect(html).toBe('© 2025');
	});

	it('resolves a profile token when preserveProfile is false', () => {
		const { html } = resolve('Hi {{profile.person.name.firstName}}', BASE_CONTEXT);
		expect(html).toBe('Hi Sarah');
	});

	it('preserves profile tokens when preserveProfile is true', () => {
		const ctx: RenderContext = { ...BASE_CONTEXT, preserveProfile: true };
		const { html } = resolve('Hi {{profile.person.name.firstName}}', ctx);
		expect(html).toBe('Hi {{profile.person.name.firstName}}');
	});

	it('leaves unresolved cf tokens as-is and adds a warning', () => {
		const { html, warnings } = resolve('Missing: {{cf.nonExistentField}}', BASE_CONTEXT);
		expect(html).toBe('Missing: {{cf.nonExistentField}}');
		expect(warnings).toContain('Unresolved CF token: {{cf.nonExistentField}}');
	});
});

describe('resolve — conditional blocks', () => {
	it('renders the then-branch when the field is truthy', () => {
		const { html } = resolve(
			'{{#if cf.subtitle}}<p>{{cf.subtitle}}</p>{{/if}}',
			BASE_CONTEXT
		);
		expect(html).toBe('<p>Up to 40% off</p>');
	});

	it('renders nothing when the field is absent', () => {
		const ctx: RenderContext = {
			...BASE_CONTEXT,
			cf: { ...BASE_CONTEXT.cf, subtitle: undefined }
		};
		const { html } = resolve('{{#if cf.subtitle}}<p>{{cf.subtitle}}</p>{{/if}}', ctx);
		expect(html).toBe('');
	});

	it('renders the else-branch when the field is absent', () => {
		const ctx: RenderContext = {
			...BASE_CONTEXT,
			cf: { ...BASE_CONTEXT.cf, subtitle: undefined }
		};
		const { html } = resolve('{{#if cf.subtitle}}YES{{else}}NO{{/if}}', ctx);
		expect(html).toBe('NO');
	});

	it('renders the then-branch when the field is a non-empty string', () => {
		const ctx: RenderContext = { ...BASE_CONTEXT, cf: { ...BASE_CONTEXT.cf, subtitle: 'Sale!' } };
		const { html } = resolve('{{#if cf.subtitle}}YES{{else}}NO{{/if}}', ctx);
		expect(html).toBe('YES');
	});

	it('handles a nested cf reference in a conditional', () => {
		const { html } = resolve(
			'{{#if cf.featuredOffer.headline}}<h2>{{cf.featuredOffer.headline}}</h2>{{/if}}',
			BASE_CONTEXT
		);
		expect(html).toBe('<h2>Bundle Deal</h2>');
	});
});

describe('resolve — multiple tokens', () => {
	it('resolves multiple tokens in one pass', () => {
		const { html } = resolve(
			'{{cf.heroHeadline}} — {{cf.ctaText}} at {{cf.ctaUrl}}',
			BASE_CONTEXT
		);
		expect(html).toBe('Spring into Savings — Shop Now at https://example.com/sale');
	});
});
