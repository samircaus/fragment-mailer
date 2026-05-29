import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContentTemplate } from '../src/lib/ajo/client.js';
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
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

		const { updateContentTemplate } = await import('../src/lib/ajo/client.js');
		const payload = buildAjoEmailHtmlTemplatePayload({
			name: 'Updated',
			html: '<p>updated</p>'
		});

		const result = await updateContentTemplate('existing-id', payload, env);

		expect(result.data).toEqual({ id: 'existing-id', status: 'updated' });
	});
});
