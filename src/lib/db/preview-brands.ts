import type { D1Database } from '@cloudflare/workers-types';
import type { Brand, BrandData } from '$lib/personas/types.js';

type DbLike = Pick<D1Database, 'prepare' | 'batch'>;

export interface BrandRow {
	id: string;
	label: string;
	dataJson: string;
	isBuiltin: boolean;
	createdAt: string;
	updatedAt: string;
}

const memoryStore = new Map<string, BrandRow>();

function rowFromDb(record: Record<string, unknown>): BrandRow {
	return {
		id: String(record.id),
		label: String(record.label),
		dataJson: String(record.data_json),
		isBuiltin: Number(record.is_builtin) === 1,
		createdAt: String(record.created_at),
		updatedAt: String(record.updated_at)
	};
}

export function rowToBrand(row: BrandRow): Brand {
	const data = JSON.parse(row.dataJson) as BrandData;
	return { id: row.id, ...data };
}

export async function countPreviewBrands(db: DbLike | undefined): Promise<number> {
	if (!db) return memoryStore.size;
	const row = await db.prepare('SELECT COUNT(*) AS count FROM preview_brands').first<{ count: number }>();
	return row?.count ?? 0;
}

export async function listBrandRows(db: DbLike | undefined): Promise<BrandRow[]> {
	if (!db) return [...memoryStore.values()].sort((a, b) => a.label.localeCompare(b.label));

	const result = await db
		.prepare(
			`SELECT id, label, data_json, is_builtin, created_at, updated_at
			FROM preview_brands ORDER BY label ASC`
		)
		.all<Record<string, unknown>>();

	return (result.results ?? []).map(rowFromDb);
}

export async function getBrandRow(db: DbLike | undefined, id: string): Promise<BrandRow | null> {
	if (!db) return memoryStore.get(id) ?? null;

	const row = await db
		.prepare(
			`SELECT id, label, data_json, is_builtin, created_at, updated_at
			FROM preview_brands WHERE id = ?`
		)
		.bind(id)
		.first<Record<string, unknown>>();

	return row ? rowFromDb(row) : null;
}

export async function getBrandRowByName(db: DbLike | undefined, name: string): Promise<BrandRow | null> {
	if (!db) {
		for (const row of memoryStore.values()) {
			const brand = rowToBrand(row);
			if (brand.name === name) return row;
		}
		return null;
	}

	const rows = await listBrandRows(db);
	for (const row of rows) {
		if (rowToBrand(row).name === name) return row;
	}
	return null;
}

export async function insertBrandRow(
	db: DbLike | undefined,
	brand: Brand,
	isBuiltin = false
): Promise<void> {
	const now = new Date().toISOString();
	const { id, ...data } = brand;
	const row: BrandRow = {
		id,
		label: brand.label,
		dataJson: JSON.stringify(data),
		isBuiltin,
		createdAt: now,
		updatedAt: now
	};

	if (!db) {
		memoryStore.set(id, row);
		return;
	}

	await db
		.prepare(
			`INSERT INTO preview_brands (id, label, data_json, is_builtin, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?)`
		)
		.bind(id, row.label, row.dataJson, isBuiltin ? 1 : 0, now, now)
		.run();
}

export async function updateBrandRow(db: DbLike | undefined, brand: Brand): Promise<boolean> {
	const existing = await getBrandRow(db, brand.id);
	if (!existing) return false;

	const now = new Date().toISOString();
	const { id, ...data } = brand;
	const next: BrandRow = {
		...existing,
		label: brand.label,
		dataJson: JSON.stringify(data),
		updatedAt: now
	};

	if (!db) {
		memoryStore.set(id, next);
		return true;
	}

	await db
		.prepare(`UPDATE preview_brands SET label = ?, data_json = ?, updated_at = ? WHERE id = ?`)
		.bind(next.label, next.dataJson, now, id)
		.run();

	return true;
}

export async function deleteBrandRow(db: DbLike | undefined, id: string): Promise<boolean> {
	const existing = await getBrandRow(db, id);
	if (!existing) return false;

	if (!db) {
		memoryStore.delete(id);
		return true;
	}

	await db.prepare(`DELETE FROM preview_brands WHERE id = ?`).bind(id).run();
	return true;
}

export function clearPreviewBrandsMemoryStore(): void {
	memoryStore.clear();
}

export type { DbLike as BrandDbLike };
