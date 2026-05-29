import type { Brand } from '$lib/personas/types.js';

export function brandSubtitle(brand: Brand): string {
	return brand.name;
}

export function validateBrandData(
	data: unknown,
	expectedId: string
): { ok: true; brand: Brand } | { ok: false; error: string } {
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return { ok: false, error: 'Brand must be a JSON object' };
	}

	const obj = data as Record<string, unknown>;
	if (typeof obj.name !== 'string' || !obj.name.trim()) {
		return { ok: false, error: '"name" is required (maps to {{static.companyName}})' };
	}

	const brand: Brand = {
		id: expectedId,
		label:
			typeof obj.label === 'string' && obj.label.trim()
				? obj.label.trim()
				: obj.name.trim().slice(0, 120),
		name: obj.name.trim().slice(0, 120)
	};

	if (typeof obj.logoUrl === 'string' && obj.logoUrl.trim()) {
		brand.logoUrl = obj.logoUrl.trim();
	}
	if (typeof obj.privacyUrl === 'string' && obj.privacyUrl.trim()) {
		brand.privacyUrl = obj.privacyUrl.trim();
	}

	return { ok: true, brand };
}
