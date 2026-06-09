import { getDb } from '$lib/db/email-status.js';
import { clearCampaignTemplatePrefsMemoryStore } from '$lib/db/campaign-template-prefs.js';
import { clearEmailTemplatesMemoryStore } from '$lib/db/email-templates.js';
import {
	countEmailTemplates,
	deleteEmailTemplate,
	deleteEmailTemplatesByFamily,
	getEmailTemplateRow,
	insertEmailTemplate,
	listEmailTemplateRows,
	listEmailTemplateRowsByFamily,
	renameEmailTemplateFamily,
	rowToStoredTemplateEntry,
	updateEmailTemplate,
	type TemplateDbLike
} from '$lib/db/email-templates.js';
import {
	defaultTemplateSource,
	getTemplateSourceFormat
} from '$lib/templates/source-format.js';
import { isStandaloneTemplateFamilyId } from '$lib/templates/template-scope.js';
import { bumpPatchVersion, versionIdForFamily } from '$lib/templates/version.js';
import { BUNDLED_TEMPLATES, loadBundledTemplate, listBundledTemplateDefinitions } from '$lib/templates/bundled.js';
import type {
	ComponentDefinitionDoc,
	ComponentModelDoc,
	StoredTemplateEntry,
	TemplateDefinition,
	TemplatePickerItem,
	TemplateResult,
	TemplateSourceFormat
} from '$lib/templates/types.js';

export type { StoredTemplateEntry, TemplateDefinition, TemplatePickerItem, TemplateResult };

let seeded = false;

