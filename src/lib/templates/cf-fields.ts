import type { AuthorModel, AuthorModelField } from '$lib/types/aem.js';
import type {
	ComponentDefinitionDoc,
	ComponentModelDoc,
	ComponentModelField,
	TemplateDefinition,
	TemplateFieldDefinition
} from '$lib/templates/types.js';

/** Default MJML/AJO token for a template field (`cf.${fieldId}`). */
export function resolveCfBinding(
	fieldId: string,
	fieldDef?: Pick<TemplateFieldDefinition, 'binding'>
): string {
	return fieldDef?.binding ?? `cf.${fieldId}`;
}

export interface TemplateFieldMappingRow {
	fieldId: string;
	cfBinding: string;
	renderBinding?: string;
	ueProp: string;
	modelId?: string;
	cfElementName?: string;
	aemLabel?: string;
	mismatch?: string;
}

export function buildFieldMappings(
	definition: TemplateDefinition,
	componentDefinition: ComponentDefinitionDoc | null,
	componentModels: ComponentModelDoc | null
): TemplateFieldMappingRow[] {
	const modelFieldById = new Map<string, ComponentModelField>();
	for (const block of componentModels ?? []) {
		for (const field of block.fields) {
			modelFieldById.set(`${block.id}:${field.name}`, field);
		}
	}

	const cfElementByModelId = new Map<string, string>();
	for (const group of componentDefinition?.groups ?? []) {
		for (const component of group.components) {
			cfElementByModelId.set(component.id, component.plugins.aem.cf.name);
		}
	}

	return Object.entries(definition.fields).map(([fieldId, fieldDef]) => {
		const ueProp = fieldDef.aueProp ?? fieldId;
		const modelField =
			fieldDef.modelId != null ? modelFieldById.get(`${fieldDef.modelId}:${ueProp}`) : undefined;
		const cfElementName =
			fieldDef.modelId != null ? cfElementByModelId.get(fieldDef.modelId) : undefined;

		let mismatch: string | undefined;
		if (ueProp !== fieldId) {
			mismatch = `UE property "${ueProp}" differs from template field "${fieldId}" — AEM CF likely uses "${fieldId}"`;
		}

		return {
			fieldId,
			cfBinding: resolveCfBinding(fieldId, fieldDef),
			renderBinding: fieldDef.renderBinding,
			ueProp,
			modelId: fieldDef.modelId,
			cfElementName,
			aemLabel: modelField?.label,
			mismatch
		};
	});
}

function aemFieldToTemplateType(type: string): TemplateFieldDefinition['type'] {
	const t = type.toLowerCase();
	if (t.includes('html') || t.includes('richtext') || t === 'multiline') return 'richtext';
	if (t.includes('fragment') || t.includes('reference')) return 'reference';
	if (t.includes('url') || t.includes('link')) return 'url';
	return 'text';
}

function aemFieldToComponentType(type: string): ComponentModelField['component'] {
	const templateType = aemFieldToTemplateType(type);
	if (templateType === 'richtext') return 'richtext';
	return 'text';
}

/** AEM CF element name (PascalCase of API field name). */
export function toCfElementName(fieldName: string): string {
	if (!fieldName) return fieldName;
	return fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
}

function slugId(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

export interface SyncTemplateFromAemInput {
	aemModel: AuthorModel;
	templateId: string;
	existingDefinition?: TemplateDefinition;
}

export interface SyncTemplateFromAemResult {
	definition: TemplateDefinition;
	componentDefinition: ComponentDefinitionDoc;
	componentModels: ComponentModelDoc;
}

/**
 * Align template + UE assets to an AEM CF model (source of truth).
 * Rebuilds fields and UE component-definition / component-models from AEM.
 */
export function syncTemplateFromAemModel(input: SyncTemplateFromAemInput): SyncTemplateFromAemResult {
	const { aemModel, templateId, existingDefinition } = input;
	const cfModel = aemModel.title ?? existingDefinition?.cfModel ?? aemModel.id;
	const groupId = slugId(cfModel) || slugId(templateId) || 'cf';

	const fields: Record<string, TemplateFieldDefinition> = {};
	const componentModels: ComponentModelDoc = [];
	const components: ComponentDefinitionDoc['groups'][0]['components'] = [];

	for (const aemField of aemModel.fields) {
		const fieldId = aemField.name;
		const modelId = `${slugId(templateId)}-${slugId(fieldId)}`;
		const templateType = aemFieldToTemplateType(aemField.type);

		fields[fieldId] = {
			type: templateType,
			required: aemField.required,
			modelId
		};

		componentModels.push({
			id: modelId,
			fields: [
				{
					component: aemFieldToComponentType(aemField.type),
					name: fieldId,
					label: aemField.label || fieldId,
					valueType: 'string',
					required: aemField.required
				}
			]
		});

		components.push({
			title: aemField.label || fieldId,
			id: modelId,
			plugins: {
				aem: {
					cf: {
						name: toCfElementName(fieldId),
						cfModel
					}
				}
			}
		});
	}

	const definition: TemplateDefinition = {
		id: existingDefinition?.id ?? templateId,
		name: existingDefinition?.name ?? aemModel.title,
		version: existingDefinition?.version ?? '1.0.0',
		cfModel,
		fields,
		profileTokens: existingDefinition?.profileTokens ?? [],
		previewSize: existingDefinition?.previewSize ?? { width: 600, height: 900 }
	};

	return {
		definition,
		componentDefinition: {
			groups: [
				{
					title: aemModel.title || cfModel,
					id: groupId,
					components
				}
			]
		},
		componentModels
	};
}

/** @deprecated Use syncTemplateFromAemModel */
export const suggestUeAssetsFromAemModel = syncTemplateFromAemModel;
