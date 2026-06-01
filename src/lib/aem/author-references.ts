import type { CFFragment } from './types.js';
import type { AuthorFragment, AuthorHydratedReference, AuthorReferenceItem } from '$lib/types/aem.js';

function assetUrlFromItem(item: AuthorReferenceItem): string | undefined {
	return (
		(typeof item._publishUrl === 'string' && item._publishUrl) ||
		(typeof item.url === 'string' && item.url) ||
		(typeof item._dynamicUrl === 'string' && item._dynamicUrl) ||
		(typeof item._authorUrl === 'string' && item._authorUrl) ||
		(typeof item.path === 'string' && item.path) ||
		undefined
	);
}

function referenceItemToValue(
	item: AuthorReferenceItem,
	mapFragment: (fragment: AuthorFragment) => CFFragment
): unknown {
	if (item.type === 'fragment' && item.fragment) {
		return mapFragment(item.fragment);
	}
	return assetUrlFromItem(item);
}

/** Overlay `references=all-hydrated` data onto flat field map (fragments + assets). */
export function applyAuthorReferences(
	fragment: AuthorFragment,
	flatFields: Record<string, unknown>,
	mapFragment: (fragment: AuthorFragment) => CFFragment
): void {
	for (const ref of fragment.references ?? []) {
		const value = referenceItemsToFieldValue(ref, mapFragment);
		if (value !== undefined) {
			flatFields[ref.fieldName] = value;
		}
	}
}

function referenceItemsToFieldValue(
	ref: AuthorHydratedReference,
	mapFragment: (fragment: AuthorFragment) => CFFragment
): unknown {
	const items = ref.items ?? [];
	if (items.length === 0) return undefined;

	const values = items
		.map((item) => referenceItemToValue(item, mapFragment))
		.filter((v) => v !== undefined && v !== null);

	if (values.length === 0) return undefined;
	if (values.length === 1) return values[0];
	return values;
}
