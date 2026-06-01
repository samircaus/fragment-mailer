import type { AuthorModelField } from '$lib/types/aem.js';

export interface CfInsertField {
	name: string;
	label: string;
	type: string;
	token: string;
	snippet: string;
}

function fieldTypeKind(type: string, name: string): 'richtext' | 'image' | 'reference' | 'text' {
	const t = type.toLowerCase();
	const n = name.toLowerCase();
	if (t.includes('html') || t.includes('richtext') || t === 'multiline') return 'richtext';
	if (t.includes('fragment') || t.includes('reference')) return 'reference';
	if (t.includes('asset') || n.includes('image') || n.includes('banner')) return 'image';
	return 'text';
}

export function cfTokenForField(name: string, type: string): string {
	return `cf.${name}`;
}

function cfOutputDelimiters(kind: 'richtext' | 'image' | 'reference' | 'text'): { open: string; close: string } {
	// AJO uses triple-brace Handlebars for unescaped image URLs and rich text HTML.
	if (kind === 'richtext' || kind === 'image') return { open: '{{{', close: '}}}' };
	return { open: '{{', close: '}}' };
}

export function buildCfTokenSnippet(
	token: string,
	type: string,
	label?: string,
	fieldName?: string
): string {
	const name = fieldName ?? token.replace(/^cf\./, '').split('.').pop() ?? token;
	const kind = fieldTypeKind(type, name);
	const { open, close } = cfOutputDelimiters(kind);

	switch (kind) {
		case 'richtext':
			return `<mj-text padding="0">\n  ${open}${token}${close}\n</mj-text>`;
		case 'image':
			return `<mj-image src="${open}${token}${close}" alt="" />`;
		case 'reference':
			return `{# ${label || name} — fragment reference #}\n{% load ${name} as fragment ref='this.${name}' %}`;
		default:
			return `<mj-text>\n  {{${token}}}\n</mj-text>`;
	}
}

export function buildCfFieldMjmlSnippet(field: Pick<AuthorModelField, 'name' | 'type' | 'label'>): string {
	const token = cfTokenForField(field.name, field.type);
	return buildCfTokenSnippet(token, field.type, field.label, field.name);
}

export function authorFieldToInsert(field: AuthorModelField): CfInsertField {
	return {
		name: field.name,
		label: field.label || field.name,
		type: field.type,
		token: cfTokenForField(field.name, field.type),
		snippet: buildCfFieldMjmlSnippet(field)
	};
}

export function fallbackFieldToInsert(name: string, label?: string): CfInsertField {
	const type =
		/(?:copy|body|html)/i.test(name) ? 'richtext' : /image|banner/i.test(name) ? 'asset' : 'text';
	const field = { name, type, label: label ?? name };
	return {
		name,
		label: label ?? name,
		type,
		token: cfTokenForField(name, type),
		snippet: buildCfFieldMjmlSnippet(field)
	};
}
