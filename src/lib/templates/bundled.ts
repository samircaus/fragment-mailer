import promoMJML from './files/promo.mjml?raw';
import promoDefinition from './files/promo.template.json';
import promoComponentDefinition from './files/promo.component-definition.json';
import promoComponentModels from './files/promo.component-models.json';
import offerMJML from './files/offer.mjml?raw';
import offerDefinition from './files/offer.template.json';
import offerComponentDefinition from './files/offer.component-definition.json';
import offerComponentModels from './files/offer.component-models.json';
import type {
	ComponentDefinitionDoc,
	ComponentModelDoc,
	TemplateDefinition,
	TemplateEntry
} from './types.js';

export interface BundledTemplateEntry extends TemplateEntry {
	componentDefinition: ComponentDefinitionDoc;
	componentModels: ComponentModelDoc;
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
		componentDefinition: offerComponentDefinition as ComponentDefinitionDoc,
		componentModels: offerComponentModels as ComponentModelDoc,
		isBuiltin: true
	}
};

export function listBundledTemplateDefinitions(): TemplateDefinition[] {
	return Object.values(BUNDLED_TEMPLATES).map((entry) => entry.definition);
}

export function loadBundledTemplate(id: string): BundledTemplateEntry | null {
	return BUNDLED_TEMPLATES[id] ?? null;
}
