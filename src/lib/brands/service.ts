import { getDb } from '$lib/db/email-status.js';
import {
	clearPreviewBrandsMemoryStore,
	countPreviewBrands,
	deleteBrandRow,
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
import type { Brand, BrandListItem } from '$lib/personas/types.js';

export type { Brand, BrandListItem };

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

function rowToBrandListItem(row: Awaited<ReturnType<typeof listBrandRows>>[number]): BrandListItem {
	return { ...rowToBrand(row), isBuiltin: row.isBuiltin };
}

export async function listBrands(platform?: App.Platform): Promise<BrandListItem[]> {
	const db = getDb(platform);
	await ensureSeeded(db);
	const rows = await listBrandRows(db);
	if (rows.length === 0) {
		return SAMPLE_BRANDS.map((brand) => ({ ...structuredClone(brand), isBuiltin: true }));
	}
	return rows.map(rowToBrandListItem);
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

export async function createBrand(
	platform: App.Platform | undefined,
	id: string,
	data: unknown
): Promise<{ ok: true; brand: BrandListItem } | { ok: false; error: string }> {
	const trimmedId = id.trim();
	if (!trimmedId) return { ok: false, error: 'Brand id is required' };
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedId)) {
		return { ok: false, error: 'Brand id must be lowercase letters, numbers, and hyphens' };
	}

	const result = validateBrandData(data, trimmedId);
	if (!result.ok) return result;

	const db = getDb(platform);
	await ensureSeeded(db);

	const existing = await getBrandRow(db, trimmedId);
	if (existing) return { ok: false, error: `Brand "${trimmedId}" already exists` };

	await insertBrandRow(db, result.brand, false);
	return { ok: true, brand: { ...result.brand, isBuiltin: false } };
}

export async function deleteBrand(
	platform: App.Platform | undefined,
	id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
	const db = getDb(platform);
	await ensureSeeded(db);

	const row = await getBrandRow(db, id);
	if (!row) return { ok: false, error: `Brand "${id}" not found` };
	if (row.isBuiltin) return { ok: false, error: 'Built-in brands cannot be deleted' };

	const count = await countPreviewBrands(db);
	if (count <= 1) return { ok: false, error: 'Cannot delete the only brand' };

	const deleted = await deleteBrandRow(db, id);
	if (!deleted) return { ok: false, error: `Brand "${id}" not found` };
	return { ok: true };
}

export function resetBrandStoreForTests(): void {
	seeded = false;
	seeding = null;
	clearPreviewBrandsMemoryStore();
}
