// AEM Content Fragment Delivery OpenAPI response shapes.
// These mirror the real API — update field names here if the CF model diverges.

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
