// Universal Editor request context helpers.

const UE_REFERER_PREFIX = 'https://experience.adobe.com';

/** True when the request is framed inside Adobe Experience Cloud / Universal Editor. */
export function isUniversalEditorReferer(referer: string | null | undefined): boolean {
	if (!referer) return false;
	return referer.startsWith(UE_REFERER_PREFIX);
}

/** JCR path to the CF master variation — required for UE property resolution. */
export function cfMasterVariationPath(cfPath: string): string {
	const trimmed = cfPath.replace(/\/$/, '');
	if (trimmed.endsWith('/jcr:content/data/master')) return trimmed;
	return `${trimmed}/jcr:content/data/master`;
}

/** AEM connection URN used by data-aue-resource attributes. */
export function cfUeResourceUrn(cfPath: string): string {
	return `urn:aemconnection:${cfMasterVariationPath(cfPath)}`;
}
