import defaultMJML from './files/default.mjml?raw';
import defaultDefinition from './files/default.template.json';
import type {
	ComponentDefinitionDoc,
	ComponentModelDoc,
	StoredTemplateEntry,
	TemplateDefinition
} from './types.js';

export interface BundledTemplateEntry extends StoredTemplateEntry {}

export const BUNDLED_TEMPLATES: Record<string, BundledTemplateEntry> = {
	default: {
		definition: defaultDefinition as TemplateDefinition,
		mjml: defaultMJML,
		componentDefinition: null,
		componentModels: null,
		isBuiltin: false
	}
};

export function listBundledTemplateDefinitions(): TemplateDefinition[] {
	return Object.values(BUNDLED_TEMPLATES).map((entry) => entry.definition);
}

export function loadBundledTemplate(id: string): BundledTemplateEntry | null {
	return BUNDLED_TEMPLATES[id] ?? null;
}
