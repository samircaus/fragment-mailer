// Template registry — types and bundled fallback for tests/build-time imports.
// Runtime reads/writes go through $lib/templates/service.js (D1-backed).

export type {
	ComponentDefinitionDoc,
	ComponentModelDoc,
	StoredTemplateEntry,
	TemplateDefinition,
	TemplateEntry,
	TemplateFieldDefinition,
	TemplateResult
} from './types.js';

export {
	BUNDLED_TEMPLATES,
	listBundledTemplateDefinitions,
	loadBundledTemplate
} from './bundled.js';

import { loadBundledTemplate, listBundledTemplateDefinitions } from './bundled.js';
import type { TemplateDefinition, TemplateEntry, TemplateResult } from './types.js';

/** Sync access to bundled templates only (tests, seed source). */
export function loadTemplate(id: string): TemplateResult<TemplateEntry> {
	const entry = loadBundledTemplate(id);
	if (!entry) {
		const available = listBundledTemplateDefinitions()
			.map((t) => t.id)
			.join(', ');
		return { error: `Template "${id}" not found. Available: ${available}` };
	}
	return { data: { definition: entry.definition, mjml: entry.mjml } };
}

export function listTemplates(): TemplateDefinition[] {
	return listBundledTemplateDefinitions();
}
