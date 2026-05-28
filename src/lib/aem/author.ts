// AEM Author tier — Sites Content Fragment Management API (/adobe/sites/cf).
// Uses OAuth bearer tokens; never call /adobe/contentFragments on Author.

import { getAemAccessToken } from '$lib/auth/token-provider.js';
import type { AuthorFragment, AuthorFragmentList } from '$lib/types/aem.js';
import { authorFragmentToCFFragment, authorFragmentToListItem } from './author-map.js';
import type { AEMClientOptions } from './client.js';
import type { AppEnv } from './env.js';
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
	const qs = new URLSearchParams({ references: 'all-hydrated' });
	const url = `${sitesCfBase(opts)}/fragments/${encodeURIComponent(id)}?${qs}`;
	const res = await fetch(url, { headers: await authorHeaders(env) });
	if (!res.ok) {
		const snippet = await readResponseSnippet(res);
		return { error: `AEM Author CF fetch failed ${res.status} for id: ${id}. Body: ${snippet}` };
	}

	const fragment = (await res.json()) as AuthorFragment;
	return { data: authorFragmentToCFFragment(fragment) };
}

export async function fetchAuthorFragmentByPath(
	path: string,
	opts: AEMClientOptions,
	env?: AppEnv
): Promise<Result<CFFragment>> {
	const url = new URL(`${sitesCfBase(opts)}/fragments`);
	url.searchParams.set('path', path);

	const res = await fetch(url, { headers: await authorHeaders(env) });
	if (!res.ok) {
		const snippet = await readResponseSnippet(res);
		return { error: `AEM Author CF fetch failed ${res.status} for path: ${path}. Body: ${snippet}` };
	}

	const body: unknown = await res.json();
	if (body && typeof body === 'object' && 'id' in body && 'path' in body && !('items' in body)) {
		return { data: authorFragmentToCFFragment(body as AuthorFragment) };
	}

	const items = extractAuthorList(body as AuthorFragmentList | AuthorFragment[]);
	const match = items.find((f) => f.path === path) ?? items[0];

	if (!match?.id) {
		return { error: `No CF found at path: ${path}` };
	}

	if (match.fields?.length) {
		return { data: authorFragmentToCFFragment(match) };
	}

	return fetchAuthorFragmentById(match.id, opts, env);
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
