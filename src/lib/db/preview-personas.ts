import type { D1Database } from '@cloudflare/workers-types';
import type { Persona, PersonaData } from '$lib/personas/types.js';

type DbLike = Pick<D1Database, 'prepare' | 'batch'>;

export interface PersonaRow {
	id: string;
	label: string;
	dataJson: string;
	isBuiltin: boolean;
	createdAt: string;
	updatedAt: string;
}

const memoryStore = new Map<string, PersonaRow>();

function rowFromDb(record: Record<string, unknown>): PersonaRow {
	return {
		id: String(record.id),
		label: String(record.label),
		dataJson: String(record.data_json),
		isBuiltin: Number(record.is_builtin) === 1,
		createdAt: String(record.created_at),
		updatedAt: String(record.updated_at)
	};
}

export function rowToPersona(row: PersonaRow): Persona {
	const data = JSON.parse(row.dataJson) as PersonaData;
	return { id: row.id, ...data };
}

export async function countPreviewPersonas(db: DbLike | undefined): Promise<number> {
	if (!db) return memoryStore.size;
	const row = await db.prepare('SELECT COUNT(*) AS count FROM preview_personas').first<{ count: number }>();
	return row?.count ?? 0;
}

export async function listPersonaRows(db: DbLike | undefined): Promise<PersonaRow[]> {
	if (!db) return [...memoryStore.values()].sort((a, b) => a.label.localeCompare(b.label));

	const result = await db
		.prepare(
			`SELECT id, label, data_json, is_builtin, created_at, updated_at
			FROM preview_personas ORDER BY label ASC`
		)
		.all<Record<string, unknown>>();

	return (result.results ?? []).map(rowFromDb);
}

export async function getPersonaRow(db: DbLike | undefined, id: string): Promise<PersonaRow | null> {
	if (!db) return memoryStore.get(id) ?? null;

	const row = await db
		.prepare(
			`SELECT id, label, data_json, is_builtin, created_at, updated_at
			FROM preview_personas WHERE id = ?`
		)
		.bind(id)
		.first<Record<string, unknown>>();

	return row ? rowFromDb(row) : null;
}

export async function insertPersonaRow(
	db: DbLike | undefined,
	persona: Persona,
	isBuiltin = false
): Promise<void> {
	const now = new Date().toISOString();
	const { id, ...data } = persona;
	const row: PersonaRow = {
		id,
		label: persona.label,
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
			`INSERT INTO preview_personas (id, label, data_json, is_builtin, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?)`
		)
		.bind(id, row.label, row.dataJson, isBuiltin ? 1 : 0, now, now)
		.run();
}

export async function updatePersonaRow(
	db: DbLike | undefined,
	persona: Persona
): Promise<boolean> {
	const existing = await getPersonaRow(db, persona.id);
	if (!existing) return false;

	const now = new Date().toISOString();
	const { id, ...data } = persona;
	const next: PersonaRow = {
		...existing,
		label: persona.label,
		dataJson: JSON.stringify(data),
		updatedAt: now
	};

	if (!db) {
		memoryStore.set(id, next);
		return true;
	}

	await db
		.prepare(
			`UPDATE preview_personas SET label = ?, data_json = ?, updated_at = ? WHERE id = ?`
		)
		.bind(next.label, next.dataJson, now, id)
		.run();

	return true;
}

export function clearPreviewPersonasMemoryStore(): void {
	memoryStore.clear();
}

export type { DbLike as PersonaDbLike };
