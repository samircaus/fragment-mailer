import type { D1Database } from '@cloudflare/workers-types';
import type {
	ComponentDefinitionDoc,
	ComponentModelDoc,
	StoredTemplateEntry,
	TemplateDefinition
} from '$lib/templates/types.js';

type DbLike = Pick<D1Database, 'prepare' | 'batch'>;

export interface EmailTemplateRow {
	id: string;
	familyId: string;
	name: string;
	version: string;
	cfModel: string;
	definitionJson: string;
	mjml: string;
	componentDefinitionJson: string | null;
	componentModelsJson: string | null;
	isBuiltin: boolean;
	createdAt: string;
	updatedAt: string;
}

const memoryStore = new Map<string, EmailTemplateRow>();

function rowFromDb(record: Record<string, unknown>): EmailTemplateRow {
	return {
		id: String(record.id),
		familyId: String(record.family_id ?? record.id),
		name: String(record.name),
		version: String(record.version),
		cfModel: String(record.cf_model),
		definitionJson: String(record.definition_json),
		mjml: String(record.mjml),
		componentDefinitionJson: record.component_definition_json
			? String(record.component_definition_json)
			: null,
		componentModelsJson: record.component_models_json ? String(record.component_models_json) : null,
		isBuiltin: Number(record.is_builtin) === 1,
		createdAt: String(record.created_at),
		updatedAt: String(record.updated_at)
	};
}

function parseJson<T>(raw: string | null): T | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

export function rowToStoredTemplateEntry(row: EmailTemplateRow): StoredTemplateEntry {
	const definition = parseJson<TemplateDefinition>(row.definitionJson);
	if (!definition) {
		throw new Error(`Invalid definition_json for template "${row.id}"`);
	}

	return {
		definition,
		mjml: row.mjml,
		componentDefinition: parseJson<ComponentDefinitionDoc>(row.componentDefinitionJson),
		componentModels: parseJson<ComponentModelDoc>(row.componentModelsJson),
		isBuiltin: row.isBuiltin
	};
}

export async function countEmailTemplates(db: DbLike | undefined): Promise<number> {
	if (!db) return memoryStore.size;

	const row = await db.prepare('SELECT COUNT(*) AS count FROM email_templates').first<{ count: number }>();
	return row?.count ?? 0;
}

export async function listEmailTemplateRows(db: DbLike | undefined): Promise<EmailTemplateRow[]> {
	if (!db) return [...memoryStore.values()].sort((a, b) => a.name.localeCompare(b.name));

	const result = await db
		.prepare(
			`SELECT id, family_id, name, version, cf_model, definition_json, mjml,
				component_definition_json, component_models_json, is_builtin,
				created_at, updated_at
			FROM email_templates
			ORDER BY name ASC, version DESC`
		)
		.all<Record<string, unknown>>();

	return (result.results ?? []).map(rowFromDb);
}

export async function getEmailTemplateRow(
	db: DbLike | undefined,
	id: string
): Promise<EmailTemplateRow | null> {
	if (!db) return memoryStore.get(id) ?? null;

	const row = await db
		.prepare(
			`SELECT id, family_id, name, version, cf_model, definition_json, mjml,
				component_definition_json, component_models_json, is_builtin,
				created_at, updated_at
			FROM email_templates
			WHERE id = ?`
		)
		.bind(id)
		.first<Record<string, unknown>>();

	return row ? rowFromDb(row) : null;
}

export async function listEmailTemplateRowsByFamily(
	db: DbLike | undefined,
	familyId: string
): Promise<EmailTemplateRow[]> {
	if (!db) {
		return [...memoryStore.values()]
			.filter((row) => row.familyId === familyId)
			.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
	}

	const result = await db
		.prepare(
			`SELECT id, family_id, name, version, cf_model, definition_json, mjml,
				component_definition_json, component_models_json, is_builtin,
				created_at, updated_at
			FROM email_templates
			WHERE family_id = ?
			ORDER BY version DESC`
		)
		.bind(familyId)
		.all<Record<string, unknown>>();

	return (result.results ?? []).map(rowFromDb);
}

export interface InsertEmailTemplateInput {
	id: string;
	familyId?: string;
	name: string;
	version: string;
	cfModel: string;
	definition: TemplateDefinition;
	mjml: string;
	componentDefinition?: ComponentDefinitionDoc | null;
	componentModels?: ComponentModelDoc | null;
	isBuiltin?: boolean;
}

