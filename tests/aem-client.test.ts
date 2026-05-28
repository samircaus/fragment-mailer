import { describe, expect, it } from 'vitest';
import { normalizeCF } from '../src/lib/aem/client.js';
import type { CFFragment } from '../src/lib/aem/types.js';

describe('normalizeCF', () => {
	it('keeps model fields like title and strips system id fields', () => {
		const fragment: CFFragment = {
			_path: '/content/dam/email/en/campaigns/test-email',
			_model: {
				_path: '/conf/email/settings/dam/cfm/models/offer',
				title: 'Offer'
			},
			_variation: 'master',
			_metadata: {
				stringMetadata: [{ name: 'cq:lastModified', value: '2026-05-28T08:53:23.926Z' }]
			},
			title: 'Persoenliche Beratung',
			emailCopy: {
				html: '<p>Example</p>'
			},
			id: '3027e723-a493-4b18-815d-d7c379847f5b'
		};

		const normalized = normalizeCF(fragment);

		expect(normalized.fields.title).toBe('Persoenliche Beratung');
		expect(normalized.fields.emailCopy).toEqual({ html: '<p>Example</p>' });
		expect(normalized.fields.emailCopyHtml).toBe('<p>Example</p>');
		expect(normalized.fields.id).toBeUndefined();
	});

	it('normalizes string rich text and string image path fields', () => {
		const fragment: CFFragment = {
			_path: '/content/dam/email/en/campaigns/test-email',
			_model: {
				_path: '/conf/email/settings/dam/cfm/models/offer',
				title: 'Offer'
			},
			_variation: 'master',
			_metadata: {
				stringMetadata: [{ name: 'cq:lastModified', value: '2026-05-28T08:53:23.926Z' }]
			},
			title: 'Persoenliche Beratung',
			emailCopy: '<p>String HTML</p>',
			bannerImage: '/content/dam/wknd-shared/en/example.jpg'
		};

		const normalized = normalizeCF(fragment);

		expect(normalized.fields.emailCopyHtml).toBe('<p>String HTML</p>');
		expect(normalized.fields.bannerImageUrl).toBe('/content/dam/wknd-shared/en/example.jpg');
	});
});
