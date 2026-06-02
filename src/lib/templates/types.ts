export interface TemplateFieldDefinition {
	type: 'text' | 'richtext' | 'url' | 'reference';
	required: boolean;
	/** MJML token override when different from `cf.${fieldId}`. */
	binding?: string;
	/** @deprecated Legacy render token override (e.g. cf.emailCopyHtml). */
	renderBinding?: string;
	/**
	 * Legacy UE property alias (mapping UI only). Preview `data-aue-prop` is derived from
	 * the render token path (`cf.emailCopy` → `emailCopy`), not this field.
	 */
	aueProp?: string;
	model?: string;
	modelId?: string;
}

/** Row in the template picker (one per stored version). */
export interface TemplatePickerItem {
	id: string;
	familyId: string;
	name: string;
	version: string;
	isBuiltin: boolean;
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

export interface ComponentDefinitionDoc {
	groups: Array<{
		title: string;
		id: string;
		components: Array<{
			title: string;
			id: string;
			plugins: {
				aem: {
					cf: {
						name: string;
						cfModel: string;
					};
				};
			};
		}>;
	}>;
}

export interface ComponentModelField {
	component: string;
	name: string;
	label: string;
	valueType: string;
	required?: boolean;
}

export interface ComponentModelDoc extends Array<{
	id: string;
	fields: ComponentModelField[];
}> {}

export interface StoredTemplateEntry extends TemplateEntry {
	componentDefinition: ComponentDefinitionDoc | null;
	componentModels: ComponentModelDoc | null;
	isBuiltin: boolean;
}

export type TemplateResult<T> = { data: T; error?: never } | { error: string; data?: never };
