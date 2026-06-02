import type { ContentFragmentItem } from '$lib/aem/types.js';

/** DAM node name from a full content path. */
export function campaignSlugFromPath(path: string): string {
	return path.split('/').filter(Boolean).pop() ?? '';
}

/** Whether a DAM basename matches a campaign slug (exact or versioned suffix). */
export function campaignBasenameMatchesSlug(basename: string, slug: string): boolean {
	if (!slug || !basename) return false;
	if (basename === slug) return true;
	return basename.startsWith(`${slug}-`);
}

function itemPath(item: ContentFragmentItem): string {
	return item.path ?? item._path ?? '';
}

/**
 * Resolve a short campaign id to a full DAM path when the exact node is missing
 * but a single versioned sibling exists (e.g. summer-campaign → summer-campaign-26).
 */
export function resolveCampaignPathFromList(
	slug: string,
	folderPath: string,
	items: ContentFragmentItem[]
): string | null {
	const normalizedFolder = folderPath.replace(/\/$/, '');
	const inFolder = items.filter((item) => {
		const path = itemPath(item);
		return path.startsWith(`${normalizedFolder}/`);
	});

	const exact = inFolder.filter((item) => campaignSlugFromPath(itemPath(item)) === slug);
	if (exact.length === 1) return itemPath(exact[0]);

	const prefixed = inFolder.filter((item) => {
		const base = campaignSlugFromPath(itemPath(item));
		return base !== slug && campaignBasenameMatchesSlug(base, slug);
	});

	if (prefixed.length === 1) return itemPath(prefixed[0]);

	return null;
}
