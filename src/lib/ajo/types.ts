// AJO Content Templates API types.
// TODO(decision): Verify exact API shape against AJO API docs once real credentials are available.
// Current structure is based on AJO Content Templates API public docs (v1).

export interface AJOContentTemplate {
	id: string;
	name: string;
	status: 'draft' | 'live' | 'archived';
	content: {
		subject: string;
		preheader: string;
		html: string;
	};
	metadata: Record<string, string>;
	createdAt: string;
	updatedAt: string;
}

export interface AJOImportPayload {
	name: string;
	subject: string;
	preheader: string;
	html: string;
	metadata: Record<string, string>;
}

export interface AJOImportResult {
	id: string;
	status: 'created' | 'updated';
	previewUrl?: string;
}
