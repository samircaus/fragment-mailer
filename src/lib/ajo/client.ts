// AJO Content Templates API client.
// v0: stub only. The import-HTML strategy has not been validated against the real API.
//
// TODO(decision): Verify the AJO Content Templates API supports importing raw HTML with
// embedded {{fragment id='...'}} CF reference syntax. If not, the export strategy changes.
// Current best guess based on AJO behavior:
//   {{fragment id='aem:UUID' result='cfN'}}{{cfN.fieldName}}
// This needs verification with an AJO sandbox before v1.

import type { AJOImportPayload, AJOImportResult } from './types.js';

export interface AJOClientOptions {
	imsOrg: string;
	sandboxName: string;
	accessToken: string;
	baseUrl?: string;
	mockMode?: boolean;
}

type Result<T> = { data: T; error?: never } | { error: string; data?: never };

const DEFAULT_BASE_URL = 'https://platform.adobe.io';

export async function importContentTemplate(
	payload: AJOImportPayload,
	opts: AJOClientOptions
): Promise<Result<AJOImportResult>> {
	if (opts.mockMode) {
		return {
			data: {
				id: `mock-template-${Date.now()}`,
				status: 'created',
				previewUrl: undefined
			}
		};
	}

	const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
	const url = `${baseUrl}/journey/contentTemplates`;

	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${opts.accessToken}`,
			'x-gw-ims-org-id': opts.imsOrg,
			'x-sandbox-name': opts.sandboxName
		},
		body: JSON.stringify(payload)
	});

	if (!res.ok) {
		const body = await res.text();
		return { error: `AJO import failed ${res.status}: ${body}` };
	}

	return { data: (await res.json()) as AJOImportResult };
}
