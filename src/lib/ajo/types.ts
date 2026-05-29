// AJO Journey Content Templates API types.
// Shape matches POST/PUT /ajo/content/templates (application/vnd.adobe.ajo.template.v1+json).

export const AJO_TEMPLATE_CONTENT_TYPE = 'application/vnd.adobe.ajo.template.v1+json';

export type AjoTemplateType = 'html' | 'html_primary_page' | 'html_sub_page' | 'content';
export type AjoTemplateChannel = 'email' | 'shared' | 'code';
export type AjoTemplateOrigin = 'ajo' | 'aem' | 'external';

export interface AjoEmailHtmlTemplateContent {
	html: string;
	editorContext?: Record<string, unknown>;
}

export interface AJOContentTemplatePayload {
	name: string;
	description?: string;
	templateType: 'html';
	channels: ['email'];
	source?: {
		origin: AjoTemplateOrigin;
		metadata?: Record<string, unknown>;
	};
	template: AjoEmailHtmlTemplateContent;
}

export interface AJOContentTemplateResult {
	id: string;
	status: 'created' | 'updated';
	previewUrl?: string;
}

export function buildAjoEmailHtmlTemplatePayload(opts: {
	name: string;
	html: string;
	description?: string;
	origin?: AjoTemplateOrigin;
}): AJOContentTemplatePayload {
	return {
		name: opts.name,
		...(opts.description ? { description: opts.description } : {}),
		templateType: 'html',
		channels: ['email'],
		source: {
			origin: opts.origin ?? 'ajo',
			metadata: {}
		},
		template: {
			html: opts.html,
			editorContext: {}
		}
	};
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
