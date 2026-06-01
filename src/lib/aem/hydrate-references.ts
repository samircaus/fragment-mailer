import { fetchCampaignFragmentAtPath } from './delivery.js';
import { normalizeCF } from './client.js';
import type { AppEnv } from './env.js';
import type { CFFragment } from './types.js';

const ASSET_EXT_RE = /\.[a-z0-9]{2,5}$/i;

/** DAM path pointing at another CF (not a binary asset). */
export function isCfReferencePath(value: string): boolean {
	if (!value.startsWith('/content/')) return false;
	const leaf = value.split('/').filter(Boolean).pop() ?? '';
	if (!leaf) return false;
	return !ASSET_EXT_RE.test(leaf);
}

function isHydratedReferenceValue(value: unknown): boolean {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function loadReferencedFields(
	path: string,
	env: AppEnv | undefined,
	cache: Map<string, Record<string, unknown>>
): Promise<Record<string, unknown> | null> {
	const cached = cache.get(path);
	if (cached) return cached;

	const fetched = await fetchCampaignFragmentAtPath(path, env);
	if (fetched.error || !fetched.data) return null;

	const withNested = await hydrateUnresolvedFragmentReferences(fetched.data, env, cache);
	const normalized = normalizeCF(withNested).fields;
	cache.set(path, normalized);
	return normalized;
}

/**
 * When Author/Delivery returns reference fields as bare paths, fetch each referenced CF
 * and replace with normalized nested field maps (e.g. heroOffer.bannerImage URL).
 */
export async function hydrateUnresolvedFragmentReferences(
	fragment: CFFragment,
	env?: AppEnv,
	cache: Map<string, Record<string, unknown>> = new Map()
): Promise<CFFragment> {
	const out: CFFragment = { ...fragment };

	for (const key of Object.keys(out)) {
		if (key.startsWith('_') || key === 'id' || key === 'title') continue;

		const value = out[key];
		if (typeof value === 'string' && isCfReferencePath(value)) {
			const nested = await loadReferencedFields(value, env, cache);
			if (nested) out[key] = nested;
			continue;
		}

		if (Array.isArray(value)) {
			const next = await Promise.all(
				value.map(async (item) => {
					if (typeof item === 'string' && isCfReferencePath(item)) {
						return (await loadReferencedFields(item, env, cache)) ?? item;
					}
					if (isHydratedReferenceValue(item)) {
						return hydrateUnresolvedFragmentReferences(item as CFFragment, env, cache);
					}
					return item;
				})
			);
			out[key] = next;
			continue;
		}

		if (isHydratedReferenceValue(value)) {
			out[key] = await hydrateUnresolvedFragmentReferences(value as CFFragment, env, cache);
		}
	}

	return out;
}
