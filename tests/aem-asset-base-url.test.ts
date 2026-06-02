import { describe, expect, it } from 'vitest';
import { aemAssetBaseUrl, derivePublishOriginFromAuthor } from '../src/lib/aem/env.js';

describe('derivePublishOriginFromAuthor', () => {
	it('maps author host to publish host', () => {
		expect(
			derivePublishOriginFromAuthor('https://author-p125048-e1847106.adobeaemcloud.com')
		).toBe('https://publish-p125048-e1847106.adobeaemcloud.com');
	});

	it('returns null for non-author hosts', () => {
		expect(derivePublishOriginFromAuthor('https://publish.example.com')).toBeNull();
	});
});

describe('aemAssetBaseUrl', () => {
	it('uses publish host when tier is author', () => {
		expect(
			aemAssetBaseUrl({
				AEM_TIER: 'author',
				AEM_BASE_URL: 'https://author-p125048-e1847106.adobeaemcloud.com'
			})
		).toBe('https://publish-p125048-e1847106.adobeaemcloud.com');
	});

	it('prefers explicit AEM_PUBLISH_HOST', () => {
		expect(
			aemAssetBaseUrl({
				AEM_TIER: 'author',
				AEM_BASE_URL: 'https://author-p125048-e1847106.adobeaemcloud.com',
				AEM_PUBLISH_HOST: 'https://publish-custom.example.com'
			})
		).toBe('https://publish-custom.example.com');
	});

	it('prefers UE session publish host over env', () => {
		expect(
			aemAssetBaseUrl(
				{
					AEM_TIER: 'author',
					AEM_BASE_URL: 'https://author-p125048-e1847106.adobeaemcloud.com',
					AEM_PUBLISH_HOST: 'https://publish-custom.example.com'
				},
				'https://publish-from-ue.example.com'
			)
		).toBe('https://publish-from-ue.example.com');
	});
});
