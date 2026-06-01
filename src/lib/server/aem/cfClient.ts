// Server-only AEM CF Management OpenAPI client (Author tier).
// Uses the IMS bearer token forwarded by Universal Editor — never refreshes.
// Import path: $lib/server/aem/cfClient

import { cfReferenceDepth, AUTHOR_CF_REFERENCES } from '$lib/aem/reference-fetch.js';
import type { AuthorFragment, AuthorFragmentList, AuthorModel } from '$lib/types/aem.js';

export class TokenExpiredError extends Error {
	readonly code = 'TOKEN_EXPIRED' as const;
	constructor() {
		super('IMS token expired — re-open from Universal Editor');
	}
}

export interface CfClientOptions {
	authorHost: string;
	token: string;
	fetch: typeof globalThis.fetch;
}

export function createCfClient(opts: CfClientOptions) {
	const { authorHost, token } = opts;
	const base = `${authorHost.replace(/\/$/, '')}/adobe/sites/cf`;
	const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
	const modelCache = new Map<string, AuthorModel>();

	async function request<T>(
		path: string,
		etag?: string
	): Promise<{ data: T | null; etag?: string }> {
		const reqHeaders: Record<string, string> = { ...headers };
		if (etag) reqHeaders['If-None-Match'] = etag;

		const MAX_RETRIES = 3;
		let attempt = 0;

		while (attempt <= MAX_RETRIES) {
			const res = await opts.fetch(`${base}${path}`, { headers: reqHeaders });

			if (res.status === 304) return { data: null, etag };
			if (res.status === 401) throw new TokenExpiredError();
			if (res.status === 404) return { data: null };

			if (res.status === 429) {
				if (attempt === MAX_RETRIES) throw new Error(`Rate-limited on ${path} after ${MAX_RETRIES} retries`);
				const retryAfter = parseInt(res.headers.get('Retry-After') ?? '1', 10);
				await sleep(Math.max(retryAfter * 1000, 2 ** attempt * 500));
				attempt++;
				continue;
			}

			if (!res.ok) throw new Error(`AEM CF API ${res.status} on ${path}`);

			const data = (await res.json()) as T;
			return { data, etag: res.headers.get('ETag') ?? undefined };
		}

		// Unreachable but TypeScript doesn't know that
		throw new Error('Exhausted retries');
	}

	return {
		async getFragment(
			id: string,
			opts: { etag?: string; references?: boolean; depth?: number } = {}
		) {
			const qs = new URLSearchParams();
			if (opts.references) {
				qs.set('references', AUTHOR_CF_REFERENCES);
				qs.set('depth', String(opts.depth ?? cfReferenceDepth()));
			}
			const q = qs.size ? `?${qs}` : '';
			return request<AuthorFragment>(`/fragments/${encodeURIComponent(id)}${q}`, opts.etag);
		},

		async listFragments(path: string, opts: { cursor?: string; limit?: number } = {}) {
			const qs = new URLSearchParams({ path });
			if (opts.cursor) qs.set('cursor', opts.cursor);
			if (opts.limit != null) qs.set('limit', String(opts.limit));
			return request<AuthorFragmentList>(`/fragments?${qs}`);
		},

		async getModel(id: string) {
			const cached = modelCache.get(id);
			if (cached) return { data: cached, etag: undefined };
			const result = await request<AuthorModel>(`/models/${encodeURIComponent(id)}`);
			if (result.data) modelCache.set(id, result.data);
			return result;
		}
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