async function ensureSeeded(db: TemplateDbLike | undefined): Promise<void> {
	if (seeded) return;

	const count = await countEmailTemplates(db);
	if (count === 0) {
		for (const entry of Object.values(BUNDLED_TEMPLATES)) {
			await insertEmailTemplate(db, {
				id: entry.definition.id,
				familyId: entry.definition.id,
				name: entry.definition.name,
				version: entry.definition.version,
				cfModel: entry.definition.cfModel,
				definition: entry.definition,
				mjml: entry.mjml,
				componentDefinition: entry.componentDefinition,
				componentModels: entry.componentModels,
				isBuiltin: false
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
		isBuiltin: false
	};
}

export async function listTemplates(
	platform?: App.Platform
): Promise<TemplateDefinition[]> {
	const db = getDb(platform);
	await ensureSeeded(db);
	const rows = await listEmailTemplateRows(db);
	return rows.map((row) => rowToStoredTemplateEntry(row).definition);
}

export async function listTemplatePickerItems(
	platform?: App.Platform
): Promise<TemplatePickerItem[]> {
	const db = getDb(platform);
	await ensureSeeded(db);
	const rows = await listEmailTemplateRows(db);
	return rows.map((row) => {
		const entry = rowToStoredTemplateEntry(row);
		return {
			id: row.id,
			familyId: row.familyId,
			name: row.name,
			version: row.version,
			sourceFormat: getTemplateSourceFormat(entry.definition),
			isBuiltin: row.isBuiltin
		};
	});
}

export async function listAemTemplatePickerItems(
	platform?: App.Platform
): Promise<TemplatePickerItem[]> {
	const items = await listTemplatePickerItems(platform);
	return items.filter((item) => !isStandaloneTemplateFamilyId(item.familyId));
}

export async function listStandaloneTemplatePickerItems(
	platform?: App.Platform
): Promise<TemplatePickerItem[]> {
	const items = await listTemplatePickerItems(platform);
	return items.filter(
		(item) => !item.isBuiltin && isStandaloneTemplateFamilyId(item.familyId)
	);
}

export async function renameTemplateFamily(
	platform: App.Platform | undefined,
	familyId: string,
	name: string
): Promise<TemplateResult<void>> {
	const trimmed = name.trim();
	if (!trimmed) return { error: 'Template name is required' };

	const db = getDb(platform);
	await ensureSeeded(db);

	const siblings = await listEmailTemplateRowsByFamily(db, familyId);
	if (siblings.length === 0) return { error: `Template family "${familyId}" not found` };

	const updated = await renameEmailTemplateFamily(db, familyId, trimmed);
	if (updated === 0) return { error: `Template family "${familyId}" not found` };
	return { data: undefined };
}

export async function deleteTemplateFamily(
	platform: App.Platform | undefined,
	familyId: string
): Promise<TemplateResult<void>> {
	const db = getDb(platform);
	await ensureSeeded(db);

	const siblings = await listEmailTemplateRowsByFamily(db, familyId);
	if (siblings.length === 0) return { error: `Template family "${familyId}" not found` };

	const removed = await deleteEmailTemplatesByFamily(db, familyId);
	if (removed === 0) return { error: `Template family "${familyId}" not found` };
	return { data: undefined };
}

export async function deleteTemplateVersion(
	platform: App.Platform | undefined,
	id: string
): Promise<TemplateResult<void>> {
	const db = getDb(platform);
	await ensureSeeded(db);

	const row = await getEmailTemplateRow(db, id);
	if (!row) return { error: `Template "${id}" not found` };

	const siblings = await listEmailTemplateRowsByFamily(db, row.familyId);
	if (siblings.length <= 1) {
		return { error: 'Cannot delete the only version of this template' };
	}

	const ok = await deleteEmailTemplate(db, id);
	if (!ok) return { error: `Template "${id}" not found` };
	return { data: undefined };
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

export interface SaveTemplateVersionResult {
	id: string;
	version: string;
}

export async function saveTemplateAsNewVersion(
	platform: App.Platform | undefined,
	id: string,
	mjml: string
): Promise<TemplateResult<SaveTemplateVersionResult>> {
	const db = getDb(platform);
	await ensureSeeded(db);

	const existing = await loadTemplate(platform, id);
	if (existing.error || !existing.data) {
		return { error: existing.error ?? `Template "${id}" not found` };
	}

	const sourceRow = await getEmailTemplateRow(db, id);
	if (!sourceRow) return { error: `Template "${id}" not found` };

	const familyId = sourceRow.familyId;
	const siblings = await listEmailTemplateRowsByFamily(db, familyId);
	const latestVersion = siblings[0]?.version ?? sourceRow.version;
	const newVersion = bumpPatchVersion(latestVersion);
	const newId = versionIdForFamily(familyId, newVersion);

	if (siblings.some((row) => row.id === newId)) {
		return { error: `Version ${newVersion} already exists for "${familyId}"` };
	}

	const definition: TemplateDefinition = {
		...existing.data.definition,
		id: newId,
		version: newVersion
	};

	await insertEmailTemplate(db, {
		id: newId,
		familyId,
		name: sourceRow.name,
		version: newVersion,
		cfModel: sourceRow.cfModel,
		definition,
		mjml,
		componentDefinition: existing.data.componentDefinition,
		componentModels: existing.data.componentModels,
		isBuiltin: false
	});

	return { data: { id: newId, version: newVersion } };
}

export interface CreateTemplateInput {
	id: string;
	name: string;
	mjml?: string;
	sourceFormat?: TemplateSourceFormat;
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

	const sourceFormat = input.sourceFormat ?? 'mjml';
	const definition: TemplateDefinition = {
		id: input.id,
		name: input.name,
		version: '1.0.0',
		cfModel: input.cfModel ?? '',
		sourceFormat,
		fields: {},
		profileTokens: [],
		previewSize: { width: 600, height: 800 }
	};

	const mjml =
		input.mjml?.trim() ||
		(sourceFormat === 'html' ? defaultTemplateSource('html') : defaultTemplateSource('mjml'));

	await insertEmailTemplate(db, {
		id: input.id,
		familyId: input.id,
		name: input.name,
		version: definition.version,
		cfModel: definition.cfModel,
		definition,
		mjml,
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
	clearCampaignTemplatePrefsMemoryStore();
}

export { getDb };
