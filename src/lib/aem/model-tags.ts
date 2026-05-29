// Normalize CF model / fragment tags from AEM Sites CF Management API.

export interface AemTagItem {
	id?: string;
	title?: string;
	name?: string;
	path?: string;
}

export interface AemTagListResponse {
	items?: AemTagItem[];
}

/** Collect tag strings from inline model JSON, TagList API responses, etc. */
export function extractModelTags(model: Record<string, unknown>): string[] {
	const found = new Set<string>();

	// GET /cf/models/{id}/tags and GET /cf/fragments/{id}/tags → { items: Tag[] }
	const items = model.items;
	if (Array.isArray(items)) {
		for (const item of items) collectTagValue(item, found);
	}

	const direct = model.tags;
	if (Array.isArray(direct)) {
		for (const item of direct) collectTagValue(item, found);
	}

	const tagIds = model.tagIds;
	if (Array.isArray(tagIds)) {
		for (const item of tagIds) collectTagValue(item, found);
	}

	const metadata = model.metadata;
	if (metadata && typeof metadata === 'object') {
		const metaTags = (metadata as Record<string, unknown>).tags;
		if (Array.isArray(metaTags)) {
			for (const item of metaTags) collectTagValue(item, found);
		}
	}

	return [...found];
}

function collectTagValue(item: unknown, found: Set<string>): void {
	if (typeof item === 'string') {
		found.add(item);
		return;
	}
	if (item && typeof item === 'object') {
		const o = item as Record<string, unknown>;
		for (const key of ['id', 'title', 'value', 'name', 'path']) {
			if (typeof o[key] === 'string') found.add(o[key] as string);
		}
	}
}

/** Whether a single tag value from AEM matches the required AJO enablement tag. */
export function tagMatchesAjoEnabled(tag: string, requiredTag: string): boolean {
	const t = tag.trim();
	const required = requiredTag.trim();
	if (!t || !required) return false;
	if (t === required) return true;

	const match = required.match(/^ajo-enabled:([^/]+)\/(.+)$/);
	if (!match) return false;

	const [, org, sandbox] = match;
	const prefix = `ajo-enabled:${org}`;

	if (t === prefix || t.startsWith(`${prefix}/`)) return true;
	// cq:tag id often uses namespace:ajo-enabled/org/sandbox
	if (t.includes('ajo-enabled') && t.includes(org) && t.includes(sandbox)) return true;
	// JCR path form: /content/cq:tags/ajo-enabled/ORG/sandbox
	if (t.includes('/ajo-enabled/') && t.includes(org) && t.endsWith(`/${sandbox}`)) return true;

	return false;
}

export function modelHasAjoEnabledTag(tags: string[], requiredTag: string): boolean {
	return tags.some((t) => tagMatchesAjoEnabled(t, requiredTag));
}

export function ajoEnabledTagFixHint(requiredTag: string, modelTitle?: string, modelId?: string): string {
	const modelLabel = modelTitle ?? modelId ?? 'your content fragment model';
	return (
		`In AEM Author, assign tag "${requiredTag}" to the CF model "${modelLabel}" or to the content fragment itself ` +
		`(Tools → Tagging, then tag the model or fragment). Publish after tagging.`
	);
}
