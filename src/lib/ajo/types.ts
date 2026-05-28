// AJO Journey Content Templates API types.
// TODO(spike): Confirm exact API shape against DevTools capture from AJO UI.

export interface AJOContentTemplatePayload {
	name: string;
	channel: 'email';
	contentType: 'text/html';
	body: string;
}

export interface AJOContentTemplateResult {
	id: string;
	status: 'created' | 'updated';
	previewUrl?: string;
}

/** @deprecated Use AJOContentTemplatePayload */
export interface AJOImportPayload {
	name: string;
	subject: string;
	preheader: string;
	html: string;
	metadata: Record<string, string>;
}

/** @deprecated Use AJOContentTemplateResult */
export interface AJOImportResult {
	id: string;
	status: 'created' | 'updated';
	previewUrl?: string;
}

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
