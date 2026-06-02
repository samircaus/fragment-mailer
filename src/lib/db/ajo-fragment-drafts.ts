import type { D1Database } from '@cloudflare/workers-types';

type DbLike = Pick<D1Database, 'prepare' | 'batch'>;

export interface AjoFragmentDraftRow {
	id: string;
	name: string;
	description: string;
	expression: string;
	subType: 'TEXT' | 'HTML' | 'JSON';
	createdAt: string;
	updatedAt: string;
}

const memoryStore = new Map<string, AjoFragmentDraftRow>();

function isMissingTableError(err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err);
	return (
		message.includes('no such table: ajo_fragment_drafts') ||
		(message.includes('D1_ERROR') && message.includes('SQLITE_ERROR'))
	);
}

function rowFromDb(record: Record<string, unknown>): AjoFragmentDraftRow {
	const subTypeRaw = String(record.sub_type ?? 'HTML');
	return {
		id: String(record.id),
		name: String(record.name),
		description: typeof record.description === 'string' ? record.description : '',
		expression: typeof record.expression === 'string' ? record.expression : '',
		subType: subTypeRaw === 'TEXT' || subTypeRaw === 'JSON' ? subTypeRaw : 'HTML',
		createdAt: String(record.created_at),
		updatedAt: String(record.updated_at)
	};
}

export async function listAjoFragmentDrafts(db: DbLike | undefined): Promise<AjoFragmentDraftRow[]> {
	if (!db) {
		return [...memoryStore.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	try {
		const result = await db
			.prepare(
				'SELECT id, name, description, expression, sub_type, created_at, updated_at FROM ajo_fragment_drafts ORDER BY updated_at DESC'
			)
			.all<Record<string, unknown>>();

		return (result.results ?? []).map(rowFromDb);
	} catch (err) {
		if (isMissingTableError(err)) {
			return [...memoryStore.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		}
		throw err;
	}
}

export async function getAjoFragmentDraft(
	db: DbLike | undefined,
	id: string
): Promise<AjoFragmentDraftRow | null> {
	if (!db) {
		return memoryStore.get(id) ?? null;
	}

	try {
		const row = await db
			.prepare(
				'SELECT id, name, description, expression, sub_type, created_at, updated_at FROM ajo_fragment_drafts WHERE id = ?'
			)
			.bind(id)
			.first<Record<string, unknown>>();
		return row ? rowFromDb(row) : null;
	} catch (err) {
		if (isMissingTableError(err)) {
			return memoryStore.get(id) ?? null;
		}
		throw err;
	}
}

export async function upsertAjoFragmentDraft(
	db: DbLike | undefined,
	input: {
		id: string;
		name: string;
		description?: string;
		expression?: string;
		subType?: 'TEXT' | 'HTML' | 'JSON';
	}
): Promise<void> {
	const now = new Date().toISOString();
	const existing = await getAjoFragmentDraft(db, input.id);
	const row: AjoFragmentDraftRow = {
		id: input.id,
		name: input.name,
		description: input.description ?? existing?.description ?? '',
		expression: input.expression ?? existing?.expression ?? '',
		subType: input.subType ?? existing?.subType ?? 'HTML',
		createdAt: existing?.createdAt ?? now,
		updatedAt: now
	};

	if (!db) {
		memoryStore.set(row.id, row);
		return;
	}

	try {
		await db
			.prepare(
				`INSERT INTO ajo_fragment_drafts (id, name, description, expression, sub_type, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (id) DO UPDATE SET
					name = excluded.name,
					description = excluded.description,
					expression = excluded.expression,
					sub_type = excluded.sub_type,
					updated_at = excluded.updated_at`
			)
			.bind(
				row.id,
				row.name,
				row.description,
				row.expression,
				row.subType,
				row.createdAt,
				row.updatedAt
			)
			.run();
	} catch (err) {
		if (!isMissingTableError(err)) throw err;
		memoryStore.set(row.id, row);
	}
}

export async function deleteAjoFragmentDraft(
	db: DbLike | undefined,
	id: string
): Promise<boolean> {
	if (!db) {
		return memoryStore.delete(id);
	}

	try {
		const result = await db.prepare('DELETE FROM ajo_fragment_drafts WHERE id = ?').bind(id).run();
		return (result.meta.changes ?? 0) > 0;
	} catch (err) {
		if (isMissingTableError(err)) {
			return memoryStore.delete(id);
		}
		throw err;
	}
}

export function clearAjoFragmentDraftsMemoryStore(): void {
	memoryStore.clear();
}

