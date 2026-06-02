// AJO Journey Content Fragments API client.

import { getAjoAccessToken, resetAjoAccessTokenCache } from '$lib/auth/ajo-token-provider.js';
import type { AppEnv } from '$lib/aem/env.js';
import { ajoImsClientId, ajoSandboxName } from '$lib/aem/env.js';
import {
	AJO_FRAGMENT_CONTENT_TYPE,
	AJO_FRAGMENT_LIST_CONTENT_TYPE,
	AJO_FRAGMENT_PUBLICATION_CONTENT_TYPE,
	type AjoExpressionFragmentDetail,
	type AjoExpressionFragmentPayload,
	type AjoFragmentPage,
	type AjoFragmentPublishResult,
	type AjoFragmentReferences,
	buildAjoExpressionFragmentPayload
} from './fragment-types.js';

export type { AjoExpressionFragmentPayload };
export { buildAjoExpressionFragmentPayload };

export interface AjoFragmentClientOptions {
	imsOrg: string;
	sandboxName: string;
	apiKey: string;
	accessToken: string;
	baseUrl?: string;
}

type Result<T> =
	| { data: T; error?: never; status?: never }
	| { error: string; data?: never; status?: number };

const DEFAULT_BASE_URL = 'https://platform.adobe.io';
const FRAGMENTS_PATH = '/ajo/content/fragments';

const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 3;

function pickResponseHeaders(res: Response): Record<string, string> {
	const out: Record<string, string> = {};
	for (const key of ['content-type', 'etag', 'x-request-id', 'x-correlation-id']) {
		const v = res.headers.get(key);
		if (v) out[key] = v;
	}
	return out;
}

async function buildClientOptions(env: AppEnv): Promise<Result<AjoFragmentClientOptions>> {
	if (!ajoImsClientId(env)) {
		return {
			error: 'AJO credentials not configured (AJO_IMS_CLIENT_ID or IMS_CLIENT_ID).',
			status: 503
		};
	}

	try {
		const token = await getAjoAccessToken(env);
		return {
			data: {
				imsOrg: env.IMS_ORG_ID ?? '',
				sandboxName: ajoSandboxName(env),
				apiKey: ajoImsClientId(env) ?? '',
				accessToken: token
			}
		};
	} catch (e) {
		const errMsg = e instanceof Error ? e.message : String(e);
		return { error: errMsg, status: 401 };
	}
}

function baseHeaders(opts: AjoFragmentClientOptions, accept: string): Record<string, string> {
	return {
		Accept: accept,
		Authorization: `Bearer ${opts.accessToken}`,
		'x-api-key': opts.apiKey,
		'x-gw-ims-org-id': opts.imsOrg,
		'x-sandbox-name': opts.sandboxName
	};
}

async function requestJson<T>(
	method: string,
	path: string,
	opts: AjoFragmentClientOptions,
	env: AppEnv,
	init: {
		accept: string;
		contentType?: string;
		body?: unknown;
		ifMatch?: string;
		retried401?: boolean;
		attempt?: number;
	}
): Promise<Result<T>> {
	const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
	const url = `${baseUrl}${path}`;
	const retried401 = init.retried401 ?? false;
	const attempt = init.attempt ?? 0;

	const headers = baseHeaders(opts, init.accept);
	if (init.contentType) headers['Content-Type'] = init.contentType;
	if (init.ifMatch) headers['If-Match'] = init.ifMatch;

	let res: Response;
	try {
		res = await fetch(url, {
			method,
			headers,
			body: init.body !== undefined ? JSON.stringify(init.body) : undefined
		});
	} catch (e) {
		const errMsg = e instanceof Error ? e.message : String(e);
		return { error: `AJO ${method} network error: ${errMsg}`, status: 502 };
	}

	if (res.status === 401 && !retried401) {
		resetAjoAccessTokenCache();
		const refreshed = await buildClientOptions(env);
		if (refreshed.error || !refreshed.data) {
			const body = await res.text();
			return { error: `AJO unauthorized: ${body}`, status: 401 };
		}
		return requestJson(method, path, refreshed.data, env, { ...init, retried401: true, attempt });
	}

	if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
		await sleep(2 ** attempt * 500);
		return requestJson(method, path, opts, env, { ...init, retried401, attempt: attempt + 1 });
	}

	if (!res.ok) {
		const body = await res.text();
		if (res.status === 404 && path.includes('/references')) {
			return { data: { count: 0, items: [] } };
		}
		console.error(
			JSON.stringify({
				event: 'ajo_fragment_request_failed',
				method,
				url,
				status: res.status,
				responseBody: body,
				responseHeaders: pickResponseHeaders(res)
			})
		);
		return { error: `AJO ${method} failed ${res.status}: ${body}`, status: res.status };
	}

	if (res.status === 204 || res.status === 202) {
		return { data: { accepted: true } as T };
	}

	const contentType = res.headers.get('content-type') ?? '';
	if (!contentType.includes('json')) {
		return { data: {} as T };
	}

	return { data: (await res.json()) as T };
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapListItem(raw: Record<string, unknown>): AjoFragmentPage['items'][number] {
	return {
		id: String(raw.id ?? ''),
		name: String(raw.name ?? ''),
		description: typeof raw.description === 'string' ? raw.description : undefined,
		type: raw.type === 'expression' ? 'expression' : 'html',
		status:
			raw.status === 'PUBLISHED' || raw.status === 'PUBLISHING'
				? raw.status
				: 'DRAFT',
		channels: Array.isArray(raw.channels) ? raw.channels.map(String) : [],
		modifiedAt: typeof raw.modifiedAt === 'string' ? raw.modifiedAt : undefined,
		createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
		self:
			raw.self && typeof raw.self === 'object' && raw.self !== null && 'href' in raw.self
				? { href: String((raw.self as { href: unknown }).href) }
				: undefined
	};
}

