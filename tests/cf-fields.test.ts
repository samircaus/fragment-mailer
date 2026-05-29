import { describe, expect, it } from 'vitest';
import {
	buildFieldMappings,
	syncTemplateFromAemModel,
	toCfElementName
} from '../src/lib/templates/cf-fields.js';
import type { TemplateDefinition } from '../src/lib/templates/types.js';

describe('cf-fields', () => {
	it('toCfElementName capitalizes API field names', () => {
		expect(toCfElementName('emailCopy')).toBe('EmailCopy');
		expect(toCfElementName('title')).toBe('Title');
	});

	it('buildFieldMappings flags aueProp mismatches', () => {
		const definition: TemplateDefinition = {
			id: 'offer',
			name: 'Offer',
			version: '1.0.0',
			cfModel: 'Offer',
			fields: {
				emailCopy: {
					type: 'richtext',
					required: true,
					binding: 'cf.emailCopy',
					aueProp: 'emailBody',
					modelId: 'offer-body'
				}
			},
			profileTokens: [],
			previewSize: { width: 600, height: 900 }
		};

		const rows = buildFieldMappings(definition, null, null);
		expect(rows[0]?.mismatch).toContain('emailBody');
	});

	it('syncTemplateFromAemModel uses AEM field names for UE', () => {
		const result = syncTemplateFromAemModel({
			templateId: 'offer',
			aemModel: {
				id: 'offer-model',
				title: 'Offer',
				fields: [
					{ name: 'title', label: 'Title', type: 'text', required: true, multiple: false },
					{ name: 'emailCopy', label: 'Email Copy', type: 'text/html', required: true, multiple: false }
				]
			}
		});

		expect(result.definition.fields.emailCopy?.aueProp).toBeUndefined();
		expect(result.definition.fields.emailCopy?.binding).toBe('cf.emailCopy');
		expect(result.componentModels[1]?.fields[0]?.name).toBe('emailCopy');
		expect(result.componentDefinition.groups[0]?.components[1]?.plugins.aem.cf.name).toBe(
			'EmailCopy'
		);
	});
});
