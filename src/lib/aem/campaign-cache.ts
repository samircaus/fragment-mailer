// Short-lived in-memory cache for hydrated campaign CF payloads.
// Shared across preview, compile, and content-model routes within the same Worker isolate.

import type { CFFragment } from './types.js';

export interface HydratedCampaignCacheEntry {
	fragment: CFFragment;
	version: string;
	cachedAt: number;
}

const DEFAULT_TTL_MS = 30_000;
const MAX_ENTRIES = 100;

const cache = new Map<string, HydratedCampaignCacheEntry>();

function fragmentVersion(fragment: CFFragment): string {
	return (
		fragment._metadata?.stringMetadata?.find((m) => m.name === 'cq:lastModified')?.value ??
		'unknown'
	);
}

function cacheKeysForFragment(id: string, fragment: CFFragment): string[] {
	const keys = new Set<string>([id]);
	if (fragment._path) keys.add(fragment._path);
	if (typeof fragment.id === 'string' && fragment.id) keys.add(fragment.id);
	const slug = fragment._path.split('/').filter(Boolean).pop();
	if (slug) keys.add(slug);
	return [...keys];
}

export function getCachedHydratedFragment(
	campaignId: string,
	cfVersion?: string
): CFFragment | null {
	const entry = cache.get(campaignId);
	if (!entry) return null;

	if (cfVersion && cfVersion !== entry.version) return null;

	const ttlExpired = Date.now() - entry.cachedAt > DEFAULT_TTL_MS;
	if (ttlExpired && !cfVersion) return null;

	// LRU touch
	cache.delete(campaignId);
	cache.set(campaignId, entry);
	return entry.fragment;
}

export function setCachedHydratedFragment(campaignId: string, fragment: CFFragment): void {
	const entry: HydratedCampaignCacheEntry = {
		fragment,
		version: fragmentVersion(fragment),
		cachedAt: Date.now()
	};

	for (const key of cacheKeysForFragment(campaignId, fragment)) {
		if (cache.has(key)) cache.delete(key);
		cache.set(key, entry);
	}

	while (cache.size > MAX_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (!oldest) break;
		cache.delete(oldest);
	}
}

/** Clear cache (tests). */
export function resetCampaignCache(): void {
	cache.clear();
}
