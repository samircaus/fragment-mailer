import { getDb } from '$lib/db/email-status.js';
import {
	clearPreviewPersonasMemoryStore,
	countPreviewPersonas,
	getPersonaRow,
	insertPersonaRow,
	listPersonaRows,
	rowToPersona,
	updatePersonaRow,
	type PersonaDbLike
} from '$lib/db/preview-personas.js';
import { getBundledPersona, SAMPLE_PERSONAS } from '$lib/personas/bundled.js';
import type { Persona } from '$lib/personas/types.js';
import { validatePersonaData } from '$lib/personas/validate.js';

export type { Persona };

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

export async function listPersonas(platform?: App.Platform): Promise<Persona[]> {
	const db = getDb(platform);
	await ensureSeeded(db);
	const rows = await listPersonaRows(db);
	if (rows.length === 0) return structuredClone(SAMPLE_PERSONAS);
	return rows.map(rowToPersona);
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

export function resetPersonaStoreForTests(): void {
	seeded = false;
	clearPreviewPersonasMemoryStore();
}
