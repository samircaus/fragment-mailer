import { describe, it, expect } from 'vitest';
import newPromo from '../src/lib/templates/files/new-promo.mjml?raw';
import { instrumentCFOutputTokens } from '../src/lib/render/inject-ue.js';
import { resolve } from '../src/lib/render/resolve.js';
import { compileMJML } from '../src/lib/render/mjml.js';

const context = {
	cf: {
		title: 'Summer Vibes',
		emailCopy: '<p>Hello</p>',
		heroOffer: { title: 'Sub', bannerImage: 'https://example.com/banner.jpg' },
		ctaLink: 'https://example.com',
		ctaLabel: 'Go'
	},
	profile: { person: { name: { firstName: 'Jane' } } },
	preserveProfile: false,
	static: {}
};

describe('new-promo.mjml', () => {
	it('does not break aria-label when cf.title is instrumented', async () => {
		const { html: resolved } = resolve(instrumentCFOutputTokens(newPromo), context);
		const compiled = await compileMJML(resolved);
		expect(compiled.html).toBeTruthy();
		expect(compiled.html).not.toContain('aria-label="<span');
		expect(compiled.html).not.toMatch(/Summer Vibes" aria-roledescription/);
	});

	it('uses hero banner or gradient instead of static card backgrounds', async () => {
		const { html: resolved } = resolve(instrumentCFOutputTokens(newPromo), context);
		const compiled = await compileMJML(resolved);
		expect(compiled.html).not.toContain('card-bg.jpg');
		expect(compiled.html).toContain('example.com/banner.jpg');
	});

	it('falls back to gradient when no hero banner', async () => {
		const noHero = {
			...context,
			cf: { ...context.cf, heroOffer: { title: 'Sub' } }
		};
		const { html: resolved } = resolve(instrumentCFOutputTokens(newPromo), noHero);
		const compiled = await compileMJML(resolved);
		expect(compiled.html).toContain('card-gradient');
		expect(compiled.html).not.toContain('card-bg.jpg');
	});
});