function mapFragmentDetail(
	raw: Record<string, unknown>,
	etag?: string
): AjoExpressionFragmentDetail {
	const base = mapListItem(raw);
	const fragment =
		raw.fragment && typeof raw.fragment === 'object' && raw.fragment !== null
			? (raw.fragment as Record<string, unknown>)
			: {};
	const expression = typeof fragment.expression === 'string' ? fragment.expression : '';

	return {
		...base,
		subType:
			raw.subType === 'TEXT' || raw.subType === 'JSON' || raw.subType === 'HTML'
				? raw.subType
				: 'HTML',
		fragment: { expression },
		etag
	};
}

export async function listFragments(
	env: AppEnv,
	opts?: { limit?: number; type?: 'expression' | 'html' }
): Promise<Result<AjoFragmentPage>> {
	const client = await buildClientOptions(env);
	if (client.error || !client.data) return { error: client.error!, status: client.status };

	const params = new URLSearchParams();
	params.set('limit', String(opts?.limit ?? 100));
	params.set('orderBy', '-modifiedAt');
	if (opts?.type) {
		params.set('property', `type==${opts.type}`);
	}

	const path = `${FRAGMENTS_PATH}?${params}`;
	const result = await requestJson<Record<string, unknown>>(
		'GET',
		path,
		client.data,
		env,
		{ accept: AJO_FRAGMENT_LIST_CONTENT_TYPE }
	);
	if (result.error || !result.data) return result as Result<AjoFragmentPage>;

	const raw = result.data;
	const items = Array.isArray(raw.items) ? raw.items.map((i) => mapListItem(i as Record<string, unknown>)) : [];
	const next =
		raw._links &&
		typeof raw._links === 'object' &&
		raw._links !== null &&
		'next' in raw._links &&
		(raw._links as { next?: { href?: string } }).next?.href;

	return { data: { items, next } };
}

export async function getFragment(
	fragmentId: string,
	env: AppEnv,
	retried401 = false
): Promise<Result<AjoExpressionFragmentDetail>> {
	const client = await buildClientOptions(env);
	if (client.error || !client.data) return { error: client.error!, status: client.status };

	const path = `${FRAGMENTS_PATH}/${encodeURIComponent(fragmentId)}`;
	const baseUrl = client.data.baseUrl ?? DEFAULT_BASE_URL;
	const url = `${baseUrl}${path}`;

	let res: Response;
	try {
		res = await fetch(url, {
			method: 'GET',
			headers: baseHeaders(client.data, AJO_FRAGMENT_CONTENT_TYPE)
		});
	} catch (e) {
		const errMsg = e instanceof Error ? e.message : String(e);
		return { error: `AJO GET network error: ${errMsg}`, status: 502 };
	}

	if (res.status === 401 && !retried401) {
		resetAjoAccessTokenCache();
		return getFragment(fragmentId, env, true);
	}

	if (!res.ok) {
		const body = await res.text();
		return { error: `AJO GET failed ${res.status}: ${body}`, status: res.status };
	}

	const json = (await res.json()) as Record<string, unknown>;
	const etag = res.headers.get('etag') ?? undefined;
	return { data: mapFragmentDetail(json, etag) };
}

export async function updateFragment(
	fragmentId: string,
	payload: AjoExpressionFragmentPayload,
	env: AppEnv,
	ifMatch?: string
): Promise<Result<{ updated: true }>> {
	const client = await buildClientOptions(env);
	if (client.error || !client.data) return { error: client.error!, status: client.status };

	const path = `${FRAGMENTS_PATH}/${encodeURIComponent(fragmentId)}`;
	const result = await requestJson<{ updated: true }>(
		'PUT',
		path,
		client.data,
		env,
		{
			accept: AJO_FRAGMENT_CONTENT_TYPE,
			contentType: AJO_FRAGMENT_CONTENT_TYPE,
			body: payload,
			ifMatch
		}
	);
	if (result.error) return result;
	return { data: { updated: true } };
}

