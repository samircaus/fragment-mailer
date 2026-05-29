// AJO Journey Content Templates API client.
//
// TODO(spike): Verify whether inline fragment(id='aem:UUID?repoId=...') survives API push —
// compare with DevTools capture from AJO UI when creating an email template with an AEM CF reference.
// PUT updates fetch the template etag (GET) and send If-Match on the update request.

import { getAjoAccessToken, resetAjoAccessTokenCache } from '$lib/auth/ajo-token-provider.js';
import type { AppEnv } from '$lib/aem/env.js';
import { ajoImsClientId, ajoSandboxName } from '$lib/aem/env.js';
import {
	AJO_TEMPLATE_CONTENT_TYPE,
	AJO_TEMPLATE_LIST_CONTENT_TYPE,
	type AJOContentTemplateDetail,
	type AJOContentTemplatePayload,
	type AJOContentTemplateResult,
	type AjoContentTemplateListItem,
	type AjoContentTemplatePage
} from './types.js';

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
		templateType?: string;
		channels?: string[];
		htmlLength?: number;
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
		'etag',
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
		templateType: payload.templateType,
		channels: payload.channels,
		htmlLength: payload.template.html?.length ?? 0
	};
}

function templateIdFromPath(path: string): string | undefined {
	const match = path.match(/\/templates\/([^/?]+)$/);
	return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function templateIdFromLocation(location: string): string | undefined {
	const trimmed = location.trim();
	if (!trimmed) return undefined;
	try {
		const url = new URL(trimmed, DEFAULT_BASE_URL);
		return templateIdFromPath(url.pathname);
	} catch {
		return templateIdFromPath(trimmed.startsWith('/') ? trimmed : `/${trimmed}`);
	}
}

async function parseSuccessResponse(
	res: Response,
	method: string,
	path: string
): Promise<AJOContentTemplateResult> {
	const status = method === 'PUT' ? 'updated' : 'created';
	const pathTemplateId = templateIdFromPath(path);

	if (res.status === 204) {
		return { id: pathTemplateId ?? '', status };
	}

	const headerId =
		res.headers.get('x-resource-id')?.trim() ||
		(res.headers.get('location') && templateIdFromLocation(res.headers.get('location')!)) ||
		'';

	const contentType = res.headers.get('content-type') ?? '';
	if (contentType.includes('json')) {
		const bodyText = (await res.text()).trim();
		if (bodyText) {
			try {
				const json = JSON.parse(bodyText) as Record<string, unknown>;
				const id =
					headerId ||
					(typeof json.id === 'string' && json.id) ||
					(typeof json.templateId === 'string' && json.templateId) ||
					pathTemplateId ||
					'';
				return { id, status };
			} catch {
				// fall through to header/path id
			}
		}
	}

	return { id: headerId || pathTemplateId || '', status };
}

function mapTemplateListItem(raw: Record<string, unknown>): AjoContentTemplateListItem {
	const source =
		raw.source && typeof raw.source === 'object'
			? (raw.source as { origin?: string }).origin
			: undefined;

	return {
		id: typeof raw.id === 'string' ? raw.id : '',
		name: typeof raw.name === 'string' ? raw.name : '',
		description: typeof raw.description === 'string' ? raw.description : undefined,
		templateType: typeof raw.templateType === 'string' ? raw.templateType : 'html',
		channels: Array.isArray(raw.channels) ? raw.channels.map(String) : [],
		origin: source,
		modifiedAt: typeof raw.modifiedAt === 'string' ? raw.modifiedAt : undefined,
		createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined
	};
}

export async function listContentTemplates(
	env: AppEnv,
	opts?: { limit?: number; channel?: 'email' },
	retried401 = false
): Promise<Result<AjoContentTemplatePage>> {
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
		return { error: errMsg, status: 401 };
	}

	const client: AJOClientOptions = {
		imsOrg: env.IMS_ORG_ID ?? '',
		sandboxName: ajoSandboxName(env),
		apiKey: ajoImsClientId(env) ?? '',
		accessToken: token
	};

	const params = new URLSearchParams();
	params.set('limit', String(opts?.limit ?? 100));
	params.set('orderBy', '-modifiedAt');
	if (opts?.channel) {
		params.set('property', `channels==${opts.channel}`);
	}

	const path = `${TEMPLATES_PATH}?${params}`;
	const baseUrl = client.baseUrl ?? DEFAULT_BASE_URL;
	const url = `${baseUrl}${path}`;

	let res: Response;
	try {
		res = await fetch(url, {
			method: 'GET',
			headers: {
				Accept: AJO_TEMPLATE_LIST_CONTENT_TYPE,
				Authorization: `Bearer ${client.accessToken}`,
				'x-api-key': client.apiKey,
				'x-gw-ims-org-id': client.imsOrg,
				'x-sandbox-name': client.sandboxName
			}
		});
	} catch (e) {
		const errMsg = e instanceof Error ? e.message : String(e);
		return { error: `AJO GET network error: ${errMsg}`, status: 502 };
	}

	if (res.status === 401 && !retried401) {
		resetAjoAccessTokenCache();
		return listContentTemplates(env, opts, true);
	}

	if (!res.ok) {
		const body = await res.text();
		return { error: `AJO GET failed ${res.status}: ${body}`, status: res.status };
	}

	const raw = (await res.json()) as Record<string, unknown>;
	const items = Array.isArray(raw.items)
		? raw.items.map((item) => mapTemplateListItem(item as Record<string, unknown>))
		: [];
	const nextHref =
		raw._links &&
		typeof raw._links === 'object' &&
		raw._links !== null &&
		'next' in raw._links
			? (raw._links as { next?: { href?: string } }).next?.href
			: undefined;

	return { data: { items, next: nextHref } };
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

export async function getContentTemplate(
	templateId: string,
	env: AppEnv,
	retried401 = false
): Promise<Result<AJOContentTemplateDetail>> {
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
		return { error: errMsg, status: 401 };
	}

	const opts: AJOClientOptions = {
		imsOrg: env.IMS_ORG_ID ?? '',
		sandboxName: ajoSandboxName(env),
		apiKey: ajoImsClientId(env) ?? '',
		accessToken: token
	};

	const path = `${TEMPLATES_PATH}/${encodeURIComponent(templateId)}`;
	const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
	const url = `${baseUrl}${path}`;

	let res: Response;
	try {
		res = await fetch(url, {
			method: 'GET',
			headers: {
				Accept: AJO_TEMPLATE_CONTENT_TYPE,
				Authorization: `Bearer ${opts.accessToken}`,
				'x-api-key': opts.apiKey,
				'x-gw-ims-org-id': opts.imsOrg,
				'x-sandbox-name': opts.sandboxName
			}
		});
	} catch (e) {
		const errMsg = e instanceof Error ? e.message : String(e);
		return { error: `AJO GET network error: ${errMsg}`, status: 502 };
	}

	if (res.status === 401 && !retried401) {
		resetAjoAccessTokenCache();
		return getContentTemplate(templateId, env, true);
	}

	if (!res.ok) {
		const body = await res.text();
		return { error: `AJO GET failed ${res.status}: ${body}`, status: res.status };
	}

	const json = (await res.json()) as Record<string, unknown>;
	const etag = res.headers.get('etag') ?? undefined;
	return {
		data: {
			id: typeof json.id === 'string' ? json.id : templateId,
			name: typeof json.name === 'string' ? json.name : '',
			etag
		}
	};
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

	let ifMatch: string | undefined;
	if (templateId) {
		const existing = await getContentTemplate(templateId, env);
		if (existing.error) {
			return failResult(existing.error, existing.status, {
				method,
				url: `${DEFAULT_BASE_URL}${path}`,
				path,
				baseUrl: DEFAULT_BASE_URL,
				reason: 'prefetch_failed',
				request: payloadMeta(payload, templateId)
			});
		}
		ifMatch = existing.data?.etag;
	}

	return requestWithRetry(method, path, payload, opts, env, {
		templateId,
		ifMatch
	});
}

