// AEM Author tier — Sites Content Fragment Management API (/adobe/sites/cf).
// Uses OAuth bearer tokens; never call /adobe/contentFragments on Author.

import { getAemAccessToken } from '$lib/auth/token-provider.js';
import type { CfModelListItem } from './cf-model-scope.js';
import type { AuthorFragment, AuthorFragmentList, AuthorModel } from '$lib/types/aem.js';
import { authorFragmentToCFFragment, authorFragmentToListItem } from './author-map.js';
import type { AEMClientOptions } from './client.js';
import { authorFragmentQueryParams, AUTHOR_CF_REFERENCES } from './reference-fetch.js';
import type { AppEnv } from './env.js';
import { campaignBasenameMatchesSlug, campaignSlugFromPath } from '$lib/campaigns/resolve-path.js';
import type { CFFragment, ContentFragmentItem } from './types.js';

export { authorFragmentToCFFragment, authorFragmentToListItem } from './author-map.js';

type Result<T> = { data: T; error?: never } | { error: string; data?: never };

const ERROR_SNIPPET_MAX = 400;

async function authorHeaders(env?: AppEnv): Promise<Record<string, string>> {
	const token = await getAemAccessToken(env);
	return {
		Authorization: `Bearer ${token}`,
		Accept: 'application/json'
	};
}

function sitesCfBase(opts: AEMClientOptions): string {
	return `${opts.baseUrl}/adobe/sites/cf`;
}

export async function listAuthorFragments(
	folderPath: string,
	opts: AEMClientOptions,
	env?: AppEnv
): Promise<Result<ContentFragmentItem[]>> {
	const url = new URL(`${sitesCfBase(opts)}/fragments`);
	url.searchParams.set('path', folderPath);

	const res = await fetch(url.toString(), { headers: await authorHeaders(env) });
	if (!res.ok) {
		const snippet = await readResponseSnippet(res);
		const hint =
			res.status === 401 || res.status === 403
				? ' Check OAuth scopes (aem.fragments.management) and that the ADC project is trusted on Author.'
				: res.status === 404
					? ' Confirm AEM_TIER=author and AEM_BASE_URL points at the Author host, not Publish.'
					: '';
		return {
			error: `AEM Author list failed ${res.status} for path: ${folderPath}.${hint} Body: ${snippet}`
		};
	}

	const body = (await res.json()) as AuthorFragmentList | AuthorFragment[];
	const items = extractAuthorList(body);
	return { data: items.map(authorFragmentToListItem) };
}

export async function fetchAuthorFragmentById(
	id: string,
	opts: AEMClientOptions,
	env?: AppEnv
): Promise<Result<CFFragment>> {
	const raw = await fetchAuthorFragmentRawById(id, opts, env);
	if (raw.error || !raw.data) return raw;
	return { data: authorFragmentToCFFragment(raw.data) };
}

/** Fetch raw Author API fragment (for AJO export ref resolution). */
export async function fetchAuthorFragmentRawById(
	id: string,
	opts: AEMClientOptions,
	env?: AppEnv
): Promise<Result<AuthorFragment>> {
	const qs = authorFragmentQueryParams(env);
	const url = `${sitesCfBase(opts)}/fragments/${encodeURIComponent(id)}?${qs}`;
	const res = await fetch(url, { headers: await authorHeaders(env) });
	if (!res.ok) {
		const snippet = await readResponseSnippet(res);
		return { error: `AEM Author CF fetch failed ${res.status} for id: ${id}. Body: ${snippet}` };
	}

	const fragment = (await res.json()) as AuthorFragment;
	return { data: fragment };
}

export async function fetchAuthorFragmentRawByPath(
	path: string,
	opts: AEMClientOptions,
	env?: AppEnv
): Promise<Result<AuthorFragment>> {
	const url = new URL(`${sitesCfBase(opts)}/fragments`);
	url.searchParams.set('path', path);
	url.searchParams.set('references', AUTHOR_CF_REFERENCES);

	const res = await fetch(url, { headers: await authorHeaders(env) });
	if (!res.ok) {
		const snippet = await readResponseSnippet(res);
		return { error: `AEM Author CF fetch failed ${res.status} for path: ${path}. Body: ${snippet}` };
	}

	const body: unknown = await res.json();
	const items = extractAuthorList(body as AuthorFragmentList | AuthorFragment[]);
	const single =
		body && typeof body === 'object' && 'id' in body && 'path' in body && !('items' in body)
			? (body as AuthorFragment)
			: undefined;
	const slug = campaignSlugFromPath(path);
	const match =
		single ??
		items.find((f) => f.path === path) ??
		items.find((f) => campaignSlugFromPath(f.path) === slug) ??
		(items.filter((f) => campaignBasenameMatchesSlug(campaignSlugFromPath(f.path), slug)).length === 1
			? items.find((f) => campaignBasenameMatchesSlug(campaignSlugFromPath(f.path), slug))
			: undefined);

	if (!match?.id) {
		return { error: `No CF found at path: ${path}` };
	}

	// List/path responses are often shallow — always load by id with full reference depth.
	return fetchAuthorFragmentRawById(match.id, opts, env);
}

