// AEM / Experience Cloud deep links for content fragments.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_EXP_TENANT = 'psc';

/** Hostname (and port) for UE canvas paths — no protocol. */
export function appCanvasHost(originOrHost: string): string {
	const trimmed = originOrHost.trim();
	if (!trimmed) return '';

	try {
		if (trimmed.includes('://')) {
			return new URL(trimmed).host;
		}
	} catch {
		return trimmed.replace(/\/$/, '');
	}

	return trimmed.replace(/\/$/, '');
}

/** Author hostname for ?repo= (no protocol). */
export function authorRepoHost(authorBaseUrl: string): string {
	return authorBaseUrl.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

/**
 * New Sites CF editor in Experience Cloud.
 * Example:
 *   https://experience.adobe.com/?repo=author-p125048-e1847106.adobeaemcloud.com#/@psc/aem/cf/editor/editor/{uuid}
 */
export function cfExperienceCloudEditorUrl(
	fragmentUuid: string,
	authorBaseUrl: string | null | undefined,
	tenantSlug: string = DEFAULT_EXP_TENANT
): string | null {
	if (!fragmentUuid?.trim() || !authorBaseUrl?.trim()) return null;

	const uuid = fragmentUuid.trim();
	if (!UUID_RE.test(uuid)) return null;

	const repo = authorRepoHost(authorBaseUrl);
	const tenant = tenantSlug.trim() || DEFAULT_EXP_TENANT;

	return `https://experience.adobe.com/?repo=${encodeURIComponent(repo)}#/@${encodeURIComponent(tenant)}/aem/cf/editor/editor/${encodeURIComponent(uuid)}`;
}

/**
 * Universal Editor canvas URL for in-context email preview editing.
 * Uses the current app host so dev/staging/prod each open the matching deployment.
 *
 * Example:
 *   https://experience.adobe.com/?repo=author-p125048-e1847106.adobeaemcloud.com#/@psc/aem/editor/canvas/fragment-mailer.example.workers.dev/preview/spring-promo
 */
export function universalEditorCanvasUrl(
	campaignId: string,
	appOrigin: string,
	authorBaseUrl: string | null | undefined,
	tenantSlug: string = DEFAULT_EXP_TENANT
): string | null {
	if (!campaignId?.trim() || !authorBaseUrl?.trim()) return null;

	const host = appCanvasHost(appOrigin);
	if (!host) return null;

	const repo = authorRepoHost(authorBaseUrl);
	const tenant = tenantSlug.trim() || DEFAULT_EXP_TENANT;
	const id = encodeURIComponent(campaignId.trim());

	return `https://experience.adobe.com/?repo=${encodeURIComponent(repo)}#/@${encodeURIComponent(tenant)}/aem/editor/canvas/${host}/preview/${id}`;
}

/** @deprecated Classic Touch UI — use cfExperienceCloudEditorUrl when UUID is available. */
export function cfAuthorEditorUrl(
	cfPath: string,
	authorBaseUrl: string | null | undefined
): string | null {
	if (!cfPath?.trim() || !authorBaseUrl?.trim()) return null;

	const base = authorBaseUrl.trim().replace(/\/$/, '');
	const path = cfPath.trim().replace(/\/$/, '');
	if (!path.startsWith('/content/')) return null;

	return `${base}/editor.html${path}.html`;
}

/** Assets console URL (browse / properties) for the same fragment. */
export function cfAuthorAssetsUrl(
	cfPath: string,
	authorBaseUrl: string | null | undefined
): string | null {
	if (!cfPath?.trim() || !authorBaseUrl?.trim()) return null;

	const base = authorBaseUrl.trim().replace(/\/$/, '');
	const path = cfPath.trim().replace(/\/$/, '');
	if (!path.startsWith('/content/')) return null;

	return `${base}/assets.html${path}`;
}
