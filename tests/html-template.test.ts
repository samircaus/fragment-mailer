import { beforeEach, describe, expect, it } from 'vitest';
import { buildHtmlTree } from '../src/lib/html/tree.js';
import {
	collectCFOutputBindings,
	injectUEAttributes,
	instrumentCFOutputTokens
} from '../src/lib/render/inject-ue.js';
import { renderTemplateSource } from '../src/lib/render/compile-template.js';
import { resolve } from '../src/lib/render/resolve.js';
import { syncTemplateFromAemModel } from '../src/lib/templates/cf-fields.js';
import {
	inferSourceFormatFromContent,
	resolveTemplateSourceFormat
} from '../src/lib/templates/source-format.js';
import {
	createTemplate,
	listTemplatePickerItems,
	loadTemplate,
	resetTemplateStoreForTests
} from '../src/lib/templates/service.js';

const BASE_CONTEXT = {
	cf: { heroHeadline: 'Hello World' },
	profile: {},
	preserveProfile: false,
	static: { year: 2026 }
};

describe('source format resolution', () => {
	it('infers html from doctype markup', () => {
		expect(inferSourceFormatFromContent('<!DOCTYPE html><html><body></body></html>')).toBe('html');
	});

	it('prefers html inference when AEM sync dropped sourceFormat metadata', () => {
		const html = '<!DOCTYPE html><html><body><p>{{cf.heroHeadline}}</p></body></html>';
		expect(
			resolveTemplateSourceFormat(html, {
				definition: {
					id: 'x',
					name: 'X',
					version: '1.0.0',
					cfModel: '',
					fields: {},
					profileTokens: [],
					previewSize: { width: 600, height: 800 }
				}
			})
		).toBe('html');
	});

	it('preserves sourceFormat when syncing template fields from AEM', () => {
		const result = syncTemplateFromAemModel({
			templateId: 'html-offer',
			existingDefinition: {
				id: 'html-offer',
				name: 'HTML Offer',
				version: '1.0.0',
				cfModel: 'offer',
				sourceFormat: 'html',
				fields: {},
				profileTokens: [],
				previewSize: { width: 600, height: 800 }
			},
			aemModel: {
				id: 'offer',
				title: 'Offer',
				fields: [{ name: 'heroHeadline', label: 'Headline', type: 'text', required: false }]
			}
		});
		expect(result.definition.sourceFormat).toBe('html');
	});
});

describe('HTML template rendering', () => {
	it('skips MJML compile for html source format', async () => {
		const html = `<!DOCTYPE html><html><body><h1>{{cf.heroHeadline}}</h1></body></html>`;
		const result = await renderTemplateSource(html, BASE_CONTEXT, { sourceFormat: 'html' });
		expect(result.html).toContain('Hello World');
		expect(result.errors).toHaveLength(0);
	});

	it('instruments img tags with fm-binding comments', () => {
		const html = `<img src="{{{cf.heroOffer.bannerImage}}}" alt="{{cf.title}}" />`;
		const instrumented = instrumentCFOutputTokens(html, 'html');
		expect(instrumented).toContain('<!-- fm-binding:cf.heroOffer.bannerImage -->');
		expect(instrumented).toContain('src="{{{cf.heroOffer.bannerImage}}}"');
	});

	it('wraps cf tokens in text nodes', () => {
		const html = '<p>Hello {{cf.heroHeadline}}</p>';
		const instrumented = instrumentCFOutputTokens(html, 'html');
		expect(instrumented).toContain(
			'<span data-fm-binding="cf.heroHeadline">{{cf.heroHeadline}}</span>'
		);
	});
});

describe('HTML structure tree', () => {
	it('builds a DOM tree from email HTML when DOMParser is available', () => {
		if (typeof DOMParser === 'undefined') return;
		const nodes = buildHtmlTree(
			'<table><tr><td><h1>Title</h1><p>Body</p></td></tr></table>'
		);
		expect(nodes.map((n) => n.tag)).toEqual(['table', 'tr', 'td', 'h1', 'p']);
	});
});

describe('HTML template storage', () => {
	beforeEach(() => {
		resetTemplateStoreForTests();
	});

	it('creates and lists html templates', async () => {
		await createTemplate(undefined, {
			id: 'html-newsletter',
			name: 'HTML Newsletter',
			sourceFormat: 'html',
			mjml: '<!DOCTYPE html><html><body><p>Hi</p></body></html>'
		});

		const loaded = await loadTemplate(undefined, 'html-newsletter');
		expect(loaded.data?.definition.sourceFormat).toBe('html');

		const items = await listTemplatePickerItems(undefined);
		const item = items.find((t) => t.id === 'html-newsletter');
		expect(item?.sourceFormat).toBe('html');
	});
});

describe('HTML UE injection', () => {
	it('stamps data-aue-* on img after fm-binding comment', () => {
		const html = `<!-- fm-binding:cf.heroOffer.bannerImage --><img src="https://example.com/hero.jpg" alt="Hero" />`;
		const stamped = injectUEAttributes(html, [
			{
				fieldPath: 'cf.heroOffer.bannerImage',
				cfPath: '/content/dam/campaigns/spring',
				fieldName: 'bannerImage',
				fieldType: 'url'
			}
		]);
		expect(stamped).toContain('data-aue-resource=');
		expect(stamped).toContain('data-aue-prop="bannerImage"');
	});
});

describe('HTML binding discovery', () => {
	it('collects cf paths from html attributes and text', () => {
		const html = `
			<h1>{{cf.heroHeadline}}</h1>
			<a href="{{cf.ctaUrl}}">Buy</a>
			<img src="{{{cf.heroOffer.bannerImage}}}" />
		`;
		const bindings = collectCFOutputBindings(html);
		expect(bindings).toContain('cf.heroHeadline');
		expect(bindings).toContain('cf.ctaUrl');
		expect(bindings).toContain('cf.heroOffer.bannerImage');
	});

	it('resolves html template tokens', () => {
		const { html } = resolve(
			instrumentCFOutputTokens('<p>{{cf.heroHeadline}}</p>', 'html'),
			BASE_CONTEXT
		);
		expect(html).toContain('Hello World');
	});
});
