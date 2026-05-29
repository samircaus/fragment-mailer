import { describe, expect, it } from 'vitest';
import {
	AJO_TEMPLATE_CONTENT_TYPE,
	buildAjoEmailHtmlTemplatePayload
} from '../src/lib/ajo/types.js';

describe('buildAjoEmailHtmlTemplatePayload', () => {
	it('builds the AJO content template API shape', () => {
		const payload = buildAjoEmailHtmlTemplatePayload({
			name: 'Summer Sale',
			html: '<p>Hello</p>',
			description: 'Exported from AEM',
			origin: 'aem'
		});

		expect(payload).toEqual({
			name: 'Summer Sale',
			description: 'Exported from AEM',
			templateType: 'html',
			channels: ['email'],
			source: { origin: 'aem', metadata: {} },
			template: { html: '<p>Hello</p>', editorContext: {} }
		});
	});

	it('omits description when not provided', () => {
		const payload = buildAjoEmailHtmlTemplatePayload({
			name: 'Minimal',
			html: '<p>Hi</p>'
		});

		expect(payload.description).toBeUndefined();
		expect(payload.source?.origin).toBe('ajo');
	});
});

describe('AJO_TEMPLATE_CONTENT_TYPE', () => {
	it('uses the AJO template media type', () => {
		expect(AJO_TEMPLATE_CONTENT_TYPE).toBe('application/vnd.adobe.ajo.template.v1+json');
	});
});
