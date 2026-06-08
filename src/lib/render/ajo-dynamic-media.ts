// Replace AJO image personalization tokens with Dynamic Media URLs at export time.

import { resolveAssetImageUrl } from '$lib/aem/dynamic-media.js';
import { useDynamicMedia, type AppEnv } from '$lib/aem/env.js';
import type { AuthorFragment, AuthorHydratedReference } from '$lib/types/aem.js';
import type { ParsedLoadTag } from './ajo-load-tags.js';

function isAssetReferenceType(type: string | undefined): boolean {
	return type === 'asset' || type === 'content-reference' || type === 'asset-reference';
}

function isFragmentReferenceType(type: string | undefined): boolean {
	return type === 'fragment' || type === 'content-fragment' || type === 'fragment-reference';
}

function flatReferenceToAuthorFragment(ref: AuthorHydratedReference): AuthorFragment {
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

function resolveNestedFragment(ref: AuthorHydratedReference): AuthorFragment | null {
	const legacyItem = ref.items?.[0];
	if (legacyItem?.type === 'fragment' && legacyItem.fragment) {
		return legacyItem.fragment;
	}
	if (ref.fragment) return ref.fragment;
	if (isFragmentReferenceType(ref.type)) {
		return flatReferenceToAuthorFragment(ref);
	}
	return null;
}

function fragmentForRefExpression(
	campaign: AuthorFragment,
	refExpression: string
): AuthorFragment | null {
	const expr = refExpression.trim();
	if (expr === 'this' || expr === 'cf') return campaign;

	const path = expr.startsWith('cf.') ? expr.slice(3) : expr;
	const parts = path.split('.').filter(Boolean);
	let current: AuthorFragment | null = campaign;

	for (const part of parts) {
		if (!current) return null;
		const ref = current.references?.find((r) => r.fieldName === part);
		if (!ref) return null;
		const nested = resolveNestedFragment(ref);
		if (!nested) return null;
		current = nested;
	}

	return current;
}

function collectAssetUrls(
	fragment: AuthorFragment,
	prefix: string,
	env: AppEnv | undefined,
	out: Map<string, string>
): void {
	for (const ref of fragment.references ?? []) {
		for (const item of ref.items ?? []) {
			if (item.type !== 'asset') continue;
			const dmUrl = resolveAssetImageUrl(item, env);
			if (dmUrl) out.set(`${prefix}.${ref.fieldName}`, dmUrl);
		}

		if (isAssetReferenceType(ref.type)) {
			const dmUrl = resolveAssetImageUrl(ref, env);
			if (dmUrl) out.set(`${prefix}.${ref.fieldName}`, dmUrl);
		}

		const nested = resolveNestedFragment(ref);
		if (nested && isFragmentReferenceType(ref.type)) {
			collectAssetUrls(nested, `${prefix}.${ref.fieldName}`, env, out);
		}
	}
}

/** Map AJO personalization paths (e.g. cf.bannerImage) to Dynamic Media URLs. */
export function buildAjoImageUrlMap(
	campaign: AuthorFragment,
	loadTags: ParsedLoadTag[],
	env?: AppEnv
): Map<string, string> {
	const map = new Map<string, string>();
	if (!useDynamicMedia(env)) return map;

	for (const tag of loadTags) {
		const fragment = fragmentForRefExpression(campaign, tag.refExpression);
		if (!fragment) continue;
		collectAssetUrls(fragment, tag.varName, env, map);
	}

	return map;
}

/** Substitute image src tokens with resolved Dynamic Media URLs when enabled. */
export function applyDynamicMediaImageUrls(
	html: string,
	campaign: AuthorFragment,
	loadTags: ParsedLoadTag[],
	env?: AppEnv
): string {
	if (!useDynamicMedia(env)) return html;

	const map = buildAjoImageUrlMap(campaign, loadTags, env);
	if (map.size === 0) return html;

	return html.replace(
		/\b(src)(\s*=\s*)(["'])\{\{([^}]+)\}\}\3/gi,
		(full, attr: string, eq: string, quote: string, expr: string) => {
			const key = expr.trim();
			const dmUrl = map.get(key);
			if (dmUrl) return `${attr}${eq}${quote}${dmUrl}${quote}`;
			return full;
		}
	);
}
