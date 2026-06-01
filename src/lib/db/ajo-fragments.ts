import type { D1Database } from '@cloudflare/workers-types';

type DbLike = Pick<D1Database, 'prepare' | 'batch'>;

export interface AjoFragmentRow {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
}

const memoryStore = new Map<string, AjoFragmentRow>();

function rowFromDb(record: Record<string, unknown>): AjoFragmentRow {
	return {
		id: String(record.id),
		name: String(record.name),
		createdAt: String(record.created_at),
		updatedAt: String(record.updated_at)
	};
}

export async function listAjoFragments(db: DbLike | undefined): Promise<AjoFragmentRow[]> {
	if (!db) {
		return [...memoryStore.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	const result = await db
		.prepare('SELECT id, name, created_at, updated_at FROM ajo_fragments ORDER BY updated_at DESC')
		.all<Record<string, unknown>>();

	return (result.results ?? []).map(rowFromDb);
}

export async function upsertAjoFragment(
	db: DbLike | undefined,
	input: { id: string; name: string }
): Promise<void> {
	const now = new Date().toISOString();

	if (!db) {
		const existing = memoryStore.get(input.id);
		memoryStore.set(input.id, {
			id: input.id,
			name: input.name,
			createdAt: existing?.createdAt ?? now,
			updatedAt: now
		});
		return;
	}

	await db
		.prepare(
			`INSERT INTO ajo_fragments (id, name, created_at, updated_at)
			VALUES (?, ?, ?, ?)
			ON CONFLICT (id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`
		)
		.bind(input.id, input.name, now, now)
		.run();
}

export function clearAjoFragmentsMemoryStore(): void {
	memoryStore.clear();
}
