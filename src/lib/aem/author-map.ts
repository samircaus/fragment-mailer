import { contentFragmentToCFFragment } from './client.js';
import type { CFFragment, ContentFragmentItem } from './types.js';
import type { AuthorFragment } from '$lib/types/aem.js';

export function authorFragmentToListItem(fragment: AuthorFragment): ContentFragmentItem {
	return {
		id: fragment.id,
		path: fragment.path,
		_path: fragment.path,
		title: fragment.title,
		modified: fragment.modified?.at
	};
}

export function authorFragmentToCFFragment(fragment: AuthorFragment): CFFragment {
	const flatFields: Record<string, unknown> = {};
	for (const field of fragment.fields ?? []) {
		flatFields[field.name] = field.multiple ? field.values : (field.values[0] ?? null);
	}

	for (const ref of fragment.references ?? []) {
		const hydrated = ref.items?.find((i) => i.fragment)?.fragment;
		if (hydrated) {
			flatFields[ref.fieldName] = authorFragmentToCFFragment(hydrated);
		}
	}

	const item: ContentFragmentItem = {
		id: fragment.id,
		path: fragment.path,
		_path: fragment.path,
		title: fragment.title,
		modified: fragment.modified?.at,
		fields: flatFields,
		_model: {
			_path: fragment.model?.id ?? '',
			title: fragment.model?.title ?? 'Content Fragment'
		},
		_variation: 'master',
		_metadata: {
			stringMetadata: fragment.modified?.at
				? [{ name: 'cq:lastModified', value: fragment.modified.at }]
				: []
		}
	};

	return contentFragmentToCFFragment(item);
}
