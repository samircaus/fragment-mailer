export interface TemplateFieldDefinition {
	type: 'text' | 'richtext' | 'url' | 'reference';
	required: boolean;
	binding: string;
	/** MJML/output token when different from `binding` (e.g. cf.emailCopyHtml). */
	renderBinding?: string;
	/** AEM CF property for data-aue-prop when different from the template field id. */
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
