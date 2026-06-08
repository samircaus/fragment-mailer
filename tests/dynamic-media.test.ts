import { describe, expect, it } from 'vitest';
import {
	buildDynamicMediaUrl,
	dynamicMediaUrlFromAsset,
	formatFromAssetPath,
	isAssetDeliverableForDynamicMedia,
	normalizeAssetId,
	publishAssetUrlFromPath,
	resolveAssetImageUrl,
	seoNameFromAssetPath
} from '../src/lib/aem/dynamic-media.js';
import { deliveryHostFromEnv, useDynamicMedia } from '../src/lib/aem/env.js';
import { normalizeFragmentFields } from '../src/lib/aem/normalize-fields.js';
import { applyDynamicMediaImageUrls } from '../src/lib/render/ajo-dynamic-media.js';
import type { AuthorFragment } from '../src/lib/types/aem.js';

const ASSET_URN = 'urn:aaid:aem:0a630f45-e14f-4c83-88c6-0a1a71158051';
const DELIVERY_HOST = 'delivery-p61861-e499051.adobeaemcloud.com';

const dmEnv = {
	USE_DYNAMIC_MEDIA: 'true',
	AEM_DELIVERY_HOST: `https://${DELIVERY_HOST}`
};

describe('dynamic media URL builder', () => {
	it('builds the documented SEO asset URL pattern', () => {
		expect(
			buildDynamicMediaUrl({
				deliveryHost: DELIVERY_HOST,
				assetId: ASSET_URN,
				seoName: 'image',
				format: 'png'
			})
		).toBe(
			`https://${DELIVERY_HOST}/adobe/assets/${ASSET_URN}/as/image.png`
		);
	});

	it('derives seo name and format from DAM path', () => {
		expect(seoNameFromAssetPath('/content/dam/wknd-shared/en/surfer.jpg')).toBe('surfer');
		expect(formatFromAssetPath('/content/dam/wknd-shared/en/surfer.jpg')).toBe('jpg');
		expect(formatFromAssetPath('/content/dam/wknd-shared/en/hero.jpeg')).toBe('jpeg');
	});

	it('skips Dynamic Media for DRAFT assets', () => {
		expect(isAssetDeliverableForDynamicMedia({ status: 'DRAFT' })).toBe(false);
		expect(isAssetDeliverableForDynamicMedia({ status: 'APPROVED' })).toBe(true);
		expect(
			resolveAssetImageUrl(
				{
					status: 'DRAFT',
					assetId: ASSET_URN,
					path: '/content/dam/email/en/hero.jpeg'
				},
				{
					...dmEnv,
					AEM_PUBLISH_HOST: 'https://publish.example.com'
				}
			)
		).toBe('https://publish.example.com/content/dam/email/en/hero.jpeg');
	});

	it('normalizes UUID asset ids to AEM URNs', () => {
		expect(normalizeAssetId('0a630f45-e14f-4c83-88c6-0a1a71158051')).toBe(ASSET_URN);
		expect(normalizeAssetId(ASSET_URN)).toBe(ASSET_URN);
	});

	it('derives delivery host from publish host when unset', () => {
		expect(
			deliveryHostFromEnv({
				USE_DYNAMIC_MEDIA: 'true',
				AEM_PUBLISH_HOST: 'https://publish-p61861-e499051.adobeaemcloud.com'
			})
		).toBe(DELIVERY_HOST);
	});

	it('builds asset URLs only when USE_DYNAMIC_MEDIA is enabled', () => {
		expect(useDynamicMedia({ USE_DYNAMIC_MEDIA: 'false' })).toBe(false);
		expect(useDynamicMedia({ USE_DYNAMIC_MEDIA: 'true' })).toBe(true);

		const asset = {
			id: ASSET_URN,
			path: '/content/dam/email/en/image.png',
			type: 'asset' as const
		};

		expect(dynamicMediaUrlFromAsset(asset, dmEnv)).toBe(
			`https://${DELIVERY_HOST}/adobe/assets/${ASSET_URN}/as/image.png`
		);
		expect(dynamicMediaUrlFromAsset(asset, { USE_DYNAMIC_MEDIA: 'false' })).toBeUndefined();
	});
});

describe('normalizeFragmentFields with dynamic media', () => {
	it('prefers Dynamic Media URLs over publish URLs when enabled', () => {
		const fields = normalizeFragmentFields(
			{
				bannerImage: {
					assetId: ASSET_URN,
					_path: '/content/dam/email/en/hero-banner.jpg',
					_publishUrl: 'https://publish.example.com/hero-banner.jpg'
				}
			},
			dmEnv
		);

		expect(fields.bannerImage).toBe(
			`https://${DELIVERY_HOST}/adobe/assets/${ASSET_URN}/as/hero-banner.jpg`
		);
	});

	it('builds publish fallback from DAM path', () => {
		expect(
			publishAssetUrlFromPath('/content/dam/test.jpg', {
				AEM_PUBLISH_HOST: 'https://publish.example.com'
			})
		).toBe('https://publish.example.com/content/dam/test.jpg');
	});
});

describe('applyDynamicMediaImageUrls — AJO export', () => {
	const offerFragment: AuthorFragment = {
		id: 'offer-id',
		path: '/content/dam/offers/hero-offer',
		title: 'Hero Offer',
		etag: '"1"',
		created: { at: '2026-01-01T00:00:00Z', by: 'admin' },
		modified: { at: '2026-01-02T00:00:00Z', by: 'admin' },
		model: { id: 'offer', title: 'Offer' },
		status: 'draft',
		fields: [],
		references: [
			{
				fieldName: 'bannerImage',
				items: [
					{
						id: ASSET_URN,
						path: '/content/dam/email/en/hero.png',
						type: 'asset',
						_publishUrl: 'https://publish.example.com/hero.png'
					}
				]
			}
		]
	};

	const campaign: AuthorFragment = {
		id: 'campaign-id',
		path: '/content/dam/email/en/campaigns/test',
		title: 'Test',
		etag: '"1"',
		created: { at: '2026-01-01T00:00:00Z', by: 'admin' },
		modified: { at: '2026-01-02T00:00:00Z', by: 'admin' },
		model: { id: 'email', title: 'Email' },
		status: 'draft',
		fields: [],
		references: [
			{
				fieldName: 'heroOffer',
				items: [{ id: offerFragment.id, path: offerFragment.path, type: 'fragment', fragment: offerFragment }]
			}
		]
	};

	it('replaces image src personalization tokens with Dynamic Media URLs', () => {
		const html = '<img src="{{heroOffer.bannerImage}}" alt="x" />';
		const loadTags = [
			{
				raw: "{% load heroOffer as fragment ref='cf.heroOffer' %}",
				varName: 'heroOffer',
				refExpression: 'cf.heroOffer',
				index: 0
			}
		];

		const out = applyDynamicMediaImageUrls(html, campaign, loadTags, dmEnv);
		expect(out).toBe(
			`<img src="https://${DELIVERY_HOST}/adobe/assets/${ASSET_URN}/as/hero.png" alt="x" />`
		);
	});

	it('leaves tokens unchanged when dynamic media is disabled', () => {
		const html = '<img src="{{heroOffer.bannerImage}}" />';
		const loadTags = [
			{
				raw: '',
				varName: 'heroOffer',
				refExpression: 'cf.heroOffer',
				index: 0
			}
		];

		expect(applyDynamicMediaImageUrls(html, campaign, loadTags, { USE_DYNAMIC_MEDIA: 'false' })).toBe(
			html
		);
	});
});
