import { describe, expect, it } from 'vitest';
import { publishHostRepoId } from '../src/lib/aem/env.js';

describe('publishHostRepoId', () => {
	it('prefers AEM_PUBLISH_HOST', () => {
		expect(
			publishHostRepoId({
				AEM_PUBLISH_HOST: 'https://publish-p125048-e1847106.adobeaemcloud.com',
				AEM_BASE_URL: 'https://author-p125048-e1847106.adobeaemcloud.com'
			})
		).toBe('publish-p125048-e1847106.adobeaemcloud.com');
	});

	it('derives publish host from author AEM_BASE_URL when publish host is unset', () => {
		expect(
			publishHostRepoId({
				AEM_BASE_URL: 'https://author-p125048-e1847106.adobeaemcloud.com'
			})
		).toBe('publish-p125048-e1847106.adobeaemcloud.com');
	});

	it('uses publish AEM_BASE_URL as-is', () => {
		expect(
			publishHostRepoId({
				AEM_BASE_URL: 'https://publish.example.com/'
			})
		).toBe('publish.example.com');
	});
});
