import { describe, expect, it } from 'vitest';
import { expandInsertFieldsFromFragment } from '../src/lib/templates/cf-insert-fields.js';

describe('expandInsertFieldsFromFragment', () => {
	it('includes nested reference and image tokens', () => {
		const fields = expandInsertFieldsFromFragment({
			title: 'Main',
			heroOffer: {
				title: 'Offer title',
				bannerImage: 'https://publish.example.com/img.jpg',
				ctaLabel: 'Go'
			}
		});

		const tokens = fields.map((f) => f.token);
		expect(tokens).toContain('cf.title');
		expect(tokens).toContain('cf.heroOffer.title');
		expect(tokens).toContain('cf.heroOffer.bannerImage');
		expect(tokens).toContain('cf.heroOffer.ctaLabel');

		const imageField = fields.find((f) => f.token === 'cf.heroOffer.bannerImage');
		expect(imageField?.snippet).toContain('{{{cf.heroOffer.bannerImage}}}');
	});
});
