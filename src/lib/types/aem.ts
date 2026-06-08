// CF Management OpenAPI (Author tier) response shapes.
// Base URL: <authorHost>/adobe/sites/cf
// Reference: https://developer.adobe.com/experience-cloud/experience-manager-apis/api/stable/sites/

export interface AuthorFragment {
	id: string;
	path: string;
	title: string;
	description?: string;
	etag: string;
	created: { at: string; by: string };
	modified: { at: string; by: string };
	published?: { at: string; by: string };
	model: { id: string; title: string };
	status: string;
	fields: AuthorField[];
	references?: AuthorHydratedReference[];
}

export interface AuthorField {
	name: string;
	// 'text' | 'text/html' | 'long' | 'double' | 'boolean' | 'fragment-reference' | 'asset-reference'
	type: string;
	multiple: boolean;
	required: boolean;
	values: unknown[];
	mimeType?: string;
}

export interface AuthorReferenceItem {
	id: string;
	path: string;
	type: 'fragment' | 'asset';
	fragment?: AuthorFragment;
	/** Dynamic Media / Assets OpenAPI opaque asset id (e.g. urn:aaid:aem:…). */
	assetId?: string;
	/** AEM workflow status from hydrated reference (e.g. DRAFT, APPROVED). */
	status?: string;
	/** Hydrated asset metadata (GraphQL / all-hydrated). */
	_publishUrl?: string;
	_dynamicUrl?: string;
	_authorUrl?: string;
	url?: string;
}

/**
 * Hydrated CF reference from Sites CF OpenAPI.
 * Supports legacy `{ fieldName, items: [...] }` and flat entries where the reference
 * object itself carries `type`, `path`, `assetId`, nested `fields`, etc.
 */
export interface AuthorHydratedReference {
	fieldName: string;
	items?: AuthorReferenceItem[];
	type?: string;
	path?: string;
	id?: string;
	assetId?: string;
	status?: string;
	title?: string;
	name?: string;
	fields?: AuthorField[];
	references?: AuthorHydratedReference[];
	model?: { id: string; title?: string; name?: string; path?: string };
	fragment?: AuthorFragment;
	_publishUrl?: string;
	_dynamicUrl?: string;
	_authorUrl?: string;
	url?: string;
}

export interface AuthorFragmentList {
	items: AuthorFragment[];
	cursor?: string;
	total: number;
}

export interface AuthorModel {
	id: string;
	path?: string;
	name?: string;
	title: string;
	description?: string;
	fields: AuthorModelField[];
}

export interface AuthorModelField {
	name: string;
	label: string;
	type: string;
	required: boolean;
	multiple: boolean;
	defaultValue?: unknown;
}
