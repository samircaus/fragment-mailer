// AJO Journey Content Templates API client.
//
// TODO(spike): Verify request body shape, x-sandbox-name vs x-sandbox-id, and whether
// inline fragment(id='aem:UUID?repoId=...') survives API push — compare with DevTools
// capture from AJO UI when creating an email template with an AEM CF reference.

import { getAjoAccessToken, resetAjoAccessTokenCache } from '$lib/auth/ajo-token-provider.js';
import type { AppEnv } from '$lib/aem/env.js';
import { ajoImsClientId, ajoSandboxName } from '$lib/aem/env.js';
import type { AJOContentTemplatePayload, AJOContentTemplateResult } from './types.js';

export interface AJOClientOptions {
	imsOrg: string;
	sandboxName: string;
	apiKey: string;
	accessToken: string;
	baseUrl?: string;
}

export interface AjoRequestFailure {
	method: string;
	url: string;
	path: string;
	baseUrl: string;
	status?: number;
	statusText?: string;
	responseBody?: string;
	responseHeaders?: Record<string, string>;
	request?: {
		templateId?: string;
		payloadName?: string;
		channel?: string;
		contentType?: string;
		bodyLength?: number;
	};
	attempt?: number;
	retried401?: boolean;
	reason?: string;
	stack?: string;
}

type Result<T> =
	| { data: T; error?: never; failure?: never }
	| { error: string; data?: never; status?: number; failure?: AjoRequestFailure };

const DEFAULT_BASE_URL = 'https://platform.adobe.io';
const TEMPLATES_PATH = '/ajo/content/templates';

const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 3;

function formatErrorStack(err: unknown): string | undefined {
	if (err instanceof Error && err.stack) return err.stack;
	if (err instanceof Error) return err.message;
	if (typeof err === 'string') return err;
	return undefined;
}

function pickResponseHeaders(res: Response): Record<string, string> {
	const out: Record<string, string> = {};
	for (const key of [
		'content-type',
		'x-request-id',
		'x-correlation-id',
		'x-adobe-status',
		'x-adobe-error',
		'date'
	]) {
		const v = res.headers.get(key);
		if (v) out[key] = v;
	}
	return out;
}

function payloadMeta(payload: AJOContentTemplatePayload, templateId?: string) {
	return {
		templateId,
		payloadName: payload.name,
		channel: payload.channel,
		contentType: payload.contentType,
		bodyLength: payload.body?.length ?? 0
	};
}

function logAjoFailure(
	message: string,
	failure: AjoRequestFailure,
	extras?: Record<string, unknown>
): void {
	console.error(
		JSON.stringify({
			event: 'ajo_request_failed',
			timestamp: new Date().toISOString(),
			message,
			...failure,
			...extras
		})
	);
}

function failResult(
	message: string,
	status: number | undefined,
	failure: AjoRequestFailure
): Result<AJOContentTemplateResult> {
	return { error: message, status, failure };
}

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
	if (!ajoImsClientId(env)) {
		return {
			error: 'AJO credentials not configured (AJO_IMS_CLIENT_ID or IMS_CLIENT_ID).',
			status: 503
		};
	}

	let token: string;
	try {
		token = await getAjoAccessToken(env);
	} catch (e) {
		const errMsg = e instanceof Error ? e.message : String(e);
		const stack = formatErrorStack(e);
		const method = templateId ? 'PUT' : 'POST';
		const path = templateId
			? `${TEMPLATES_PATH}/${encodeURIComponent(templateId)}`
			: TEMPLATES_PATH;
		const failure: AjoRequestFailure = {
			method,
			url: `${DEFAULT_BASE_URL}${path}`,
			path,
			baseUrl: DEFAULT_BASE_URL,
			reason: 'token_fetch',
			stack,
			request: payloadMeta(payload, templateId)
		};
		logAjoFailure(`AJO token fetch failed: ${errMsg}`, failure);
		return failResult(errMsg, 401, failure);
	}

	const opts: AJOClientOptions = {
		imsOrg: env.IMS_ORG_ID ?? '',
		sandboxName: ajoSandboxName(env),
		apiKey: ajoImsClientId(env) ?? '',
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
	const reqMeta = payloadMeta(payload);

	let res: Response;
	try {
		res = await fetch(url, {
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
	} catch (e) {
		const errMsg = e instanceof Error ? e.message : String(e);
		const stack = formatErrorStack(e);
		const failure: AjoRequestFailure = {
			method,
			url,
			path,
			baseUrl,
			reason: 'network_error',
			stack,
			request: reqMeta,
			attempt,
			retried401
		};
		logAjoFailure(`${method} ${url} network error: ${errMsg}`, failure);
		return failResult(`AJO ${method} network error: ${errMsg}`, 502, failure);
	}

	if (res.status === 401 && !retried401) {
		resetAjoAccessTokenCache();
		try {
			opts.accessToken = await getAjoAccessToken(env);
		} catch (e) {
			const body = await res.text();
			const stack = formatErrorStack(e);
			const failure: AjoRequestFailure = {
				method,
				url,
				path,
				baseUrl,
				status: res.status,
				statusText: res.statusText,
				responseBody: body,
				responseHeaders: pickResponseHeaders(res),
				reason: 'token_refresh_failed',
				stack,
				request: reqMeta,
				attempt,
				retried401
			};
			const msg = `${method} ${url} unauthorized (token refresh failed): HTTP ${res.status} ${res.statusText}`;
			logAjoFailure(msg, failure, { sandboxName: opts.sandboxName, imsOrg: opts.imsOrg });
			return failResult(`AJO unauthorized: ${body}`, 401, failure);
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
		const failure: AjoRequestFailure = {
			method,
			url,
			path,
			baseUrl,
			status: res.status,
			statusText: res.statusText,
			responseBody: body,
			responseHeaders: pickResponseHeaders(res),
			request: reqMeta,
			attempt,
			retried401
		};
		const httpSummary = `HTTP ${res.status} ${res.statusText}`;
		const logExtras = { sandboxName: opts.sandboxName, imsOrg: opts.imsOrg };

		if (res.status === 403) {
			failure.reason = 'forbidden';
			const msg = `${method} ${url} failed with ${httpSummary} (forbidden — check sandbox "${opts.sandboxName}" and API permissions)`;
			logAjoFailure(msg, failure, logExtras);
			return failResult(
				`AJO forbidden (check sandbox "${opts.sandboxName}" and API permissions): ${body}`,
				403,
				failure
			);
		}
		if (res.status === 409) {
			failure.reason = 'name_conflict';
			const msg = `${method} ${url} failed with ${httpSummary} (template name conflict)`;
			logAjoFailure(msg, failure, logExtras);
			return failResult(`AJO template name conflict: ${body}`, 409, failure);
		}
		failure.reason = 'http_error';
		const msg = `${method} ${url} failed with ${httpSummary}`;
		logAjoFailure(msg, failure, logExtras);
		return failResult(`AJO ${method} failed ${res.status}: ${body}`, res.status, failure);
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
