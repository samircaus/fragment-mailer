import { applyAuthorReferences } from './author-references.js';
import { normalizeCfModelPath } from './cf-model-scope.js';
import { contentFragmentToCFFragment } from './client.js';
import type { AppEnv } from './env.js';
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

export function authorFragmentToCFFragment(fragment: AuthorFragment, env?: AppEnv): CFFragment {
	const flatFields: Record<string, unknown> = {};
	for (const field of fragment.fields ?? []) {
		flatFields[field.name] = field.multiple ? field.values : (field.values[0] ?? null);
	}

	applyAuthorReferences(fragment, flatFields, (f) => authorFragmentToCFFragment(f, env), env);

	const item: ContentFragmentItem = {
		id: fragment.id,
		path: fragment.path,
		_path: fragment.path,
		title: fragment.title,
		modified: fragment.modified?.at,
		fields: flatFields,
		_model: {
			_path: normalizeCfModelPath(fragment.model?.id ?? ''),
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
