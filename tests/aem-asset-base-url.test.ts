import { describe, expect, it } from 'vitest';
import { aemAssetBaseUrl } from '../src/lib/aem/env.js';

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
});
