import type { Brand } from '$lib/personas/types.js';

const DEFAULT_LOGO = 'https://via.placeholder.com/120x40?text=Logo';
const DEFAULT_PRIVACY = 'https://example.com/privacy';

export function buildStaticContext(brand: Brand | string): Record<string, unknown> {
	const resolved =
		typeof brand === 'string'
			? { id: 'legacy', label: brand.trim() || 'Acme Corp', name: brand.trim() || 'Acme Corp' }
			: brand;

	return {
		year: new Date().getFullYear(),
		companyName: resolved.name,
		logoUrl: resolved.logoUrl ?? DEFAULT_LOGO,
		unsubscribeUrl: '{{static.unsubscribeUrl}}',
		privacyUrl: resolved.privacyUrl ?? DEFAULT_PRIVACY
	};
}
