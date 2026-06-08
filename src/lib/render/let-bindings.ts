// {% let offer0 = cf.offers.0 %} aliases for preview UE + AJO fragment loads.

import type { TemplateDefinition } from '$lib/templates/registry.js';
import { isRichTextCfFieldName } from '$lib/templates/cf-fields.js';
import type { UEBinding } from '$lib/render/inject-ue.js';

const LET_RE = /\{%\s*let\s+([A-Za-z_]\w*)\s*=\s*([\s\S]*?)\s*%\}/g;

/** Remove preview-only `{% let var = cf.path %}` aliases after load tags are inferred. */
export function stripLetStatements(template: string): string {
	return template.replace(new RegExp(LET_RE.source, 'g'), '');
}

/** Map let var → AEM ref expression (e.g. offer0 → this.offers[0]). */
export function parseLetFragmentAliases(mjml: string): Map<string, string> {
	const aliases = new Map<string, string>();
	let match: RegExpExecArray | null;
	const re = new RegExp(LET_RE.source, 'g');
	while ((match = re.exec(mjml)) !== null) {
		const varName = match[1];
		const rawExpr = match[2]?.trim() ?? '';
		const ref = cfExpressionToFragmentRef(rawExpr);
		if (ref) aliases.set(varName, ref);
	}
	return aliases;
}

/** cf.offers.0 / cf.offers[0] / cf.heroOffer → this.offers[0] / this.heroOffer */
export function cfExpressionToFragmentRef(expr: string): string | null {
	const trimmed = expr.trim();
	const indexed = trimmed.match(/^cf\.([A-Za-z_]\w*)(?:\.(\d+)|\[(\d+)\])$/);
	if (indexed) {
		const field = indexed[1];
		const index = indexed[2] ?? indexed[3];
		return `this.${field}[${index}]`;
	}
	const single = trimmed.match(/^cf\.([A-Za-z_]\w*)$/);
	if (single) return `this.${single[1]}`;
	return null;
}

/** Source CF path for a let alias (cf.offers.0 → referenced fragment _path). */
export function resolveLetSourceCfPath(
	cfFields: Record<string, unknown>,
	sourceExpr: string,
	defaultPath: string
): string {
	if (!sourceExpr.startsWith('cf.')) return defaultPath;
	const relPath = sourceExpr.slice(3);
	const value = getValueAtPath(cfFields, relPath);
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const refPath = (value as Record<string, unknown>)._path;
		if (typeof refPath === 'string' && refPath) return refPath;
	}
	return defaultPath;
}

function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
	if (!path) return undefined;
	return path.split('.').reduce<unknown>((current, key) => {
		if (current !== null && typeof current === 'object') {
			return (current as Record<string, unknown>)[key];
		}
		return undefined;
	}, obj);
}

/** Collect output bindings like offer0.title from template text. */
export function collectLetVariableBindings(
	template: string,
	letAliases: Map<string, string>
): string[] {
	if (letAliases.size === 0) return [];
	const varRoots = new Set(letAliases.keys());
	const found = new Set<string>();

	const collect = (_full: string, expr: string) => {
		const fieldPath = extractLetVarPath(expr, varRoots);
		if (fieldPath) found.add(fieldPath);
		return _full;
	};

	const tripleRe = /\{\{\{\s*([\s\S]*?)\s*\}\}\}/g;
	const doubleRe = /\{\{\s*([\s\S]*?)\s*\}\}/g;
	template.replace(tripleRe, collect);
	template.replace(doubleRe, collect);

	return [...found];
}

export function extractLetVarPath(expr: string, varRoots: Set<string>): string | null {
	const baseExpr = expr.split('|')[0]?.trim();
	if (!baseExpr) return null;
	const match = baseExpr.match(/^([A-Za-z_]\w*)\.([A-Za-z_]\w*)$/);
	if (!match) return null;
	const [, varName, fieldName] = match;
	if (!varName || !fieldName || !varRoots.has(varName)) return null;
	return `${varName}.${fieldName}`;
}

/** Build UE bindings for {% let %} card variables (each points at the referenced CF). */
export function buildLetUEBindings(input: {
	letAliases: Map<string, string>;
	discoveredPaths: string[];
	cfFields: Record<string, unknown>;
	defaultCfPath: string;
	templateId?: string;
	definition?: TemplateDefinition;
}): UEBinding[] {
	const bindings: UEBinding[] = [];
	const covered = new Set<string>();

	for (const fieldPath of input.discoveredPaths) {
		if (covered.has(fieldPath)) continue;
		covered.add(fieldPath);

		const dot = fieldPath.indexOf('.');
		if (dot === -1) continue;
		const varName = fieldPath.slice(0, dot);
		const fieldName = fieldPath.slice(dot + 1);
		const cfSource = findCfSourceForVar(varName, input.letAliases);
		const cfPath = cfSource
			? resolveLetSourceCfPath(input.cfFields, cfSource, input.defaultCfPath)
			: input.defaultCfPath;

		bindings.push({
			fieldPath,
			cfPath,
			fieldName,
			fieldType: inferLetFieldType(fieldName),
			modelId: inferLetModelId(fieldName, input.templateId, input.definition)
		});
	}

	return bindings;
}

function findCfSourceForVar(varName: string, letAliases: Map<string, string>): string | null {
	for (const [name, ref] of letAliases) {
		if (name === varName) {
			return fragmentRefToCfExpression(ref);
		}
	}
	return null;
}

/** this.offers[0] → cf.offers.0 */
function fragmentRefToCfExpression(ref: string): string | null {
	const indexed = ref.match(/^this\.([A-Za-z_]\w*)\[(\d+)\]$/);
	if (indexed) return `cf.${indexed[1]}.${indexed[2]}`;
	const single = ref.match(/^this\.([A-Za-z_]\w*)$/);
	if (single) return `cf.${single[1]}`;
	return null;
}

function inferLetFieldType(fieldName: string): UEBinding['fieldType'] {
	if (isRichTextCfFieldName(fieldName)) return 'richtext';
	if (/(?:image|banner|photo|thumbnail|link|url)/i.test(fieldName)) return 'url';
	return 'text';
}

function inferLetModelId(
	fieldName: string,
	templateId?: string,
	definition?: TemplateDefinition
): string | undefined {
	if (definition?.fields[fieldName]?.modelId) return definition.fields[fieldName].modelId;
	const tpl = templateId ?? definition?.id ?? 'default';
	const slug = (value: string) =>
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	return `${slug(tpl)}-${slug(fieldName)}`;
}
