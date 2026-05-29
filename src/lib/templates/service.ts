import { getDb } from '$lib/db/email-status.js';
import { clearEmailTemplatesMemoryStore } from '$lib/db/email-templates.js';
import {
	countEmailTemplates,
	getEmailTemplateRow,
	insertEmailTemplate,
	listEmailTemplateRows,
	rowToStoredTemplateEntry,
	updateEmailTemplate,
	type TemplateDbLike
} from '$lib/db/email-templates.js';
import { BUNDLED_TEMPLATES, loadBundledTemplate, listBundledTemplateDefinitions } from '$lib/templates/bundled.js';
import type {
	ComponentDefinitionDoc,
	ComponentModelDoc,
	StoredTemplateEntry,
	TemplateDefinition,
	TemplateResult
} from '$lib/templates/types.js';

export type { StoredTemplateEntry, TemplateDefinition, TemplateResult };

let seeded = false;

async function ensureSeeded(db: TemplateDbLike | undefined): Promise<void> {
	if (seeded) return;

	const count = await countEmailTemplates(db);
	if (count === 0) {
		for (const entry of Object.values(BUNDLED_TEMPLATES)) {
			await insertEmailTemplate(db, {
				id: entry.definition.id,
				name: entry.definition.name,
				version: entry.definition.version,
				cfModel: entry.definition.cfModel,
				definition: entry.definition,
				mjml: entry.mjml,
				componentDefinition: entry.componentDefinition,
				componentModels: entry.componentModels,
				isBuiltin: true
			});
		}
	}

	seeded = true;
}

function bundledEntry(id: string): StoredTemplateEntry | null {
	const entry = loadBundledTemplate(id);
	if (!entry) return null;
	return {
		definition: entry.definition,
		mjml: entry.mjml,
		componentDefinition: entry.componentDefinition,
		componentModels: entry.componentModels,
		isBuiltin: true
	};
}

export async function listTemplates(
	platform?: App.Platform
): Promise<TemplateDefinition[]> {
	const db = getDb(platform);
	await ensureSeeded(db);
	const rows = await listEmailTemplateRows(db);
	if (rows.length === 0) return listBundledTemplateDefinitions();
	return rows.map((row) => rowToStoredTemplateEntry(row).definition);
}

export async function loadTemplate(
	platform: App.Platform | undefined,
	id: string
): Promise<TemplateResult<StoredTemplateEntry>> {
	const db = getDb(platform);
	await ensureSeeded(db);

	const row = await getEmailTemplateRow(db, id);
	if (row) {
		return { data: rowToStoredTemplateEntry(row) };
	}

	const bundled = bundledEntry(id);
	if (bundled) return { data: bundled };

	const available = (await listTemplates(platform)).map((t) => t.id).join(', ');
	return { error: `Template "${id}" not found. Available: ${available}` };
}

export async function saveTemplateMJML(
	platform: App.Platform | undefined,
	id: string,
	mjml: string
): Promise<TemplateResult<void>> {
	const db = getDb(platform);
	await ensureSeeded(db);

	const existing = await loadTemplate(platform, id);
	if (existing.error || !existing.data) return { error: existing.error ?? `Template "${id}" not found` };

	const ok = await updateEmailTemplate(db, { id, mjml });
	if (!ok) return { error: `Template "${id}" not found` };
	return { data: undefined };
}

export interface CreateTemplateInput {
	id: string;
	name: string;
	mjml: string;
	cfModel?: string;
	componentDefinition?: ComponentDefinitionDoc | null;
	componentModels?: ComponentModelDoc | null;
}

export async function createTemplate(
	platform: App.Platform | undefined,
	input: CreateTemplateInput
): Promise<TemplateResult<void>> {
	const db = getDb(platform);
	await ensureSeeded(db);

	if (await getEmailTemplateRow(db, input.id)) {
		return { error: `Template "${input.id}" already exists` };
	}

	const definition: TemplateDefinition = {
		id: input.id,
		name: input.name,
		version: '1.0.0',
		cfModel: input.cfModel ?? '',
		fields: {},
		profileTokens: [],
		previewSize: { width: 600, height: 800 }
	};

	await insertEmailTemplate(db, {
		id: input.id,
		name: input.name,
		version: definition.version,
		cfModel: definition.cfModel,
		definition,
		mjml: input.mjml,
		componentDefinition: input.componentDefinition ?? null,
		componentModels: input.componentModels ?? null,
		isBuiltin: false
	});

	return { data: undefined };
}

export interface UpdateTemplateInput {
	mjml?: string;
	definition?: TemplateDefinition;
	componentDefinition?: ComponentDefinitionDoc | null;
	componentModels?: ComponentModelDoc | null;
}

export async function updateTemplate(
	platform: App.Platform | undefined,
	id: string,
	input: UpdateTemplateInput
): Promise<TemplateResult<void>> {
	const db = getDb(platform);
	await ensureSeeded(db);

	const ok = await updateEmailTemplate(db, { id, ...input });
	if (!ok) return { error: `Template "${id}" not found` };
	return { data: undefined };
}

export function resetTemplateStoreForTests(): void {
	seeded = false;
	clearEmailTemplatesMemoryStore();
}

export { getDb };
