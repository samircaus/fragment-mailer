// AEM Content Fragment Delivery OpenAPI response shapes.
// These mirror the real API — update field names here if the CF model diverges.

/** List response from GET /adobe/contentFragments?path=... */
export interface ContentFragmentListResponse {
	items?: ContentFragmentItem[];
	data?: ContentFragmentItem[];
	total?: number;
}

/** Single fragment from GET /adobe/contentFragments/{id} */
export type ContentFragmentItem = {
	id?: string;
	path?: string;
	title?: string;
	modified?: string;
	fields?: Record<string, unknown> | ContentFragmentField[];
	_path?: string;
	_model?: CFFragment['_model'];
	_variation?: string;
	_metadata?: CFFragment['_metadata'];
	[key: string]: unknown;
};

export interface ContentFragmentField {
	name: string;
	values?: unknown[];
	value?: unknown;
}

export interface CFDeliveryResponse {
	data: CFFragment[];
	total: number;
}

export interface CFFragment {
	_path: string;
	_model: {
		_path: string;
		title: string;
	};
	_variation: string;
	_metadata: {
		stringMetadata: Array<{ name: string; value: string }>;
	};
	// CF model fields are dynamic; callers cast to their expected shape
	[key: string]: unknown;
}

// A resolved reference field — one level deep
export interface CFReference {
	_path: string;
	_model: { _path: string; title: string };
	[key: string]: unknown;
}

// Normalized internal representation after fetching
export interface ResolvedCFData {
	path: string;
	modelPath: string;
	version: string;
	fields: Record<string, unknown>;
}
