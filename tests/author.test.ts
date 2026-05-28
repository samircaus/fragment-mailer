import { describe, expect, it } from 'vitest';
import { authorFragmentToCFFragment, authorFragmentToListItem } from '../src/lib/aem/author-map.js';
import { aemFetchMode, aemTier } from '../src/lib/aem/env.js';
import { parseOAuthJson } from '../src/lib/auth/oauth-config.js';
import type { AuthorFragment } from '../src/lib/types/aem.js';

describe('aemTier', () => {
	it('defaults to publish', () => {
		expect(aemTier({})).toBe('publish');
		expect(aemTier({ AEM_TIER: 'publish' })).toBe('publish');
	});

	it('selects author', () => {
		expect(aemTier({ AEM_TIER: 'author' })).toBe('author');
	});
});

describe('aemFetchMode on author', () => {
	it('forces openapi semantics (not graphql)', () => {
		expect(aemFetchMode({ AEM_TIER: 'author', AEM_FETCH_MODE: 'graphql' })).toBe('openapi');
	});
});

describe('parseOAuthJson', () => {
	it('reads Postman-style export', () => {
		const creds = parseOAuthJson(
			JSON.stringify({
				values: [
					{ key: 'API_KEY', value: 'cid' },
					{ key: 'CLIENT_SECRET', value: 'secret' },
					{ key: 'IMS', value: 'ims-na1.adobelogin.com' },
					{ key: 'SCOPES', value: ['openid', 'aem.fragments.management'] }
				]
			})
		);
		expect(creds?.clientId).toBe('cid');
		expect(creds?.clientSecret).toBe('secret');
		expect(creds?.imsHost).toBe('https://ims-na1.adobelogin.com');
		expect(creds?.scopes).toContain('aem.fragments.management');
	});
});

describe('authorFragment mapping', () => {
	const fragment: AuthorFragment = {
		id: '86820fdc-14c3-4079-8a11-d04dcd2f058d',
		path: '/content/dam/email/en/campaigns/welcome',
		title: 'Welcome',
		etag: '"1"',
		created: { at: '2026-01-01T00:00:00Z', by: 'admin' },
		modified: { at: '2026-01-02T00:00:00Z', by: 'admin' },
		model: { id: 'email-campaign', title: 'Email Campaign' },
		status: 'draft',
		fields: [
			{ name: 'heroHeadline', type: 'text', multiple: false, required: false, values: ['Hello'] }
		]
	};

	it('maps list item', () => {
		const item = authorFragmentToListItem(fragment);
		expect(item.id).toBe(fragment.id);
		expect(item.path).toBe(fragment.path);
		expect(item.modified).toBe('2026-01-02T00:00:00Z');
	});

	it('maps CF fragment fields', () => {
		const cf = authorFragmentToCFFragment(fragment);
		expect(cf._path).toBe(fragment.path);
		expect(cf.heroHeadline).toBe('Hello');
	});
});