export async function insertEmailTemplate(
	db: DbLike | undefined,
	input: InsertEmailTemplateInput
): Promise<void> {
	const now = new Date().toISOString();
	const row: EmailTemplateRow = {
		id: input.id,
		familyId: input.familyId ?? input.id,
		name: input.name,
		version: input.version,
		cfModel: input.cfModel,
		definitionJson: JSON.stringify(input.definition),
		mjml: input.mjml,
		componentDefinitionJson: input.componentDefinition
			? JSON.stringify(input.componentDefinition)
			: null,
		componentModelsJson: input.componentModels ? JSON.stringify(input.componentModels) : null,
		isBuiltin: input.isBuiltin ?? false,
		createdAt: now,
		updatedAt: now
	};

	if (!db) {
		memoryStore.set(input.id, row);
		return;
	}

	await db
		.prepare(
			`INSERT INTO email_templates (
				id, family_id, name, version, cf_model, definition_json, mjml,
				component_definition_json, component_models_json, is_builtin,
				created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			row.id,
			row.familyId,
			row.name,
			row.version,
			row.cfModel,
			row.definitionJson,
			row.mjml,
			row.componentDefinitionJson,
			row.componentModelsJson,
			row.isBuiltin ? 1 : 0,
			now,
			now
		)
		.run();
}

export interface UpdateEmailTemplateInput {
	id: string;
	mjml?: string;
	definition?: TemplateDefinition;
	componentDefinition?: ComponentDefinitionDoc | null;
	componentModels?: ComponentModelDoc | null;
	name?: string;
	version?: string;
	cfModel?: string;
	familyId?: string;
}

export async function updateEmailTemplate(
	db: DbLike | undefined,
	input: UpdateEmailTemplateInput
): Promise<boolean> {
	const existing = await getEmailTemplateRow(db, input.id);
	if (!existing) return false;

	const now = new Date().toISOString();
	const next: EmailTemplateRow = {
		...existing,
		name: input.name ?? existing.name,
		version: input.version ?? existing.version,
		familyId: input.familyId ?? existing.familyId,
		cfModel: input.cfModel ?? existing.cfModel,
		definitionJson: input.definition ? JSON.stringify(input.definition) : existing.definitionJson,
		mjml: input.mjml ?? existing.mjml,
		componentDefinitionJson:
			input.componentDefinition !== undefined
				? input.componentDefinition
					? JSON.stringify(input.componentDefinition)
					: null
				: existing.componentDefinitionJson,
		componentModelsJson:
			input.componentModels !== undefined
				? input.componentModels
					? JSON.stringify(input.componentModels)
					: null
				: existing.componentModelsJson,
		updatedAt: now
	};

	if (!db) {
		memoryStore.set(input.id, next);
		return true;
	}

	await db
		.prepare(
			`UPDATE email_templates SET
				name = ?,
				family_id = ?,
				version = ?,
				cf_model = ?,
				definition_json = ?,
				mjml = ?,
				component_definition_json = ?,
				component_models_json = ?,
				updated_at = ?
			WHERE id = ?`
		)
		.bind(
			next.name,
			next.familyId,
			next.version,
			next.cfModel,
			next.definitionJson,
			next.mjml,
			next.componentDefinitionJson,
			next.componentModelsJson,
			now,
			input.id
		)
		.run();

	return true;
}

export async function deleteEmailTemplate(db: DbLike | undefined, id: string): Promise<boolean> {
	if (!db) {
		return memoryStore.delete(id);
	}

	const result = await db.prepare('DELETE FROM email_templates WHERE id = ?').bind(id).run();
	return (result.meta.changes ?? 0) > 0;
}

export async function deleteEmailTemplatesByFamily(
	db: DbLike | undefined,
	familyId: string
): Promise<number> {
	if (!db) {
		let removed = 0;
		for (const [id, row] of memoryStore) {
			if (row.familyId === familyId) {
				memoryStore.delete(id);
				removed += 1;
			}
		}
		return removed;
	}

	const result = await db
		.prepare('DELETE FROM email_templates WHERE family_id = ?')
		.bind(familyId)
		.run();
	return result.meta.changes ?? 0;
}

export async function renameEmailTemplateFamily(
	db: DbLike | undefined,
	familyId: string,
	name: string
): Promise<number> {
	const rows = await listEmailTemplateRowsByFamily(db, familyId);
	if (rows.length === 0) return 0;

	const now = new Date().toISOString();
	let updated = 0;

	for (const row of rows) {
		const definition = parseJson<TemplateDefinition>(row.definitionJson);
		if (!definition) continue;

		const nextDefinition: TemplateDefinition = { ...definition, name };
		const ok = await updateEmailTemplate(db, {
			id: row.id,
			name,
			definition: nextDefinition
		});
		if (ok) updated += 1;
	}

	if (!db && updated > 0) {
		for (const row of memoryStore.values()) {
			if (row.familyId === familyId) {
				row.updatedAt = now;
			}
		}
	}

	return updated;
}

export function clearEmailTemplatesMemoryStore(): void {
	memoryStore.clear();
}

export type { DbLike as TemplateDbLike };
