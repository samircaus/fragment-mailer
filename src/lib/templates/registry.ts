// Template registry.
// Loads MJML templates and their sidecar JSON definitions from the templates/files/ directory.
// Templates are bundled with the Worker as static strings (no fs access at runtime).
//
// To add a template: drop a .mjml file and matching .template.json into templates/files/,
// then add an import entry below. Vite/Rollup will bundle them at build time.

// Static imports — bundled at build time, no fs needed at runtime
import promoMJML from './files/promo.mjml?raw';
import promoDefinition from './files/promo.template.json';

export interface TemplateFieldDefinition {
	type: 'text' | 'richtext' | 'url' | 'reference';
	required: boolean;
	binding: string; // e.g. "cf.heroHeadline" or "cf.featuredOffer"
	model?: string; // for reference fields
	modelId?: string; // UE component model id, e.g. "hero", "body-text", "cta"
}

export interface TemplateDefinition {
	id: string;
	name: string;
	version: string;
	cfModel: string;
	fields: Record<string, TemplateFieldDefinition>;
	profileTokens: string[];
	previewSize: { width: number; height: number };
}

export interface TemplateEntry {
	definition: TemplateDefinition;
	mjml: string;
}

// In-process registry — populated once at module load time
const REGISTRY = new Map<string, TemplateEntry>([
	[
		'promo',
		{
			definition: promoDefinition as TemplateDefinition,
			mjml: promoMJML
		}
	]
]);

type Result<T> = { data: T; error?: never } | { error: string; data?: never };

export function loadTemplate(id: string): Result<TemplateEntry> {
	const entry = REGISTRY.get(id);
	if (!entry) {
		return {
			error: `Template "${id}" not found. Available: ${[...REGISTRY.keys()].join(', ')}`
		};
	}
	return { data: entry };
}

export function listTemplates(): TemplateDefinition[] {
	return [...REGISTRY.values()].map((e) => e.definition);
}
