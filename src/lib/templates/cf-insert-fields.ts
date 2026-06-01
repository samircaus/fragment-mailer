import type { AuthorModel, AuthorModelField } from '$lib/types/aem.js';
import type { TemplateDefinition } from './types.js';
import { authorFieldToInsert, buildCfTokenSnippet, type CfInsertField } from './cf-insert.js';

const SKIP_KEYS = new Set(['id', '_variations', '_tags', '_metadata', '_model']);

function fieldTypeFromValue(value: unknown, name: string): string {
	if (typeof value === 'string') {
		if (isRichTextFieldName(name) || value.includes('<')) return 'richtext';
		if (isImageFieldName(name)) return 'asset';
		return 'text';
	}
	if (typeof value === 'number' || typeof value === 'boolean') return 'text';
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		if (isImageFieldName(name)) return 'asset';
		if (isRichTextFieldName(name)) return 'richtext';
		return 'fragment-reference';
	}
	if (Array.isArray(value)) return 'fragment-reference-multiple';
	return 'text';
}

function isImageFieldName(name: string): boolean {
	return /(?:^|_)(?:image|banner|photo|thumbnail)(?:$|_)/i.test(name);
}

function isRichTextFieldName(name: string): boolean {
	return /(?:copy|body|html|richtext|description)/i.test(name);
}

function insertFieldForPath(path: string, type: string, label: string): CfInsertField {
	return {
		name: path,
		label,
		type,
		token: path,
		snippet: buildCfTokenSnippet(path, type, label)
	};
}

function walkFragmentData(
	value: unknown,
	pathPrefix: string,
	labelPrefix: string,
	out: CfInsertField[]
): void {
	if (value === null || value === undefined) return;

	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		const name = pathPrefix.split('.').pop() ?? pathPrefix;
		const type = fieldTypeFromValue(value, name);
		out.push(insertFieldForPath(pathPrefix, type, labelPrefix));
		return;
	}

	if (Array.isArray(value)) {
		value.forEach((item, index) => {
			walkFragmentData(item, `${pathPrefix}[${index}]`, `${labelPrefix} [${index + 1}]`, out);
		});
		return;
	}

	if (typeof value !== 'object') return;

	const obj = value as Record<string, unknown>;
	for (const [key, child] of Object.entries(obj)) {
		if (SKIP_KEYS.has(key) || key.startsWith('_') || key.endsWith('Html') || key.endsWith('Url')) {
			continue;
		}
		const childPath = `${pathPrefix}.${key}`;
		const childLabel = `${labelPrefix} › ${key}`;
		walkFragmentData(child, childPath, childLabel, out);
	}
}

/** Discover insertable tokens from hydrated campaign CF data (includes nested refs). */
export function expandInsertFieldsFromFragment(
	fields: Record<string, unknown>,
	rootPrefix = 'cf'
): CfInsertField[] {
	const out: CfInsertField[] = [];
	for (const [key, value] of Object.entries(fields)) {
		if (SKIP_KEYS.has(key) || key.startsWith('_') || key.endsWith('Html') || key.endsWith('Url')) {
			continue;
		}
		walkFragmentData(value, `${rootPrefix}.${key}`, key, out);
	}
	return out;
}

function mergeInsertFields(...groups: CfInsertField[][]): CfInsertField[] {
	const byToken = new Map<string, CfInsertField>();
	for (const group of groups) {
		for (const field of group) {
			if (!byToken.has(field.token)) {
				byToken.set(field.token, field);
			}
		}
	}
	return [...byToken.values()].sort((a, b) => a.token.localeCompare(b.token));
}

function nestedModelKeyForField(
	field: AuthorModelField,
	templateDefinition?: TemplateDefinition
): string | undefined {
	const templateField = templateDefinition?.fields[field.name];
	if (templateField?.model) return templateField.model;
	const type = field.type.toLowerCase();
	if (!type.includes('fragment') && !type.includes('reference')) return undefined;
	if (/offer/i.test(field.name)) return 'Offer';
	if (/hero/i.test(field.name)) return 'Offer';
	return undefined;
}

/** Top-level author model fields plus nested model fields for fragment references. */
export async function buildInsertFieldsForCampaign(
	opts: {
		authorModel?: AuthorModel;
		fragmentFields: Record<string, unknown>;
		templateDefinition?: TemplateDefinition;
		resolveModel: (modelKey: string) => Promise<AuthorModel | null>;
	}
): Promise<CfInsertField[]> {
	const groups: CfInsertField[][] = [];

	if (opts.authorModel) {
		const topLevel: CfInsertField[] = [];
		for (const field of opts.authorModel.fields) {
			topLevel.push(authorFieldToInsert(field));
			const nestedKey = nestedModelKeyForField(field, opts.templateDefinition);
			if (!nestedKey) continue;
			const nestedModel = await opts.resolveModel(nestedKey);
			if (!nestedModel) continue;
			for (const nested of nestedModel.fields) {
				const token = `cf.${field.name}.${nested.name}`;
				topLevel.push({
					name: token,
					label: `${field.label || field.name} › ${nested.label || nested.name}`,
					type: nested.type,
					token,
					snippet: buildCfTokenSnippet(token, nested.type, nested.label, nested.name)
				});
			}
		}
		groups.push(topLevel);
	}

	groups.push(expandInsertFieldsFromFragment(opts.fragmentFields));

	return mergeInsertFields(...groups);
}
