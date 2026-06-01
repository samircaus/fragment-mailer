/** Author Sites CF Management API — nested fragment + asset hydration. */
export const AUTHOR_CF_REFERENCES = 'all-hydrated';

/** Publish Content Fragment Delivery API — same semantics as Author. */
export const DELIVERY_CF_REFERENCES = 'all-hydrated';

/** Default nested depth: email → referenced offer → banner asset. */
export const DEFAULT_CF_REFERENCE_DEPTH = 3;

export function cfReferenceDepth(env?: { AEM_CF_REFERENCE_DEPTH?: string }): number {
	const raw = env?.AEM_CF_REFERENCE_DEPTH?.trim();
	if (!raw) return DEFAULT_CF_REFERENCE_DEPTH;
	const n = Number.parseInt(raw, 10);
	return Number.isFinite(n) && n > 0 ? n : DEFAULT_CF_REFERENCE_DEPTH;
}

export function authorFragmentQueryParams(env?: { AEM_CF_REFERENCE_DEPTH?: string }): URLSearchParams {
	const qs = new URLSearchParams({ references: AUTHOR_CF_REFERENCES });
	const depth = cfReferenceDepth(env);
	if (depth > 0) qs.set('depth', String(depth));
	return qs;
}
