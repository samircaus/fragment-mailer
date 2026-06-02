import { describe, expect, it } from 'vitest';
import {
	buildUEBindings,
	resolveAemPropName,
	resolveBindingCFPath
} from '../src/lib/render/ue-bindings.js';

describe('resolveBindingCFPath — nested fragment refs', () => {
	it('resolves referenced CF path from hydrated heroOffer._path', () => {
		const cfPath = resolveBindingCFPath(
			'cf.heroOffer.bannerImage',
			'/content/dam/email/en/campaigns/email-type-cf',
			{
				heroOffer: {
					_path: '/content/dam/email/en/offers/hero-offer-1',
					title: 'Artic Surfing',
					bannerImage: 'https://publish.example.com/surfer.jpg'
				}
			}
		);
		expect(cfPath).toBe('/content/dam/email/en/offers/hero-offer-1');
	});
});

describe('resolveAemPropName', () => {
	it('uses CF token property name, not template field id or aueProp', () => {
		expect(resolveAemPropName('cf.emailCopy')).toBe('emailCopy');
		expect(resolveAemPropName('cf.heroOffer.bannerImage')).toBe('bannerImage');
		expect(resolveAemPropName('cf.emailCopyHtml')).toBe('emailCopy');
	});
});

describe('buildUEBindings — legacy template field id', () => {
	it('maps cf.emailCopy to emailCopy even when template field id is emailBody', () => {
		const bindings = buildUEBindings({
			definition: {
				id: 'offer',
				name: 'Offer',
				version: '1.0.0',
				cfModel: 'Offer',
				fields: {
					emailBody: {
						type: 'richtext',
						required: true,
						binding: 'cf.emailCopy',
						aueProp: 'emailBody',
						modelId: 'offer-email-copy'
					}
				},
				profileTokens: [],
				previewSize: { width: 600, height: 900 }
			},
			discoveredBindings: [],
			defaultCfPath: '/content/dam/offers/spring',
			cfFields: { emailCopy: '<p>Hi</p>' }
		});

		expect(bindings[0]?.fieldName).toBe('emailCopy');
	});
});

describe('buildUEBindings — nested image token', () => {
	it('maps cf.heroOffer.bannerImage to referenced CF with reference type', () => {
		const bindings = buildUEBindings({
			definition: {
				id: 'email',
				name: 'Email',
				version: '1.0.0',
				cfModel: 'Email',
				fields: {},
				profileTokens: [],
				previewSize: { width: 600, height: 900 }
			},
			discoveredBindings: ['cf.heroOffer.bannerImage'],
			defaultCfPath: '/content/dam/email/en/campaigns/email-type-cf',
			cfFields: {
				heroOffer: {
					_path: '/content/dam/email/en/offers/hero-offer-1',
					bannerImage: 'https://publish.example.com/surfer.jpg'
				}
			}
		});

		const imageBinding = bindings.find((b) => b.fieldPath === 'cf.heroOffer.bannerImage');
		expect(imageBinding).toEqual({
			fieldPath: 'cf.heroOffer.bannerImage',
			cfPath: '/content/dam/email/en/offers/hero-offer-1',
			fieldName: 'bannerImage',
			fieldType: 'reference',
			modelId: undefined
		});
	});
});
