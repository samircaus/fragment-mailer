// Template registry.
// Loads MJML templates and their sidecar JSON definitions from the templates/files/ directory.
// Templates are bundled with the Worker as static strings (no fs access at runtime).
//
// Static templates live in REGISTRY (build-time bundle).
// Runtime edits/creates go into _overrides (in-memory, resets on cold start — fine for POC).

import promoMJML from './files/promo.mjml?raw';
import promoDefinition from './files/promo.template.json';
import offerMJML from './files/offer.mjml?raw';
import offerDefinition from './files/offer.template.json';

export interface TemplateFieldDefinition {
	type: 'text' | 'richtext' | 'url' | 'reference';
	required: boolean;
	binding: string;
	model?: string;
	modelId?: string;
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

const REGISTRY = new Map<string, TemplateEntry>([
	[
		'promo',
		{
			definition: promoDefinition as TemplateDefinition,
			mjml: promoMJML
		}
	],
	[
		'offer',
		{
			definition: offerDefinition as TemplateDefinition,
			mjml: offerMJML
		}
	]
]);

// User-created or user-edited templates (not persisted across cold starts).
const _overrides = new Map<string, TemplateEntry>();

type Result<T> = { data: T; error?: never } | { error: string; data?: never };

export function loadTemplate(id: string): Result<TemplateEntry> {
	const entry = _overrides.get(id) ?? REGISTRY.get(id);
	if (!entry) {
		const available = [...new Set([...REGISTRY.keys(), ..._overrides.keys()])].join(', ');
		return { error: `Template "${id}" not found. Available: ${available}` };
	}
	return { data: entry };
}

export function listTemplates(): TemplateDefinition[] {
	const all = new Map<string, TemplateDefinition>();
	for (const [id, entry] of REGISTRY) all.set(id, entry.definition);
	for (const [id, entry] of _overrides) all.set(id, entry.definition);
	return [...all.values()];
}

export function saveTemplateMJML(id: string, mjml: string): Result<void> {
	const existing = _overrides.get(id) ?? REGISTRY.get(id);
	if (!existing) return { error: `Template "${id}" not found` };
	_overrides.set(id, { ...existing, mjml });
	return { data: undefined };
}

export function createTemplate(id: string, name: string, mjml: string): Result<void> {
	if (REGISTRY.has(id) || _overrides.has(id)) {
		return { error: `Template "${id}" already exists` };
	}
	_overrides.set(id, {
		definition: {
			id,
			name,
			version: '1.0.0',
			cfModel: '',
			fields: {},
			profileTokens: [],
			previewSize: { width: 600, height: 800 }
		},
		mjml
	});
	return { data: undefined };
}