interface RequestRetryState {
	retried401?: boolean;
	attempt?: number;
	ifMatch?: string;
	refetched409?: boolean;
	templateId?: string;
}

function isAjoVersionConflict(body: string): boolean {
	return (
		body.includes('JOMAL-1101') ||
		body.includes('updated in another tab') ||
		body.includes('Refresh to load the latest version')
	);
}

async function requestWithRetry(
	method: string,
	path: string,
	payload: AJOContentTemplatePayload,
	opts: AJOClientOptions,
	env: AppEnv,
	state: RequestRetryState = {}
): Promise<Result<AJOContentTemplateResult>> {
	const retried401 = state.retried401 ?? false;
	const attempt = state.attempt ?? 0;
	const ifMatch = state.ifMatch;
	const refetched409 = state.refetched409 ?? false;
	const templateId = state.templateId;
	const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
	const url = `${baseUrl}${path}`;
	const reqMeta = payloadMeta(payload);

	const headers: Record<string, string> = {
		'Content-Type': AJO_TEMPLATE_CONTENT_TYPE,
		Authorization: `Bearer ${opts.accessToken}`,
		'x-api-key': opts.apiKey,
		'x-gw-ims-org-id': opts.imsOrg,
		'x-sandbox-name': opts.sandboxName
	};
	if (ifMatch) headers['If-Match'] = ifMatch;

	let res: Response;
	try {
		res = await fetch(url, {
			method,
			headers,
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
		return requestWithRetry(method, path, payload, opts, env, {
			...state,
			retried401: true,
			attempt
		});
	}

	if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
		const delayMs = 2 ** attempt * 500;
		await sleep(delayMs);
		return requestWithRetry(method, path, payload, opts, env, {
			...state,
			retried401,
			attempt: attempt + 1
		});
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
			const versionConflict = isAjoVersionConflict(body);
			if (method === 'PUT' && versionConflict && !refetched409 && templateId) {
				const fresh = await getContentTemplate(templateId, env);
				if (fresh.data?.etag && fresh.data.etag !== ifMatch) {
					return requestWithRetry(method, path, payload, opts, env, {
						...state,
						ifMatch: fresh.data.etag,
						refetched409: true
					});
				}
			}

			failure.reason = versionConflict ? 'version_conflict' : 'name_conflict';
			const conflictLabel = versionConflict
				? 'version conflict — refresh and retry'
				: 'template name conflict';
			const msg = `${method} ${url} failed with ${httpSummary} (${conflictLabel})`;
			logAjoFailure(msg, failure, logExtras);
			const userMessage = versionConflict
				? `AJO template version conflict: ${body}`
				: `AJO template name conflict: ${body}`;
			return failResult(userMessage, 409, failure);
		}
		failure.reason = 'http_error';
		const msg = `${method} ${url} failed with ${httpSummary}`;
		logAjoFailure(msg, failure, logExtras);
		return failResult(`AJO ${method} failed ${res.status}: ${body}`, res.status, failure);
	}

	return { data: await parseSuccessResponse(res, method, path) };
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
