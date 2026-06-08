// Recursively normalize AEM CF field values for template rendering (nested refs + assets).

import { resolveAssetImageUrl } from './dynamic-media.js';
import type { AppEnv } from './env.js';

function isImageFieldName(name: string): boolean {
	return /(?:^|_)(?:image|banner|photo|thumbnail)(?:$|_)/i.test(name);
}

function isRichTextFieldName(name: string): boolean {
	return /(?:copy|body|html|richtext|description)/i.test(name);
}

function resolveAssetUrl(image: Record<string, unknown>, env?: AppEnv): string | undefined {
	return (
		resolveAssetImageUrl(image, env) ||
		(typeof image._publishUrl === 'string' && image._publishUrl) ||
		(typeof image._dynamicUrl === 'string' && image._dynamicUrl) ||
		(typeof image._path === 'string' && image._path) ||
		undefined
	);
}

function isAssetShape(value: Record<string, unknown>): boolean {
	return (
		typeof value._publishUrl === 'string' ||
		typeof value._dynamicUrl === 'string' ||
		value.type === 'image' ||
		(typeof value._path === 'string' && /\.(jpe?g|png|gif|webp|svg)/i.test(value._path))
	);
}

function isRichTextShape(value: Record<string, unknown>): boolean {
	return 'html' in value || 'plaintext' in value || 'markdown' in value || 'json' in value;
}

function isContentFragmentShape(value: Record<string, unknown>): boolean {
	return typeof value._path === 'string' || value._model !== undefined;
}

function stripFragmentMeta(obj: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		if (
			(key.startsWith('_') && key !== '_path') ||
			key === 'id' ||
			key === '_variations' ||
			key === '_tags' ||
			key === '_metadata'
		) {
			continue;
		}
		out[key] = value;
	}
	return out;
}

function normalizeFieldValue(value: unknown, fieldName: string, env?: AppEnv): unknown {
	if (value === null || value === undefined) return value;
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map((item) => normalizeFieldValue(item, fieldName, env));
	}

	if (typeof value !== 'object') return value;

	const obj = value as Record<string, unknown>;

	if (isAssetShape(obj) || isImageFieldName(fieldName)) {
		const url = resolveAssetUrl(obj, env);
		if (url) return url;
	}

	if (isRichTextShape(obj) || isRichTextFieldName(fieldName)) {
		if (typeof obj.html === 'string') return obj.html;
		if (typeof obj.plaintext === 'string') return obj.plaintext;
		if (typeof obj.markdown === 'string') return obj.markdown;
	}

	if (isContentFragmentShape(obj)) {
		return normalizeFragmentFields(stripFragmentMeta(obj), env);
	}

	const nested: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(obj)) {
		if (key.startsWith('_')) continue;
		nested[key] = normalizeFieldValue(child, key, env);
	}
	return nested;
}

/** Normalize top-level and nested CF fields for {{ cf.* }} rendering. */
export function normalizeFragmentFields(
	fields: Record<string, unknown>,
	env?: AppEnv
): Record<string, unknown> {
	const out: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(fields)) {
		if (key === '_path' && typeof value === 'string') {
			out._path = value;
			continue;
		}
		if (key.startsWith('_') || key === 'id' || key.endsWith('Html') || key.endsWith('Url')) {
			continue;
		}
		const normalized = normalizeFieldValue(value, key, env);
		if (
			key !== '_path' &&
			normalized !== null &&
			typeof normalized === 'object' &&
			!Array.isArray(normalized) &&
			typeof value === 'object' &&
			value !== null &&
			!Array.isArray(value) &&
			typeof (value as Record<string, unknown>)._path === 'string'
		) {
			(out as Record<string, unknown>)[key] = {
				_path: (value as Record<string, unknown>)._path,
				...(normalized as Record<string, unknown>)
			};
			continue;
		}
		out[key] = normalized;
	}

	// Backward-compatible derived keys on the root fragment only.
	const emailCopy = out.emailCopy;
	if (typeof emailCopy === 'string') {
		out.emailCopyHtml = emailCopy;
	}

	const bannerImage = out.bannerImage;
	if (typeof bannerImage === 'string') {
		out.bannerImageUrl = bannerImage;
	}

	return out;
}
