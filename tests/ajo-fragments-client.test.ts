import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	getFragment,
	listFragments,
	publishFragment,
	updateFragment,
	buildAjoExpressionFragmentPayload
} from '../src/lib/ajo/fragments-client.js';
import type { AppEnv } from '../src/lib/aem/env.js';

vi.mock('$lib/auth/ajo-token-provider.js', () => ({
	getAjoAccessToken: vi.fn(async () => 'test-access-token'),
	resetAjoAccessTokenCache: vi.fn()
}));

const env = {
	IMS_ORG_ID: 'TESTORG@AdobeOrg',
	IMS_CLIENT_ID: 'test-client-id',
	IMS_CLIENT_SECRET: 'test-client-secret',
	AJO_SANDBOX: 'prod'
} as AppEnv;

describe('listFragments', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('GETs /ajo/content/fragments with list accept header', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					items: [
						{
							id: 'frag-1',
							name: 'brand-footer',
							type: 'expression',
							status: 'PUBLISHED',
							channels: ['shared']
						}
					]
				}),
				{
					status: 200,
					headers: { 'content-type': 'application/vnd.adobe.ajo.fragment-list.v1.0+json' }
				}
			)
		);

		const result = await listFragments(env, { type: 'expression' });

		expect(result.data?.items).toHaveLength(1);
		expect(result.data?.items[0]?.name).toBe('brand-footer');
		expect(fetchMock).toHaveBeenCalledOnce();

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain('https://platform.adobe.io/ajo/content/fragments');
		expect(url).toContain('property=type%3D%3Dexpression');
		expect((init.headers as Record<string, string>).Accept).toBe(
			'application/vnd.adobe.ajo.fragment-list.v1.0+json'
		);
	});
});

describe('updateFragment', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('PUTs expression payload with fragment content type', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

		const payload = buildAjoExpressionFragmentPayload({
			name: 'brand-footer',
			expression: '© Acme Corp'
		});

		const result = await updateFragment('frag-1', payload, env, '"etag-1"');

		expect(result.data).toEqual({ updated: true });
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(init.method).toBe('PUT');
		expect((init.headers as Record<string, string>)['Content-Type']).toBe(
			'application/vnd.adobe.ajo.fragment.v1.0+json'
		);
		expect((init.headers as Record<string, string>)['If-Match']).toBe('"etag-1"');
	});
});

describe('publishFragment', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('POSTs to /fragments/publications', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));

		const result = await publishFragment('frag-1', env);

		expect(result.data).toEqual({ accepted: true });
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://platform.adobe.io/ajo/content/fragments/publications');
		expect(init.method).toBe('POST');
		expect(JSON.parse(String(init.body))).toEqual({ fragmentId: 'frag-1' });
	});
});

describe('getFragment', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns expression content and etag', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					id: 'frag-1',
					name: 'brand-footer',
					type: 'expression',
					status: 'DRAFT',
					channels: ['shared'],
					subType: 'HTML',
					fragment: { expression: '© Acme' }
				}),
				{
					status: 200,
					headers: {
						'content-type': 'application/vnd.adobe.ajo.fragment.v1.0+json',
						etag: '"v1"'
					}
				}
			)
		);

		const result = await getFragment('frag-1', env);

		expect(result.data?.fragment.expression).toBe('© Acme');
		expect(result.data?.etag).toBe('"v1"');
	});
});
