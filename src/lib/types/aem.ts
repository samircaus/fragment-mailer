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

export interface AuthorHydratedReference {
	fieldName: string;
	items: Array<{
		id: string;
		path: string;
		type: 'fragment' | 'asset';
		fragment?: AuthorFragment;
	}>;
}

export interface AuthorFragmentList {
	items: AuthorFragment[];
	cursor?: string;
	total: number;
}

export interface AuthorModel {
	id: string;
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
