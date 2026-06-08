import { describe, it, expect } from 'vitest';
import giftOffer from '../src/lib/templates/files/gift-offer.mjml?raw';
import { instrumentCFOutputTokens } from '../src/lib/render/inject-ue.js';
import { resolve } from '../src/lib/render/resolve.js';
import { compileMJML } from '../src/lib/render/mjml.js';

const context = {
	cf: {
		title: 'A gift for you!',
		emailCopy: '<p>Enjoy 20% off our store.</p>',
		heroOffer: { title: 'Valid for 3 days', bannerImage: 'https://example.com/gift.jpg' },
		ctaLink: 'https://example.com/shop',
		ctaLabel: 'LOYAL20'
	},
	profile: { person: { name: { firstName: 'Jane' } } },
	preserveProfile: false,
	static: {}
};

describe('gift-offer.mjml', () => {
	it('compiles without aria-label breakage from head tokens', async () => {
		const { html: resolved } = resolve(instrumentCFOutputTokens(giftOffer), context);
		const compiled = await compileMJML(resolved);
		expect(compiled.html).toBeTruthy();
		expect(compiled.html).not.toContain('aria-label="<span');
	});

	it('uses hero banner instead of static asset URLs', async () => {
		const { html: resolved } = resolve(instrumentCFOutputTokens(giftOffer), context);
		const compiled = await compileMJML(resolved);
		expect(compiled.html).toContain('example.com/gift.jpg');
		expect(compiled.html).not.toContain('ricfreire/mautic-theme-loyalclient');
	});

	it('uses gradient accent when no hero banner', async () => {
		const noHero = {
			...context,
			cf: { ...context.cf, heroOffer: { title: 'Valid for 3 days' } }
		};
		const { html: resolved } = resolve(instrumentCFOutputTokens(giftOffer), noHero);
		const compiled = await compileMJML(resolved);
		expect(compiled.html).toContain('gift-accent');
	});
});
