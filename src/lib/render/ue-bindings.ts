import type { TemplateDefinition, TemplateFieldDefinition } from '$lib/templates/registry.js';
import { resolveCfBinding } from '$lib/templates/cf-fields.js';
import { buildLetUEBindings, parseLetFragmentAliases } from '$lib/render/let-bindings.js';
import type { UEBinding } from '$lib/render/inject-ue.js';

export interface BuildUEBindingsInput {
	definition: TemplateDefinition;
	discoveredBindings: string[];
	defaultCfPath: string;
	cfFields: Record<string, unknown>;
	/** Raw MJML — used to resolve {% let offer0 = cf.offers.0 %} UE targets. */
	mjml?: string;
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
		if (fieldPath.includes('.') && !fieldPath.startsWith('cf.')) {
			continue;
		}
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

	if (input.mjml) {
		const letAliases = parseLetFragmentAliases(input.mjml);
		const letPaths = discoveredBindings.filter(
			(p) => p.includes('.') && !p.startsWith('cf.') && !coveredPaths.has(p)
		);
		const letBindings = buildLetUEBindings({
			letAliases,
			discoveredPaths: letPaths,
			cfFields,
			defaultCfPath,
			templateId: definition.id,
			definition
		});
		for (const binding of letBindings) {
			if (coveredPaths.has(binding.fieldPath)) continue;
			coveredPaths.add(binding.fieldPath);
			bindings.push(binding);
		}
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
	_fieldId: string,
	fieldDef: TemplateFieldDefinition,
	defaultCfPath: string,
	cfFields: Record<string, unknown>
): UEBinding {
	return {
		fieldPath,
		cfPath: resolveBindingCFPath(fieldPath, defaultCfPath, cfFields),
		fieldName: resolveAemPropName(fieldPath),
		fieldType: fieldDef.type,
		modelId: fieldDef.modelId
	};
}

function resolveDiscoveredBinding(
	fieldPath: string,
	definition: TemplateDefinition
): Pick<UEBinding, 'fieldName' | 'fieldType' | 'modelId'> {
	const tokenName = bindingTokenName(fieldPath);

	const directField = definition.fields[tokenName];
	if (directField) {
		return {
			fieldName: resolveAemPropName(fieldPath),
			fieldType: directField.type,
			modelId: directField.modelId
		};
	}

	return {
		fieldName: resolveAemPropName(fieldPath),
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

/** AEM CF API property for data-aue-prop (derived from the render token, not template field id). */
export function resolveAemPropName(fieldPath: string): string {
	const token = bindingTokenName(fieldPath);
	if (token.endsWith('Html')) return token.slice(0, -4);
	return token;
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
