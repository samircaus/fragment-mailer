import { resolveAssetImageUrl } from './dynamic-media.js';
import type { AppEnv } from './env.js';
import type { CFFragment } from './types.js';
import type { AuthorFragment, AuthorHydratedReference, AuthorReferenceItem } from '$lib/types/aem.js';

function assetUrlFromItem(item: AuthorReferenceItem, env?: AppEnv): string | undefined {
	return (
		resolveAssetImageUrl(item, env) ||
		(typeof item._authorUrl === 'string' && item._authorUrl) ||
		(typeof item.path === 'string' && item.path) ||
		undefined
	);
}

function flatReferenceToItem(ref: AuthorHydratedReference): AuthorReferenceItem {
	return {
		id: ref.assetId ?? ref.id ?? '',
		assetId: ref.assetId,
		path: ref.path ?? '',
		type: 'asset',
		status: ref.status,
		_publishUrl: ref._publishUrl,
		_dynamicUrl: ref._dynamicUrl,
		_authorUrl: ref._authorUrl,
		url: ref.url
	};
}

function nestedReferenceToAuthorFragment(ref: AuthorHydratedReference): AuthorFragment {
	const model = ref.model ?? { id: '', title: ref.title ?? ref.name ?? '' };
	return {
		id: ref.id ?? '',
		path: ref.path ?? '',
		title: ref.title ?? ref.name ?? '',
		etag: '',
		created: { at: '', by: '' },
		modified: { at: '', by: '' },
		model: { id: model.id, title: model.title ?? model.name ?? '' },
		status: '',
		fields: ref.fields ?? [],
		references: ref.references
	};
}

function isAssetReferenceType(type: string | undefined): boolean {
	return type === 'asset' || type === 'content-reference' || type === 'asset-reference';
}

function isFragmentReferenceType(type: string | undefined): boolean {
	return type === 'fragment' || type === 'content-fragment' || type === 'fragment-reference';
}

function hasLegacyReferenceItems(ref: AuthorHydratedReference): boolean {
	return Array.isArray(ref.items) && ref.items.length > 0;
}

function referenceItemToValue(
	item: AuthorReferenceItem,
	mapFragment: (fragment: AuthorFragment) => CFFragment,
	env?: AppEnv
): unknown {
	if (item.type === 'fragment' && item.fragment) {
		return mapFragment(item.fragment);
	}
	return assetUrlFromItem(item, env);
}

function flatReferenceToValue(
	ref: AuthorHydratedReference,
	mapFragment: (fragment: AuthorFragment) => CFFragment,
	env?: AppEnv
): unknown {
	if (ref.fragment) {
		return mapFragment(ref.fragment);
	}

	if (isAssetReferenceType(ref.type)) {
		return assetUrlFromItem(flatReferenceToItem(ref), env);
	}

	if (isFragmentReferenceType(ref.type)) {
		return mapFragment(nestedReferenceToAuthorFragment(ref));
	}

	return undefined;
}

function referenceEntryToFieldValue(
	ref: AuthorHydratedReference,
	mapFragment: (fragment: AuthorFragment) => CFFragment,
	env?: AppEnv
): unknown {
	if (hasLegacyReferenceItems(ref)) {
		return referenceItemsToFieldValue(ref, mapFragment, env);
	}

	return flatReferenceToValue(ref, mapFragment, env);
}

/** Overlay `references=all-hydrated` data onto flat field map (fragments + assets). */
export function applyAuthorReferences(
	fragment: AuthorFragment,
	flatFields: Record<string, unknown>,
	mapFragment: (fragment: AuthorFragment) => CFFragment,
	env?: AppEnv
): void {
	for (const ref of fragment.references ?? []) {
		const value = referenceEntryToFieldValue(ref, mapFragment, env);
		if (value !== undefined) {
			flatFields[ref.fieldName] = value;
		}
	}
}

function referenceItemsToFieldValue(
	ref: AuthorHydratedReference,
	mapFragment: (fragment: AuthorFragment) => CFFragment,
	env?: AppEnv
): unknown {
	const items = ref.items ?? [];
	if (items.length === 0) return undefined;

	const values = items
		.map((item) => referenceItemToValue(item, mapFragment, env))
		.filter((v) => v !== undefined && v !== null);

	if (values.length === 0) return undefined;
	if (values.length === 1) return values[0];
	return values;
}
