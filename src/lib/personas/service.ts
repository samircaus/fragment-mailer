import { getDb } from '$lib/db/email-status.js';
import {
	clearPreviewPersonasMemoryStore,
	countPreviewPersonas,
	deletePersonaRow,
	getPersonaRow,
	insertPersonaRow,
	listPersonaRows,
	rowToPersona,
	updatePersonaRow,
	type PersonaDbLike
} from '$lib/db/preview-personas.js';
import { getBundledPersona, SAMPLE_PERSONAS } from '$lib/personas/bundled.js';
import type { Persona, PersonaListItem } from '$lib/personas/types.js';
import { validatePersonaData } from '$lib/personas/validate.js';

export type { Persona, PersonaListItem };

let seeded = false;

async function ensureSeeded(db: PersonaDbLike | undefined): Promise<void> {
	if (seeded) return;

	const count = await countPreviewPersonas(db);
	if (count === 0) {
		for (const persona of SAMPLE_PERSONAS) {
			await insertPersonaRow(db, persona, true);
		}
	}

	seeded = true;
}

function rowToPersonaListItem(row: Awaited<ReturnType<typeof listPersonaRows>>[number]): PersonaListItem {
	return { ...rowToPersona(row), isBuiltin: row.isBuiltin };
}

export async function listPersonas(platform?: App.Platform): Promise<PersonaListItem[]> {
	const db = getDb(platform);
	await ensureSeeded(db);
	const rows = await listPersonaRows(db);
	if (rows.length === 0) {
		return SAMPLE_PERSONAS.map((persona) => ({ ...structuredClone(persona), isBuiltin: true }));
	}
	return rows.map(rowToPersonaListItem);
}

export async function getPersonaById(
	platform: App.Platform | undefined,
	id: string
): Promise<Persona> {
	const db = getDb(platform);
	await ensureSeeded(db);

	const row = await getPersonaRow(db, id);
	if (row) return rowToPersona(row);

	const bundled = getBundledPersona(id);
	if (bundled) return structuredClone(bundled);

	const fallback = await listPersonas(platform);
	return fallback[0] ?? SAMPLE_PERSONAS[0];
}

export async function updatePersona(
	platform: App.Platform | undefined,
	id: string,
	data: unknown
): Promise<{ ok: true; persona: Persona } | { ok: false; error: string }> {
	const result = validatePersonaData(data, id);
	if (!result.ok) return result;

	const db = getDb(platform);
	await ensureSeeded(db);
	const saved = await updatePersonaRow(db, result.persona);
	if (!saved) return { ok: false, error: `Persona "${id}" not found` };
	return { ok: true, persona: result.persona };
}

export async function createPersona(
	platform: App.Platform | undefined,
	id: string,
	data: unknown
): Promise<{ ok: true; persona: PersonaListItem } | { ok: false; error: string }> {
	const trimmedId = id.trim();
	if (!trimmedId) return { ok: false, error: 'Persona id is required' };
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedId)) {
		return { ok: false, error: 'Persona id must be lowercase letters, numbers, and hyphens' };
	}

	const result = validatePersonaData(data, trimmedId);
	if (!result.ok) return result;

	const db = getDb(platform);
	await ensureSeeded(db);

	const existing = await getPersonaRow(db, trimmedId);
	if (existing) return { ok: false, error: `Persona "${trimmedId}" already exists` };

	await insertPersonaRow(db, result.persona, false);
	return { ok: true, persona: { ...result.persona, isBuiltin: false } };
}

export async function deletePersona(
	platform: App.Platform | undefined,
	id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
	const db = getDb(platform);
	await ensureSeeded(db);

	const row = await getPersonaRow(db, id);
	if (!row) return { ok: false, error: `Persona "${id}" not found` };
	if (row.isBuiltin) return { ok: false, error: 'Built-in personas cannot be deleted' };

	const count = await countPreviewPersonas(db);
	if (count <= 1) return { ok: false, error: 'Cannot delete the only persona' };

	const deleted = await deletePersonaRow(db, id);
	if (!deleted) return { ok: false, error: `Persona "${id}" not found` };
	return { ok: true };
}

export function resetPersonaStoreForTests(): void {
	seeded = false;
	clearPreviewPersonasMemoryStore();
}
