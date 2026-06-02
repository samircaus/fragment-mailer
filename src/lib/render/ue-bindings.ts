import type { TemplateDefinition, TemplateFieldDefinition } from '$lib/templates/registry.js';
import { resolveCfBinding } from '$lib/templates/cf-fields.js';
import type { UEBinding } from '$lib/render/inject-ue.js';

export interface BuildUEBindingsInput {
	definition: TemplateDefinition;
	discoveredBindings: string[];
	defaultCfPath: string;
	cfFields: Record<string, unknown>;
}

/** Build UE bindings for all template fields plus discovered MJML cf tokens. */
export function buildUEBindings(input: BuildUEBindingsInput): UEBinding[] {
	const { definition, discoveredBindings, defaultCfPath, cfFields } = input;
	const bindings: UEBinding[] = [];
	const coveredPaths = new Set<string>();

	for (const [fieldId, fieldDef] of Object.entries(definition.fields)) {
		const paths = collectTemplateBindingPaths(fieldId, fieldDef);
		for (const fieldPath of paths) {
			if (coveredPaths.has(fieldPath)) continue;
			coveredPaths.add(fieldPath);
			bindings.push(
				toUEBinding(fieldPath, fieldId, fieldDef, defaultCfPath, cfFields)
			);
		}
	}

	for (const fieldPath of discoveredBindings) {
		if (coveredPaths.has(fieldPath)) continue;
		coveredPaths.add(fieldPath);
		const resolved = resolveDiscoveredBinding(fieldPath, definition);
		bindings.push({
			fieldPath,
			cfPath: resolveBindingCFPath(fieldPath, defaultCfPath, cfFields),
			fieldName: resolved.fieldName,
			fieldType: resolved.fieldType,
			modelId: resolved.modelId
		});
	}

	return bindings;
}

function collectTemplateBindingPaths(
	fieldId: string,
	fieldDef: TemplateFieldDefinition
): string[] {
	const paths = [resolveCfBinding(fieldId, fieldDef)];
	if (fieldDef.renderBinding && !paths.includes(fieldDef.renderBinding)) {
		paths.push(fieldDef.renderBinding);
	}
	return paths;
}

function toUEBinding(
	fieldPath: string,
	fieldId: string,
	fieldDef: TemplateFieldDefinition,
	defaultCfPath: string,
	cfFields: Record<string, unknown>
): UEBinding {
	return {
		fieldPath,
		cfPath: resolveBindingCFPath(fieldPath, defaultCfPath, cfFields),
		fieldName: fieldDef.aueProp ?? fieldId,
		fieldType: fieldDef.type,
		modelId: fieldDef.modelId
	};
}

function resolveDiscoveredBinding(
	fieldPath: string,
	definition: TemplateDefinition
): Pick<UEBinding, 'fieldName' | 'fieldType' | 'modelId'> {
	const tokenName = bindingTokenName(fieldPath);

	if (tokenName.endsWith('Html')) {
		const baseName = tokenName.slice(0, -4);
		const baseField = definition.fields[baseName];
		if (baseField) {
			return {
				fieldName: baseField.aueProp ?? baseName,
				fieldType: baseField.type,
				modelId: baseField.modelId
			};
		}
	}

	const directField = definition.fields[tokenName];
	if (directField) {
		return {
			fieldName: directField.aueProp ?? tokenName,
			fieldType: directField.type,
			modelId: directField.modelId
		};
	}

	return {
		fieldName: tokenName,
		fieldType: inferFieldTypeFromTokenName(tokenName),
		modelId: undefined
	};
}

function inferFieldTypeFromTokenName(
	tokenName: string
): UEBinding['fieldType'] {
	if (/(?:body|copy|html)$/i.test(tokenName)) return 'richtext';
	if (/(?:image|banner|photo|thumbnail)/i.test(tokenName)) return 'reference';
	return 'text';
}

function bindingTokenName(fieldPath: string): string {
	const parts = fieldPath.split('.');
	return parts[parts.length - 1] ?? fieldPath;
}

export function resolveBindingCFPath(
	fieldPath: string,
	defaultPath: string,
	fields: Record<string, unknown>
): string {
	const parts = fieldPath.split('.');
	const rootField = parts[1];
	if (!rootField || parts.length < 3) return defaultPath;
	const rootValue = fields[rootField];
	if (rootValue && typeof rootValue === 'object') {
		const refPath = (rootValue as Record<string, unknown>)._path;
		if (typeof refPath === 'string' && refPath) return refPath;
	}
	// Derived render tokens (e.g. emailCopyHtml) map to the base CF field object.
	const baseField = rootField.endsWith('Html') ? rootField.slice(0, -4) : rootField;
	const baseValue = fields[baseField];
	if (baseValue && typeof baseValue === 'object') {
		const refPath = (baseValue as Record<string, unknown>)._path;
		if (typeof refPath === 'string' && refPath) return refPath;
	}
	return defaultPath;
}
