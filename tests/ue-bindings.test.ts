import { describe, expect, it } from 'vitest';
import { injectUEAttributes } from '../src/lib/render/inject-ue.js';
import { buildUEBindings } from '../src/lib/render/ue-bindings.js';
import type { TemplateDefinition } from '../src/lib/templates/registry.js';

const offerDefinition = {
	id: 'offer',
	name: 'Offer',
	version: '1.0.0',
	cfModel: 'Offer',
	fields: {
		emailCopy: {
			type: 'richtext',
			required: true,
			modelId: 'offer-email-copy'
		}
	},
	profileTokens: [],
	previewSize: { width: 600, height: 900 }
} as TemplateDefinition;

describe('buildUEBindings', () => {
	it('maps render token to AEM prop with richtext type', () => {
		const bindings = buildUEBindings({
			definition: offerDefinition,
			discoveredBindings: ['cf.emailCopy'],
			defaultCfPath: '/content/dam/offers/spring',
			cfFields: {}
		});

		const emailBinding = bindings.find((b) => b.fieldPath === 'cf.emailCopy');
		expect(emailBinding).toEqual({
			fieldPath: 'cf.emailCopy',
			cfPath: '/content/dam/offers/spring',
			fieldName: 'emailCopy',
			fieldType: 'richtext',
			modelId: 'offer-email-copy'
		});
	});
});

describe('injectUEAttributes — richtext', () => {
	it('emits data-aue-type="richtext" for email body', () => {
		const html =
			'<span data-fm-binding="cf.emailCopy"><p>Hello</p></span>';
		const out = injectUEAttributes(html, [
			{
				fieldPath: 'cf.emailCopy',
				cfPath: '/content/dam/offers/spring',
				fieldName: 'emailCopy',
				fieldType: 'richtext',
				modelId: 'offer-email-copy'
			}
		]);
		expect(out).toContain('data-aue-prop="emailCopy"');
		expect(out).toContain('data-aue-type="richtext"');
		expect(out).toContain('data-aue-model="offer-email-copy"');
	});
});
