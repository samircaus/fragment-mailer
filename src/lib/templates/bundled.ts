import promoMJML from './files/promo.mjml?raw';
import promoDefinition from './files/promo.template.json';
import promoComponentDefinition from './files/promo.component-definition.json';
import promoComponentModels from './files/promo.component-models.json';
import offerMJML from './files/offer.mjml?raw';
import offerDefinition from './files/offer.template.json';
import type {
	ComponentDefinitionDoc,
	ComponentModelDoc,
	StoredTemplateEntry,
	TemplateDefinition
} from './types.js';

export interface BundledTemplateEntry extends StoredTemplateEntry {
	isBuiltin: true;
}

export const BUNDLED_TEMPLATES: Record<string, BundledTemplateEntry> = {
	promo: {
		definition: promoDefinition as TemplateDefinition,
		mjml: promoMJML,
		componentDefinition: promoComponentDefinition as ComponentDefinitionDoc,
		componentModels: promoComponentModels as ComponentModelDoc,
		isBuiltin: true
	},
	offer: {
		definition: offerDefinition as TemplateDefinition,
		mjml: offerMJML,
		componentDefinition: null,
		componentModels: null,
		isBuiltin: true
	}
};

export function listBundledTemplateDefinitions(): TemplateDefinition[] {
	return Object.values(BUNDLED_TEMPLATES).map((entry) => entry.definition);
}

export function loadBundledTemplate(id: string): BundledTemplateEntry | null {
	return BUNDLED_TEMPLATES[id] ?? null;
}
