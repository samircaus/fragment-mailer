// AEM / Experience Cloud deep links for content fragments.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_EXP_TENANT = 'psc';

/** AJO content template ids from the Platform API (path segment safe). */
const AJO_TEMPLATE_ID_RE = /^[^/?#\s]+$/;

/** AJO fragment and publication ids (UUID). */
const AJO_FRAGMENT_ID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 * AJO Journey Optimizer email content template in Experience Cloud.
 * Example:
 *   https://experience.adobe.com/?repo=author-p125048-e1847106.adobeaemcloud.com#/@psc/sname:prod/journey-optimizer/content-templates/details/{id}/email
 */
export function ajoExperienceCloudTemplateUrl(
	templateId: string,
	authorBaseUrl: string | null | undefined,
	tenantSlug: string = DEFAULT_EXP_TENANT,
	sandboxName: string = 'prod'
): string | null {
	if (!templateId?.trim() || !authorBaseUrl?.trim()) return null;

	const id = templateId.trim();
	if (!AJO_TEMPLATE_ID_RE.test(id)) return null;

	const repo = authorRepoHost(authorBaseUrl);
	const tenant = tenantSlug.trim() || DEFAULT_EXP_TENANT;
	const sandbox = sandboxName.trim() || 'prod';

	return `https://experience.adobe.com/?repo=${encodeURIComponent(repo)}#/@${encodeURIComponent(tenant)}/sname:${encodeURIComponent(sandbox)}/journey-optimizer/content-templates/details/${encodeURIComponent(id)}/email`;
}

/**
 * AJO Journey Optimizer expression fragment in Experience Cloud.
 * Example:
 *   https://experience.adobe.com/?repo=author-p125048-e1847106.adobeaemcloud.com#/@psc/sname:prod/journey-optimizer/fragments/{fragmentId}/publications/{publicationId}
 */
export function ajoExperienceCloudFragmentUrl(
	fragmentId: string,
	publicationId: string,
	authorBaseUrl: string | null | undefined,
	tenantSlug: string = DEFAULT_EXP_TENANT,
	sandboxName: string = 'prod'
): string | null {
	if (!fragmentId?.trim() || !publicationId?.trim() || !authorBaseUrl?.trim()) return null;

	const fragId = fragmentId.trim();
	const pubId = publicationId.trim();
	if (!AJO_FRAGMENT_ID_RE.test(fragId) || !AJO_FRAGMENT_ID_RE.test(pubId)) return null;

	const repo = authorRepoHost(authorBaseUrl);
	const tenant = tenantSlug.trim() || DEFAULT_EXP_TENANT;
	const sandbox = sandboxName.trim() || 'prod';

	return `https://experience.adobe.com/?repo=${encodeURIComponent(repo)}#/@${encodeURIComponent(tenant)}/sname:${encodeURIComponent(sandbox)}/journey-optimizer/fragments/${encodeURIComponent(fragId)}/publications/${encodeURIComponent(pubId)}`;
}

/**
 * CF admin console for a DAM folder (create / open fragments in folder).
 * Example:
 *   https://experience.adobe.com/?repo=author-p125048-e1847106.adobeaemcloud.com#/@psc/aem/cf/admin/content/dam/email/en/campaigns
 */
export function cfExperienceCloudBrowseUrl(
	damFolderPath: string,
	authorBaseUrl: string | null | undefined,
	tenantSlug: string = DEFAULT_EXP_TENANT
): string | null {
	if (!damFolderPath?.trim() || !authorBaseUrl?.trim()) return null;

	const path = damFolderPath.trim().replace(/\/$/, '');
	if (!path.startsWith('/content/')) return null;

	const repo = authorRepoHost(authorBaseUrl);
	const tenant = tenantSlug.trim() || DEFAULT_EXP_TENANT;

	return `https://experience.adobe.com/?repo=${encodeURIComponent(repo)}#/@${encodeURIComponent(tenant)}/aem/cf/admin${path}`;
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

/** CF model admin console on Author (browse / edit models). */
export function cfModelsConsoleUrl(authorBaseUrl: string | null | undefined): string | null {
	if (!authorBaseUrl?.trim()) return null;
	const base = authorBaseUrl.trim().replace(/\/$/, '');
	return `${base}/mnt/overlay/dam/cfm/models/console/content/models.html`;
}

/**
 * Experience Cloud CF model editor for a Sites CF Management API model id.
 * Example:
 *   https://experience.adobe.com/?repo=author-p125048-e1847106.adobeaemcloud.com#/@psc/aem/cf/model-editor/id/L2NvbmYvZW1haWw...
 */
export function cfExperienceCloudModelEditorUrl(
	modelId: string,
	authorBaseUrl: string | null | undefined,
	tenantSlug: string = DEFAULT_EXP_TENANT
): string | null {
	if (!modelId?.trim() || !authorBaseUrl?.trim()) return null;

	const repo = authorRepoHost(authorBaseUrl);
	const tenant = tenantSlug.trim() || DEFAULT_EXP_TENANT;
	const id = encodeURIComponent(modelId.trim());

	return `https://experience.adobe.com/?repo=${encodeURIComponent(repo)}#/@${encodeURIComponent(tenant)}/aem/cf/model-editor/id/${id}`;
}

/** Adobe Sites CF Management API — model endpoints reference. */
export const CF_MODELS_API_DOC_URL =
	'https://developer.adobe.com/experience-cloud/experience-manager-apis/api/stable/sites/#tag/Model-Management';

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