export async function createFragment(
	payload: AjoExpressionFragmentPayload,
	env: AppEnv
): Promise<Result<AjoExpressionFragmentDetail>> {
	const client = await buildClientOptions(env);
	if (client.error || !client.data) return { error: client.error!, status: client.status };

	const result = await requestJson<Record<string, unknown>>(
		'POST',
		FRAGMENTS_PATH,
		client.data,
		env,
		{
			accept: AJO_FRAGMENT_CONTENT_TYPE,
			contentType: AJO_FRAGMENT_CONTENT_TYPE,
			body: payload
		}
	);
	if (result.error || !result.data) return result as Result<AjoExpressionFragmentDetail>;
	return { data: mapFragmentDetail(result.data) };
}

export async function publishFragment(
	fragmentId: string,
	env: AppEnv
): Promise<Result<AjoFragmentPublishResult>> {
	const client = await buildClientOptions(env);
	if (client.error || !client.data) return { error: client.error!, status: client.status };

	return requestJson<AjoFragmentPublishResult>(
		'POST',
		`${FRAGMENTS_PATH}/publications`,
		client.data,
		env,
		{
			accept: AJO_FRAGMENT_CONTENT_TYPE,
			contentType: AJO_FRAGMENT_PUBLICATION_CONTENT_TYPE,
			body: { fragmentId }
		}
	);
}

export async function getFragmentReferences(
	fragmentId: string,
	env: AppEnv
): Promise<Result<AjoFragmentReferences>> {
	const client = await buildClientOptions(env);
	if (client.error || !client.data) return { error: client.error!, status: client.status };

	const path = `${FRAGMENTS_PATH}/${encodeURIComponent(fragmentId)}/references`;
	const result = await requestJson<Record<string, unknown>>(
		'GET',
		path,
		client.data,
		env,
		{ accept: AJO_FRAGMENT_CONTENT_TYPE }
	);
	if (result.error || !result.data) return result as Result<AjoFragmentReferences>;

	const raw = result.data;
	const items: AjoFragmentReferences['items'] = [];

	const candidates = [
		...(Array.isArray(raw.items) ? raw.items : []),
		...(Array.isArray(raw.references) ? raw.references : []),
		...(raw._embedded &&
		typeof raw._embedded === 'object' &&
		raw._embedded !== null &&
		Array.isArray((raw._embedded as { references?: unknown[] }).references)
			? (raw._embedded as { references: unknown[] }).references
			: [])
	];

	for (const entry of candidates) {
		if (!entry || typeof entry !== 'object') continue;
		const obj = entry as Record<string, unknown>;
		items.push({
			id: String(obj.id ?? obj.resourceId ?? ''),
			name: String(obj.name ?? obj.title ?? obj.id ?? 'Unknown'),
			type: typeof obj.type === 'string' ? obj.type : undefined,
			channel: typeof obj.channel === 'string' ? obj.channel : undefined
		});
	}

	const count =
		typeof raw.count === 'number'
			? raw.count
			: typeof raw.total === 'number'
				? raw.total
				: items.length;

	return { data: { count, items } };
}

export async function getLiveFragmentExpression(
	fragmentId: string,
	env: AppEnv
): Promise<Result<string>> {
	const client = await buildClientOptions(env);
	if (client.error || !client.data) return { error: client.error!, status: client.status };

	const path = `${FRAGMENTS_PATH}/${encodeURIComponent(fragmentId)}/liveFragment`;
	const result = await requestJson<Record<string, unknown>>(
		'GET',
		path,
		client.data,
		env,
		{ accept: 'application/vnd.adobe.ajo.fragment.publication.v1.0+json' }
	);
	if (result.error || !result.data) return result as Result<string>;

	const fragment = result.data.fragment;
	if (fragment && typeof fragment === 'object' && fragment !== null) {
		const expr = (fragment as Record<string, unknown>).expression;
		if (typeof expr === 'string') return { data: expr };
	}
	return { error: 'Live fragment has no expression content', status: 404 };
}

/** Resolve fragment content by AJO id or display name (e.g. brand-footer). */
export async function resolveFragmentExpression(
	fragmentKey: string,
	env: AppEnv
): Promise<Result<string>> {
	const byId = await getLiveFragmentExpression(fragmentKey, env);
	if (byId.data) return byId;

	const list = await listFragments(env, { type: 'expression', limit: 200 });
	if (list.error || !list.data) return byId;

	const match = list.data.items.find(
		(item) => item.id === fragmentKey || item.name === fragmentKey
	);
	if (!match) return byId;

	return getLiveFragmentExpression(match.id, env);
}
