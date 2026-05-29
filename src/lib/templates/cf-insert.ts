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
	const kind = fieldTypeKind(type, name);
	if (kind === 'richtext') return `cf.${name}Html`;
	if (kind === 'image') return `cf.${name}Url`;
	return `cf.${name}`;
}

export function buildCfFieldMjmlSnippet(field: Pick<AuthorModelField, 'name' | 'type' | 'label'>): string {
	const token = cfTokenForField(field.name, field.type);
	const kind = fieldTypeKind(field.type, field.name);

	switch (kind) {
		case 'richtext':
			return `<mj-text padding="0">\n  {{${token}}}\n</mj-text>`;
		case 'image':
			return `<mj-image src="{{${token}}}" alt="" />`;
		case 'reference':
			return `{# ${field.label || field.name} — fragment reference #}\n{% load ${field.name} as fragment ref='this.${field.name}' %}`;
		default:
			return `<mj-text>\n  {{${token}}}\n</mj-text>`;
	}
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