export async function fetchAuthorFragmentByPath(
	path: string,
	opts: AEMClientOptions,
	env?: AppEnv
): Promise<Result<CFFragment>> {
	const raw = await fetchAuthorFragmentRawByPath(path, opts, env);
	if (raw.error || !raw.data) return raw;

	const hydrated = await fetchAuthorFragmentRawById(raw.data.id, opts, env);
	const fragment = hydrated.data ?? raw.data;
	return { data: authorFragmentToCFFragment(fragment) };
}

export async function listAuthorModels(
	opts: AEMClientOptions,
	env?: AppEnv,
	limit = 50
): Promise<Result<CfModelListItem[]>> {
	const items: CfModelListItem[] = [];
	let cursor: string | undefined;

	do {
		const url = new URL(`${sitesCfBase(opts)}/models`);
		url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 50)));
		url.searchParams.set('projection', 'minimal');
		if (cursor) url.searchParams.set('cursor', cursor);

		const res = await fetch(url.toString(), { headers: await authorHeaders(env) });
		if (!res.ok) {
			const snippet = await readResponseSnippet(res);
			return { error: `AEM Author model list failed ${res.status}. Body: ${snippet}` };
		}

		const body = (await res.json()) as {
			items?: CfModelListItem[];
			cursor?: string;
		};
		items.push(...(body.items ?? []));
		cursor = body.cursor;
	} while (cursor);

	return { data: items };
}

export async function fetchAuthorModel(
	modelId: string,
	opts: AEMClientOptions,
	env?: AppEnv
): Promise<Result<AuthorModel & { tags?: string[] }>> {
	const url = `${sitesCfBase(opts)}/models/${encodeURIComponent(modelId)}`;
	const res = await fetch(url, { headers: await authorHeaders(env) });
	if (!res.ok) {
		const snippet = await readResponseSnippet(res);
		return { error: `AEM Author model fetch failed ${res.status} for id: ${modelId}. Body: ${snippet}` };
	}
	return { data: (await res.json()) as AuthorModel & { tags?: string[] } };
}

/** Resolve a CF model by AEM id or human-readable title/name (e.g. template cfModel "Offer"). */
export async function resolveAuthorModel(
	modelKey: string,
	opts: AEMClientOptions,
	env?: AppEnv
): Promise<Result<AuthorModel & { tags?: string[] }>> {
	const direct = await fetchAuthorModel(modelKey, opts, env);
	if (direct.data) return direct;

	const list = await listAuthorModels(opts, env);
	if (list.error || !list.data) return direct;

	const key = modelKey.trim().toLowerCase();
	const match = list.data.find(
		(item) =>
			item.id === modelKey ||
			item.title?.trim().toLowerCase() === key ||
			item.name?.trim().toLowerCase() === key
	);
	if (!match?.id) {
		return {
			error:
				direct.error ??
				`No AEM CF model matched "${modelKey}". Use the model id from Author or set template cfModel to the model title.`
		};
	}

	return fetchAuthorModel(match.id, opts, env);
}

/** Tags applied to a CF model (GET /cf/models/{id}/tags). */
export async function fetchAuthorModelTags(
	modelId: string,
	opts: AEMClientOptions,
	env?: AppEnv
): Promise<Result<Record<string, unknown>>> {
	return fetchAuthorTagsResource(`${sitesCfBase(opts)}/models/${encodeURIComponent(modelId)}/tags`, modelId, env);
}

/** Tags applied to a CF instance (GET /cf/fragments/{id}/tags). */
export async function fetchAuthorFragmentTags(
	fragmentId: string,
	opts: AEMClientOptions,
	env?: AppEnv
): Promise<Result<Record<string, unknown>>> {
	return fetchAuthorTagsResource(
		`${sitesCfBase(opts)}/fragments/${encodeURIComponent(fragmentId)}/tags`,
		fragmentId,
		env
	);
}

async function fetchAuthorTagsResource(
	url: string,
	resourceId: string,
	env?: AppEnv
): Promise<Result<Record<string, unknown>>> {
	const res = await fetch(url, { headers: await authorHeaders(env) });
	if (res.status === 404) {
		return { data: { items: [] } };
	}
	if (!res.ok) {
		const snippet = await readResponseSnippet(res);
		return { error: `AEM Author tags fetch failed ${res.status} for ${resourceId}. Body: ${snippet}` };
	}
	const body = (await res.json()) as Record<string, unknown>;
	return { data: body };
}

function extractAuthorList(body: AuthorFragmentList | AuthorFragment[]): AuthorFragment[] {
	if (Array.isArray(body)) return body;
	if (body?.items && Array.isArray(body.items)) return body.items;
	return [];
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
