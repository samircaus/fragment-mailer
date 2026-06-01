import { describe, expect, it, vi } from 'vitest';
import {
	hydrateUnresolvedFragmentReferences,
	isCfReferencePath
} from '../src/lib/aem/hydrate-references.js';
import type { CFFragment } from '../src/lib/aem/types.js';

vi.mock('../src/lib/aem/delivery.js', () => ({
	fetchCampaignFragmentAtPath: vi.fn()
}));

import { fetchCampaignFragmentAtPath } from '../src/lib/aem/delivery.js';

describe('isCfReferencePath', () => {
	it('distinguishes CF paths from asset paths', () => {
		expect(isCfReferencePath('/content/dam/email/en/offers/hero-offer-1')).toBe(true);
		expect(
			isCfReferencePath('/content/dam/wknd-shared/en/adventures/bali-surf-camp/adobestock-175749320.jpg')
		).toBe(false);
	});
});

describe('hydrateUnresolvedFragmentReferences', () => {
	it('replaces path-only heroOffer with nested normalized fields', async () => {
		const fetchMock = vi.mocked(fetchCampaignFragmentAtPath);
		fetchMock.mockResolvedValue({
			data: {
				_path: '/content/dam/email/en/offers/hero-offer-1',
				_model: { _path: '/conf/email/settings/dam/cfm/models/offer', title: 'Offer' },
				_variation: 'master',
				_metadata: { stringMetadata: [] },
				title: 'Artic Surfing',
				bannerImage: {
					_publishUrl: 'https://publish.example.com/surfer.jpg'
				},
				ctaLabel: 'Check it out'
			}
		});

		const email: CFFragment = {
			_path: '/content/dam/email/en/campaigns/email-type-cf',
			_model: { _path: '/conf/email/settings/dam/cfm/models/email', title: 'Email' },
			_variation: 'master',
			_metadata: { stringMetadata: [] },
			heroOffer: '/content/dam/email/en/offers/hero-offer-1',
			bannerImage: '/content/dam/wknd-shared/en/hero.jpg'
		};

		const hydrated = await hydrateUnresolvedFragmentReferences(email);
		const offer = hydrated.heroOffer as Record<string, unknown>;

		expect(fetchMock).toHaveBeenCalledWith('/content/dam/email/en/offers/hero-offer-1', undefined);
		expect(offer.title).toBe('Artic Surfing');
		expect(offer.bannerImage).toBe('https://publish.example.com/surfer.jpg');
		expect(hydrated.bannerImage).toBe('/content/dam/wknd-shared/en/hero.jpg');
	});
});
