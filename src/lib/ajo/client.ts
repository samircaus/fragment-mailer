// AJO Journey Content Templates API client.
//
// TODO(spike): Verify request body shape, x-sandbox-name vs x-sandbox-id, and whether
// inline fragment(id='aem:UUID?repoId=...') survives API push — compare with DevTools
// capture from AJO UI when creating an email template with an AEM CF reference.

import { getAjoAccessToken, resetAjoAccessTokenCache } from '$lib/auth/ajo-token-provider.js';
import type { AppEnv } from '$lib/aem/env.js';
import { ajoSandboxName } from '$lib/aem/env.js';
import type { AJOContentTemplatePayload, AJOContentTemplateResult } from './types.js';

export interface AJOClientOptions {
	imsOrg: string;
	sandboxName: string;
	apiKey: string;
	accessToken: string;
	baseUrl?: string;
	mockMode?: boolean;
}

type Result<T> = { data: T; error?: never } | { error: string; data?: never; status?: number };

const DEFAULT_BASE_URL = 'https://platform.adobe.io';
const TEMPLATES_PATH = '/journey/authoring/content/templates';

const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 3;

export async function createContentTemplate(
	payload: AJOContentTemplatePayload,
	env: AppEnv
): Promise<Result<AJOContentTemplateResult>> {
	return upsertContentTemplate(payload, env);
}

export async function updateContentTemplate(
	templateId: string,
	payload: AJOContentTemplatePayload,
	env: AppEnv
): Promise<Result<AJOContentTemplateResult>> {
	return upsertContentTemplate(payload, env, templateId);
}

export async function upsertContentTemplate(
	payload: AJOContentTemplatePayload,
	env: AppEnv,
	templateId?: string
): Promise<Result<AJOContentTemplateResult>> {
	const creds = env.AJO_IMS_CLIENT_ID;
	if (env.MOCK_MODE === 'true' || !creds) {
		return {
			data: {
				id: templateId ?? `mock-template-${Date.now()}`,
				status: templateId ? 'updated' : 'created'
			}
		};
	}

	let token: string;
	try {
		token = await getAjoAccessToken(env);
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e), status: 401 };
	}

	const opts: AJOClientOptions = {
		imsOrg: env.IMS_ORG_ID ?? '',
		sandboxName: ajoSandboxName(env),
		apiKey: env.AJO_IMS_CLIENT_ID ?? '',
		accessToken: token
	};

	const method = templateId ? 'PUT' : 'POST';
	const path = templateId ? `${TEMPLATES_PATH}/${encodeURIComponent(templateId)}` : TEMPLATES_PATH;

	return requestWithRetry(method, path, payload, opts, env);
}

async function requestWithRetry(
	method: string,
	path: string,
	payload: AJOContentTemplatePayload,
	opts: AJOClientOptions,
	env: AppEnv,
	retried401 = false,
	attempt = 0
): Promise<Result<AJOContentTemplateResult>> {
	const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
	const url = `${baseUrl}${path}`;

	const res = await fetch(url, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			Authorization: `Bearer ${opts.accessToken}`,
			'x-api-key': opts.apiKey,
			'x-gw-ims-org-id': opts.imsOrg,
			'x-sandbox-name': opts.sandboxName
		},
		body: JSON.stringify(payload)
	});

	if (res.status === 401 && !retried401) {
		resetAjoAccessTokenCache();
		try {
			opts.accessToken = await getAjoAccessToken(env);
		} catch {
			const body = await res.text();
			return { error: `AJO unauthorized: ${body}`, status: 401 };
		}
		return requestWithRetry(method, path, payload, opts, env, true, attempt);
	}

	if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
		const delayMs = 2 ** attempt * 500;
		await sleep(delayMs);
		return requestWithRetry(method, path, payload, opts, env, retried401, attempt + 1);
	}

	if (!res.ok) {
		const body = await res.text();
		if (res.status === 403) {
			return {
				error: `AJO forbidden (check sandbox "${opts.sandboxName}" and API permissions): ${body}`,
				status: 403
			};
		}
		if (res.status === 409) {
			return {
				error: `AJO template name conflict: ${body}`,
				status: 409
			};
		}
		return { error: `AJO ${method} failed ${res.status}: ${body}`, status: res.status };
	}

	const json = (await res.json()) as Record<string, unknown>;
	const id =
		(typeof json.id === 'string' && json.id) ||
		(typeof json.templateId === 'string' && json.templateId) ||
		'';

	return {
		data: {
			id,
			status: method === 'PUT' ? 'updated' : 'created'
		}
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
