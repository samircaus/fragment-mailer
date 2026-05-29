import { getDb } from '$lib/db/email-status.js';
import {
	clearPreviewBrandsMemoryStore,
	countPreviewBrands,
	getBrandRow,
	getBrandRowByName,
	insertBrandRow,
	listBrandRows,
	rowToBrand,
	updateBrandRow,
	type BrandDbLike
} from '$lib/db/preview-brands.js';
import { validateBrandData } from '$lib/brands/validate.js';
import { getBundledBrand, getBundledBrandByName, SAMPLE_BRANDS } from '$lib/personas/bundled.js';
import type { Brand } from '$lib/personas/types.js';

export type { Brand };

let seeded = false;
let seeding: Promise<void> | null = null;

async function ensureSeeded(db: BrandDbLike | undefined): Promise<void> {
	if (seeded) return;
	if (seeding) {
		await seeding;
		return;
	}

	seeding = (async () => {
		const count = await countPreviewBrands(db);
		if (count === 0) {
			for (const brand of SAMPLE_BRANDS) {
				await insertBrandRow(db, brand, true);
			}
		}
		seeded = true;
	})();

	try {
		await seeding;
	} finally {
		seeding = null;
	}
}

export async function listBrands(platform?: App.Platform): Promise<Brand[]> {
	const db = getDb(platform);
	await ensureSeeded(db);
	const rows = await listBrandRows(db);
	if (rows.length === 0) return structuredClone(SAMPLE_BRANDS);
	return rows.map(rowToBrand);
}

export async function getBrandById(
	platform: App.Platform | undefined,
	id: string
): Promise<Brand | null> {
	const db = getDb(platform);
	await ensureSeeded(db);

	const row = await getBrandRow(db, id);
	if (row) return rowToBrand(row);

	const bundled = getBundledBrand(id);
	return bundled ? structuredClone(bundled) : null;
}

export async function resolveBrand(
	platform: App.Platform | undefined,
	opts: { brandId?: string | null; brandName?: string | null }
): Promise<Brand> {
	const db = getDb(platform);
	await ensureSeeded(db);

	if (opts.brandId) {
		const byId = await getBrandById(platform, opts.brandId);
		if (byId) return byId;
	}

	const name = opts.brandName?.trim();
	if (name) {
		const row = await getBrandRowByName(db, name);
		if (row) return rowToBrand(row);
		const bundled = getBundledBrandByName(name);
		if (bundled) return structuredClone(bundled);
		return { id: 'custom', label: name, name };
	}

	const brands = await listBrands(platform);
	return brands[0] ?? SAMPLE_BRANDS[0];
}

export async function updateBrand(
	platform: App.Platform | undefined,
	id: string,
	data: unknown
): Promise<{ ok: true; brand: Brand } | { ok: false; error: string }> {
	const result = validateBrandData(data, id);
	if (!result.ok) return result;

	const db = getDb(platform);
	await ensureSeeded(db);
	const saved = await updateBrandRow(db, result.brand);
	if (!saved) return { ok: false, error: `Brand "${id}" not found` };
	return { ok: true, brand: result.brand };
}

export function resetBrandStoreForTests(): void {
	seeded = false;
	seeding = null;
	clearPreviewBrandsMemoryStore();
}
