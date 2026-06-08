import { describe, expect, it } from 'vitest';
import { authorFragmentToCFFragment } from '../src/lib/aem/author-map.js';
import { normalizeCF } from '../src/lib/aem/client.js';
import { resolve } from '../src/lib/render/resolve.js';
import type { AuthorFragment } from '../src/lib/types/aem.js';

describe('authorFragmentToCFFragment — flat hydrated references (Sites CF OpenAPI)', () => {
	const dmEnv = {
		USE_DYNAMIC_MEDIA: 'true',
		AEM_PUBLISH_HOST: 'https://publish-p125048-e1847106.adobeaemcloud.com',
		AEM_DELIVERY_HOST: 'https://delivery-p125048-e1847106.adobeaemcloud.com'
	};

	it('falls back to publish URL for DRAFT assets (not yet on delivery CDN)', () => {
		const offerFragment: AuthorFragment = {
			id: 'offer-id',
			path: '/content/dam/email/en/offers/summer',
			title: 'Summer',
			etag: '"1"',
			created: { at: '2026-01-01T00:00:00Z', by: 'admin' },
			modified: { at: '2026-01-02T00:00:00Z', by: 'admin' },
			model: { id: 'offer', title: 'Offer' },
			status: 'published',
			fields: [
				{
					name: 'bannerImage',
					type: 'content-reference',
					multiple: false,
					required: false,
					values: [
						'/content/dam/wknd-shared/en/adventures/surf-camp-in-costa-rica/adobestock-266405335.jpeg'
					]
				}
			],
			references: [
				{
					fieldName: 'bannerImage',
					type: 'asset',
					status: 'DRAFT',
					path: '/content/dam/wknd-shared/en/adventures/surf-camp-in-costa-rica/adobestock-266405335.jpeg',
					assetId: 'urn:aaid:aem:5979b411-618a-4530-9680-5c39674903c0'
				}
			]
		};

		const normalized = normalizeCF(authorFragmentToCFFragment(offerFragment, dmEnv));

		expect(normalized.fields.bannerImage).toBe(
			'https://publish-p125048-e1847106.adobeaemcloud.com/content/dam/wknd-shared/en/adventures/surf-camp-in-costa-rica/adobestock-266405335.jpeg'
		);
	});

	it('resolves approved assets to Dynamic Media delivery URLs', () => {
		const offerFragment: AuthorFragment = {
			id: 'offer-id',
			path: '/content/dam/email/en/offers/summer',
			title: 'Summer',
			etag: '"1"',
			created: { at: '2026-01-01T00:00:00Z', by: 'admin' },
			modified: { at: '2026-01-02T00:00:00Z', by: 'admin' },
			model: { id: 'offer', title: 'Offer' },
			status: 'published',
			fields: [],
			references: [
				{
					fieldName: 'bannerImage',
					type: 'asset',
					status: 'APPROVED',
					path: '/content/dam/wknd-shared/en/adventures/surf-camp-in-costa-rica/adobestock-266405335.jpeg',
					assetId: 'urn:aaid:aem:5979b411-618a-4530-9680-5c39674903c0'
				}
			]
		};

		const normalized = normalizeCF(authorFragmentToCFFragment(offerFragment, dmEnv));

		expect(normalized.fields.bannerImage).toBe(
			'https://delivery-p125048-e1847106.adobeaemcloud.com/adobe/assets/urn:aaid:aem:5979b411-618a-4530-9680-5c39674903c0/as/adobestock-266405335.jpeg'
		);
	});
});

describe('authorFragmentToCFFragment — nested refs and assets', () => {
	it('hydrates heroOffer.bannerImage from references', () => {
		const offerFragment: AuthorFragment = {
			id: 'offer-id',
			path: '/content/dam/email/en/offers/hero-offer-1',
			title: 'Hero Offer',
			etag: '"1"',
			created: { at: '2026-01-01T00:00:00Z', by: 'admin' },
			modified: { at: '2026-01-02T00:00:00Z', by: 'admin' },
			model: { id: 'offer', title: 'Offer' },
			status: 'draft',
			fields: [
				{
					name: 'bannerImage',
					type: 'asset-reference',
					multiple: false,
					required: false,
					values: ['/content/dam/wknd-shared/en/surfer.jpg']
				},
				{
					name: 'title',
					type: 'text',
					multiple: false,
					required: false,
					values: ['Artic Surfing']
				}
			],
			references: [
				{
					fieldName: 'bannerImage',
					items: [
						{
							id: 'asset-id',
							path: '/content/dam/wknd-shared/en/surfer.jpg',
							type: 'asset',
							_publishUrl:
								'https://publish-p125048-e1847106.adobeaemcloud.com/content/dam/wknd-shared/en/surfer.jpg'
						}
					]
				}
			]
		};

		const email: AuthorFragment = {
			id: 'email-id',
			path: '/content/dam/email/en/campaigns/email-type-cf',
			title: 'Email',
			etag: '"1"',
			created: { at: '2026-01-01T00:00:00Z', by: 'admin' },
			modified: { at: '2026-01-02T00:00:00Z', by: 'admin' },
			model: { id: 'email', title: 'Email' },
			status: 'draft',
			fields: [
				{
					name: 'heroOffer',
					type: 'fragment-reference',
					multiple: false,
					required: false,
					values: [offerFragment.id]
				}
			],
			references: [
				{
					fieldName: 'heroOffer',
					items: [{ id: offerFragment.id, path: offerFragment.path, type: 'fragment', fragment: offerFragment }]
				}
			]
		};

		const normalized = normalizeCF(authorFragmentToCFFragment(email));
		const heroOffer = normalized.fields.heroOffer as Record<string, unknown>;

		expect(heroOffer.title).toBe('Artic Surfing');
		expect(heroOffer.bannerImage).toBe(
			'https://publish-p125048-e1847106.adobeaemcloud.com/content/dam/wknd-shared/en/surfer.jpg'
		);

		const { html } = resolve('<img src="{{{cf.heroOffer.bannerImage}}}" />', {
			cf: normalized.fields,
			profile: {},
			preserveProfile: false,
			static: {}
		});
		expect(html).toContain('publish-p125048-e1847106.adobeaemcloud.com');
	});
});
