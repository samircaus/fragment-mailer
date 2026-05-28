// AEM Content Fragment fetch via GraphQL persisted queries on Publish.
// Plan B when Content Fragment Delivery OpenAPI is not available.
//
//   GET /graphql/execute.json/{endpoint}/{listQuery}
//   GET /graphql/execute.json/{endpoint}/{byPathQuery};{param}={encodedPath}

import type { AEMClientOptions } from './client.js';
import { contentFragmentToCFFragment } from './client.js';
import type { CFFragment, ContentFragmentItem } from './types.js';
import type { GraphQLConfig } from './env.js';

type Result<T> = { data: T; error?: never } | { error: string; data?: never };

const ERROR_SNIPPET_MAX = 400;

function requestHeaders(opts: AEMClientOptions): Record<string, string> {
	const headers: Record<string, string> = {
		Accept: 'application/json'
	};
	if (opts.apiKey) headers['X-Api-Key'] = opts.apiKey;
	if (opts.serviceToken) headers['Authorization'] = `Bearer ${opts.serviceToken}`;
	return headers;
}

/** List campaigns via persisted query (e.g. email/campaigns-all). */
export async function listCampaignsGraphQL(
	opts: AEMClientOptions,
	gql: GraphQLConfig
): Promise<Result<ContentFragmentItem[]>> {
	const url = `${opts.baseUrl}/graphql/execute.json/${gql.endpoint}/${gql.listQuery}`;
	return fetchGraphQLList(url, opts, 'list');
}

/** Fetch one campaign CF by DAM path via persisted query. */
export async function fetchCampaignByPathGraphQL(
	campaignPath: string,
	opts: AEMClientOptions,
	gql: GraphQLConfig
): Promise<Result<CFFragment>> {
	const param = encodeURIComponent(campaignPath);
	const url = `${opts.baseUrl}/graphql/execute.json/${gql.endpoint}/${gql.byPathQuery};${gql.byPathParam}=${param}`;
	const result = await fetchGraphQLSingle(url, opts, 'by-path');
	if (result.error || !result.data) return result;
	return { data: contentFragmentToCFFragment(result.data) };
}

async function fetchGraphQLList(
	url: string,
	opts: AEMClientOptions,
	label: string
): Promise<Result<ContentFragmentItem[]>> {
	const parsed = await fetchGraphQLJson(url, opts, label);
	if (parsed.error) return { error: parsed.error };
	if (parsed.data === undefined) return { error: `AEM GraphQL ${label} returned empty data` };

	const records = extractGraphqlCampaignRecords(parsed.data);
	return {
		data: records.map((r) => recordToContentFragmentItem(r))
	};
}

async function fetchGraphQLSingle(
	url: string,
	opts: AEMClientOptions,
	label: string
): Promise<Result<ContentFragmentItem>> {
	const parsed = await fetchGraphQLJson(url, opts, label);
	if (parsed.error) return { error: parsed.error };
	if (parsed.data === undefined) return { error: `AEM GraphQL ${label} returned empty data` };

	const record = extractGraphqlSingleRecord(parsed.data);
	if (!record) {
		return { error: 'GraphQL response did not contain a campaign fragment with _path' };
	}
	return { data: recordToContentFragmentItem(record) };
}

async function fetchGraphQLJson(
	url: string,
	opts: AEMClientOptions,
	label: string
): Promise<Result<unknown>> {
	const res = await fetch(url, { headers: requestHeaders(opts) });
	if (!res.ok) {
		const snippet = await readResponseSnippet(res);
		console.error(
			JSON.stringify({
				event: 'aem_graphql_failed',
				label,
				url,
				status: res.status,
				hasApiKey: Boolean(opts.apiKey),
				responseSnippet: snippet
			})
		);
		return {
			error: `AEM GraphQL ${label} failed ${res.status}. Body: ${snippet}`
		};
	}

	const text = await res.text();
	if (text.trimStart().startsWith('<')) {
		const snippet = text.replace(/\s+/g, ' ').trim().slice(0, ERROR_SNIPPET_MAX);
		return {
			error: `AEM GraphQL ${label} returned HTML instead of JSON. Body: ${snippet}`
		};
	}

	try {
		const body = JSON.parse(text) as unknown;
		const gqlErrors = extractGraphqlErrors(body);
		if (gqlErrors.length > 0) {
			const hint = gqlErrors.some((m) => m.includes('QueryType'))
				? ' The GraphQL endpoint exists but its schema has no query fields — ask AEM to register your email CF models on the GraphQL endpoint and publish them.'
				: '';
			return { error: `AEM GraphQL ${label} errors: ${gqlErrors.join('; ')}.${hint}` };
		}
		return { data: body };
	} catch {
		return { error: `AEM GraphQL ${label} returned invalid JSON` };
	}
}

function extractGraphqlErrors(body: unknown): string[] {
	if (!body || typeof body !== 'object') return [];
	const errors = (body as {
		errors?: Array<{ message?: string; details?: string }>;
	}).errors;
	if (!Array.isArray(errors)) return [];
	return errors
		.map((e) => [e.message, e.details].filter(Boolean).join(' — '))
		.filter(Boolean);
}

/** Find all CF-shaped objects under `data` (items with `_path`). */
export function extractGraphqlCampaignRecords(body: unknown): Record<string, unknown>[] {
	const data = body && typeof body === 'object' ? (body as { data?: unknown }).data : undefined;
	if (!data) return [];

	const found: Record<string, unknown>[] = [];
	const seen = new Set<string>();

	function visit(node: unknown) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const el of node) visit(el);
			return;
		}
		const obj = node as Record<string, unknown>;
		const path = obj._path;
		if (typeof path === 'string' && !seen.has(path)) {
			seen.add(path);
			found.push(obj);
			return;
		}
		for (const value of Object.values(obj)) {
			if (value && typeof value === 'object') visit(value);
		}
	}

	visit(data);
	return found;
}

function extractGraphqlSingleRecord(body: unknown): Record<string, unknown> | null {
	const records = extractGraphqlCampaignRecords(body);
	return records[0] ?? null;
}

function recordToContentFragmentItem(record: Record<string, unknown>): ContentFragmentItem {
	const title =
		(typeof record.title === 'string' && record.title) ||
		(typeof record.jcrTitle === 'string' && record.jcrTitle) ||
		(typeof record.heroHeadline === 'string' && record.heroHeadline) ||
		undefined;

	return {
		...record,
		_path: (record._path as string) ?? (record.path as string),
		path: (record._path as string) ?? (record.path as string),
		title
	};
}

async function readResponseSnippet(res: Response): Promise<string> {
	try {
		const text = (await res.text()).replace(/\s+/g, ' ').trim();
		if (!text) return '[empty response body]';
		return text.slice(0, ERROR_SNIPPET_MAX);
	} catch {
		return '[unable to read response body]';
	}
}
