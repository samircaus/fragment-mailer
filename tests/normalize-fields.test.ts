import { describe, expect, it } from 'vitest';
import { normalizeCF } from '../src/lib/aem/client.js';
import { normalizeFragmentFields } from '../src/lib/aem/normalize-fields.js';
import { resolve } from '../src/lib/render/resolve.js';
import type { RenderContext } from '../src/lib/render/resolve.js';
import type { CFFragment } from '../src/lib/aem/types.js';

describe('normalizeFragmentFields — nested references', () => {
	it('flattens nested offer bannerImage to a URL string', () => {
		const fields = normalizeFragmentFields({
			title: 'Email title',
			heroOffer: {
				_path: '/content/dam/email/en/offers/hero-offer-1',
				title: 'Artic Surfing',
				bannerImage: {
					_publishUrl: 'https://publish.example.com/surfer.jpg',
					_path: '/content/dam/wknd-shared/en/surfer.jpg',
					type: 'image'
				},
				ctaLabel: 'Check it out'
			}
		});

		const offer = fields.heroOffer as Record<string, unknown>;
		expect(offer.title).toBe('Artic Surfing');
		expect(offer.bannerImage).toBe('https://publish.example.com/surfer.jpg');
		expect(offer.ctaLabel).toBe('Check it out');
	});

	it('resolves cf.heroOffer.bannerImage in templates without _publishUrl', () => {
		const fields = normalizeFragmentFields({
			heroOffer: {
				bannerImage: {
					_publishUrl: 'https://publish.example.com/nested.jpg'
				}
			}
		});

		const ctx: RenderContext = {
			cf: fields,
			profile: {},
			preserveProfile: false,
			static: {}
		};

		const { html } = resolve(
			'<img src="{{{cf.heroOffer.bannerImage}}}" />',
			ctx
		);
		expect(html).toBe('<img src="https://publish.example.com/nested.jpg" />');
	});
});

describe('normalizeCF — backward compatibility', () => {
	it('still normalizes root emailCopy and bannerImage', () => {
		const fragment: CFFragment = {
			_path: '/content/dam/email/en/campaigns/test',
			_model: { _path: '/conf/email/settings/dam/cfm/models/email', title: 'Email' },
			_variation: 'master',
			_metadata: { stringMetadata: [] },
			emailCopy: { html: '<p>Hi</p>' },
			bannerImage: { _publishUrl: 'https://publish.example.com/hero.jpg' }
		};

		const normalized = normalizeCF(fragment);
		expect(normalized.fields.emailCopy).toBe('<p>Hi</p>');
		expect(normalized.fields.bannerImage).toBe('https://publish.example.com/hero.jpg');
	});
});
