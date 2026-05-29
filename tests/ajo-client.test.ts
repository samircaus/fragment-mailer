import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContentTemplate, listContentTemplates } from '../src/lib/ajo/client.js';
import { buildAjoEmailHtmlTemplatePayload } from '../src/lib/ajo/types.js';
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

describe('listContentTemplates', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('GETs /ajo/content/templates with list accept header', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					items: [
						{
							id: 'tpl-1',
							name: 'welcome-email',
							templateType: 'html',
							channels: ['email'],
							source: { origin: 'ajo' }
						}
					]
				}),
				{
					status: 200,
					headers: { 'content-type': 'application/vnd.adobe.ajo.template-list.v1+json' }
				}
			)
		);

		const result = await listContentTemplates(env, { channel: 'email' });

		expect(result.data?.items).toHaveLength(1);
		expect(result.data?.items[0]?.name).toBe('welcome-email');
		expect(fetchMock).toHaveBeenCalledOnce();

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain('https://platform.adobe.io/ajo/content/templates');
		expect(url).toContain('property=channels%3D%3Demail');
		expect((init.headers as Record<string, string>).Accept).toBe(
			'application/vnd.adobe.ajo.template-list.v1+json'
		);
	});
});

describe('createContentTemplate', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('POSTs with AJO content-type and template payload shape', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(null, {
				status: 201,
				headers: {
					'x-resource-id': 'tpl-123'
				}
			})
		);

		const payload = buildAjoEmailHtmlTemplatePayload({
			name: 'Test Template',
			html: '<p>hello</p>'
		});

		const result = await createContentTemplate(payload, env);

		expect(result.data).toEqual({ id: 'tpl-123', status: 'created' });
		expect(fetchMock).toHaveBeenCalledOnce();

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://platform.adobe.io/ajo/content/templates');
		expect(init.method).toBe('POST');

		const headers = init.headers as Record<string, string>;
		expect(headers['Content-Type']).toBe('application/vnd.adobe.ajo.template.v1+json');
		expect(headers.Accept).toBeUndefined();
		expect(headers.Authorization).toBe('Bearer test-access-token');
		expect(headers['x-api-key']).toBe('test-client-id');
		expect(headers['x-gw-ims-org-id']).toBe('TESTORG@AdobeOrg');
		expect(headers['x-sandbox-name']).toBe('prod');

		expect(JSON.parse(String(init.body))).toEqual(payload);
	});

	it('returns updated id from path on PUT 204', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'existing-id',
						name: 'Updated'
					}),
					{
						status: 200,
						headers: {
							'content-type': 'application/vnd.adobe.ajo.template.v1+json',
							etag: '"v1"'
						}
					}
				)
			)
			.mockResolvedValueOnce(new Response(null, { status: 204 }));

		const { updateContentTemplate } = await import('../src/lib/ajo/client.js');
		const payload = buildAjoEmailHtmlTemplatePayload({
			name: 'Updated',
			html: '<p>updated</p>'
		});

		const result = await updateContentTemplate('existing-id', payload, env);

		expect(result.data).toEqual({ id: 'existing-id', status: 'updated' });
		expect(fetchMock).toHaveBeenCalledTimes(2);

		const [getUrl, getInit] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(getUrl).toBe('https://platform.adobe.io/ajo/content/templates/existing-id');
		expect(getInit.method).toBe('GET');

		const [, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
		expect(putInit.method).toBe('PUT');
		expect((putInit.headers as Record<string, string>)['If-Match']).toBe('"v1"');
	});

	it('handles 201 with empty JSON body and x-resource-id header', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response('', {
				status: 201,
				headers: {
					'content-type': 'application/json',
					'x-resource-id': 'tpl-from-header'
				}
			})
		);

		const payload = buildAjoEmailHtmlTemplatePayload({
			name: 'Empty body template',
			html: '<p>hello</p>'
		});

		const result = await createContentTemplate(payload, env);

		expect(result.data).toEqual({ id: 'tpl-from-header', status: 'created' });
		expect(result.error).toBeUndefined();
	});
});

describe('updateContentTemplate', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('retries PUT once after JOMAL-1101 version conflict', async () => {
		const conflictBody = JSON.stringify({
			type: 'https://ns.adobe.com/aep/errors/JOMAL-1101-409',
			title: 'Save failed because this item was updated in another tab or by another user.'
		});

		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'existing-id', name: 'T' }), {
					status: 200,
					headers: { etag: '"v1"' }
				})
			)
			.mockResolvedValueOnce(new Response(conflictBody, { status: 409 }))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'existing-id', name: 'T' }), {
					status: 200,
					headers: { etag: '"v2"' }
				})
			)
			.mockResolvedValueOnce(new Response(null, { status: 204 }));

		const { updateContentTemplate } = await import('../src/lib/ajo/client.js');
		const payload = buildAjoEmailHtmlTemplatePayload({
			name: 'T',
			html: '<p>x</p>'
		});

		const result = await updateContentTemplate('existing-id', payload, env);

		expect(result.data).toEqual({ id: 'existing-id', status: 'updated' });
		expect(fetchMock).toHaveBeenCalledTimes(4);

		const [, retryPutInit] = fetchMock.mock.calls[3] as [string, RequestInit];
		expect((retryPutInit.headers as Record<string, string>)['If-Match']).toBe('"v2"');
	});
});
