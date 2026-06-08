// AJO Content Fragments API types (GET/PUT /ajo/content/fragments).

export const AJO_FRAGMENT_CONTENT_TYPE = 'application/vnd.adobe.ajo.fragment.v1.0+json';
export const AJO_FRAGMENT_LIST_CONTENT_TYPE = 'application/vnd.adobe.ajo.fragment-list.v1.0+json';
export const AJO_FRAGMENT_PUBLICATION_CONTENT_TYPE =
	'application/vnd.adobe.ajo.fragment.publication.request.v1.0+json';

export type AjoFragmentType = 'html' | 'expression';
export type AjoFragmentStatus = 'DRAFT' | 'PUBLISHING' | 'PUBLISHED';
export type AjoExpressionSubType = 'TEXT' | 'HTML' | 'JSON';

export interface AjoExpressionFragmentContent {
	expression: string;
}

export interface AjoExpressionFragmentPayload {
	name: string;
	description?: string;
	type: 'expression';
	subType: AjoExpressionSubType;
	channels: ['shared'];
	fragment: AjoExpressionFragmentContent;
	source?: {
		origin: 'ajo' | 'external';
		metadata?: Record<string, unknown>;
	};
}

export interface AjoFragmentListItem {
	id: string;
	name: string;
	description?: string;
	type: AjoFragmentType;
	status: AjoFragmentStatus;
	channels: string[];
	modifiedAt?: string;
	createdAt?: string;
	self?: { href: string };
}

export interface AjoFragmentPage {
	items: AjoFragmentListItem[];
	next?: string;
}

export interface AjoExpressionFragmentDetail extends AjoFragmentListItem {
	subType?: AjoExpressionSubType;
	fragment: AjoExpressionFragmentContent;
	etag?: string;
}

export interface AjoFragmentReference {
	id: string;
	name: string;
	type?: string;
	channel?: string;
}

export interface AjoFragmentReferences {
	count: number;
	items: AjoFragmentReference[];
}

export interface AjoFragmentPublishResult {
	accepted: boolean;
	publicationId?: string;
}

export function buildAjoExpressionFragmentPayload(opts: {
	name: string;
	expression: string;
	description?: string;
	subType?: AjoExpressionSubType;
}): AjoExpressionFragmentPayload {
	return {
		name: opts.name,
		...(opts.description ? { description: opts.description } : {}),
		type: 'expression',
		subType: opts.subType ?? 'HTML',
		channels: ['shared'],
		source: { origin: 'ajo', metadata: {} },
		fragment: { expression: opts.expression }
	};
}
