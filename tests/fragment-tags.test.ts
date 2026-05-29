import { describe, expect, it } from 'vitest';
import {
	collectFragmentIds,
	inlineFragmentTags
} from '../src/lib/render/fragment-tags.js';
import { DEFAULT_BRAND_FOOTER_EXPRESSION } from '../src/lib/fragments/brand-footer.js';

describe('fragment-tags', () => {
	it('collects fragment ids from AJO reference tags', () => {
		const mjml = '<mj-raw>{%#fragment id="brand-footer"%}{%/fragment%}</mj-raw>';
		expect(collectFragmentIds(mjml)).toEqual(['brand-footer']);
	});

	it('inlines fragment expression content for preview', () => {
		const mjml = 'Footer: {%#fragment id="brand-footer"%}{%/fragment%}';
		const html = inlineFragmentTags(mjml, {
			'brand-footer': DEFAULT_BRAND_FOOTER_EXPRESSION
		});
		expect(html).toContain('Acme Corp');
		expect(html).not.toContain('{%#fragment');
	});
});
