// Adobe AEM Assets Delivery (Dynamic Media) SEO URL builder.
// @see https://developer.adobe.com/experience-cloud/experience-manager-apis/api/stable/assets/delivery/#operation/getAssetSeoFormat

import type { AuthorReferenceItem } from '$lib/types/aem.js';
import {
	deliveryHostFromEnv,
	publishHostRepoId,
	useDynamicMedia,
	type AppEnv
} from './env.js';

const IMAGE_EXT_RE = /\.([a-z0-9]{2,5})$/i;

/** SEO segment in /as/{seoName}.{format} — cosmetic; Adobe examples often use "image". */
export function seoNameFromAssetPath(path: string): string {
	const leaf = path.split('/').filter(Boolean).pop() ?? '';
	const dot = leaf.lastIndexOf('.');
	const stem = dot > 0 ? leaf.slice(0, dot) : leaf;
	const sanitized = stem.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
	return sanitized || 'image';
}

/** Output format extension from the DAM filename (preserves .jpeg as jpeg). */
export function formatFromAssetPath(path: string): string {
	const leaf = path.split('/').filter(Boolean).pop() ?? '';
	const match = leaf.match(IMAGE_EXT_RE);
	if (!match) return 'png';
	return match[1].toLowerCase();
}

/** Normalize AEM asset id to the opaque repository id (URN when given a UUID). */
export function normalizeAssetId(id: string): string {
	const trimmed = id.trim();
	if (trimmed.startsWith('urn:')) return trimmed;
	if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
		return `urn:aaid:aem:${trimmed}`;
	}
	return trimmed;
}

export function buildDynamicMediaUrl(params: {
	deliveryHost: string;
	assetId: string;
	seoName: string;
	format: string;
}): string {
	const host = params.deliveryHost.replace(/^https?:\/\//i, '').replace(/\/$/, '');
	return `https://${host}/adobe/assets/${params.assetId}/as/${params.seoName}.${params.format}`;
}

/** Only approved/published assets are served from the delivery-* CDN; DRAFT assets 404. */
export function isAssetDeliverableForDynamicMedia(asset: Record<string, unknown>): boolean {
	const status = typeof asset.status === 'string' ? asset.status.trim().toUpperCase() : '';
	return status !== 'DRAFT';
}

export function publishAssetUrlFromPath(path: string, env?: AppEnv): string | undefined {
	if (!path.startsWith('/content/')) return undefined;
	const host = publishHostRepoId(env);
	if (!host) return path;
	return `https://${host}${path}`;
}

function assetPathFromRecord(asset: Record<string, unknown>): string | undefined {
	if (typeof asset.path === 'string' && asset.path) return asset.path;
	if (typeof asset._path === 'string' && asset._path) return asset._path;
	return undefined;
}

function assetIdFromRecord(asset: Record<string, unknown>): string | undefined {
	if (typeof asset.assetId === 'string' && asset.assetId) return asset.assetId;
	if (typeof asset.id === 'string' && asset.id) return asset.id;
	return undefined;
}

function publishFallbackUrl(asset: Record<string, unknown>, env?: AppEnv): string | undefined {
	return (
		(typeof asset._publishUrl === 'string' && asset._publishUrl) ||
		(typeof asset.url === 'string' && asset.url) ||
		(typeof asset._dynamicUrl === 'string' && asset._dynamicUrl) ||
		publishAssetUrlFromPath(assetPathFromRecord(asset) ?? '', env) ||
		(typeof asset.path === 'string' && asset.path) ||
		undefined
	);
}

/** Build a Dynamic Media delivery URL from hydrated asset metadata. */
export function dynamicMediaUrlFromAsset(
	asset: AuthorReferenceItem | Record<string, unknown>,
	env?: AppEnv
): string | undefined {
	if (!useDynamicMedia(env)) return undefined;
	if (!isAssetDeliverableForDynamicMedia(asset as Record<string, unknown>)) return undefined;

	const deliveryHost = deliveryHostFromEnv(env);
	if (!deliveryHost) return undefined;

	const record = asset as Record<string, unknown>;
	const assetId = assetIdFromRecord(record);
	const path = assetPathFromRecord(record);
	if (!assetId || !path) return undefined;

	return buildDynamicMediaUrl({
		deliveryHost,
		assetId: normalizeAssetId(assetId),
		seoName: seoNameFromAssetPath(path),
		format: formatFromAssetPath(path)
	});
}

/** Resolve image URL: Dynamic Media when deliverable, otherwise publish/DAM fallback. */
export function resolveAssetImageUrl(
	asset: AuthorReferenceItem | Record<string, unknown>,
	env?: AppEnv
): string | undefined {
	if (useDynamicMedia(env)) {
		const dmUrl = dynamicMediaUrlFromAsset(asset, env);
		if (dmUrl) return dmUrl;
	}

	return publishFallbackUrl(asset as Record<string, unknown>, env);
}
