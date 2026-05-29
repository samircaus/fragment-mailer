import { describe, expect, it } from 'vitest';
import { buildCfFieldMjmlSnippet, cfTokenForField } from '../src/lib/templates/cf-insert.js';

describe('cf-insert', () => {
	it('uses Html suffix for rich text fields', () => {
		expect(cfTokenForField('emailCopy', 'text/html')).toBe('cf.emailCopyHtml');
	});

	it('builds mj-text snippet for text fields', () => {
		expect(buildCfFieldMjmlSnippet({ name: 'title', type: 'text', label: 'Title' })).toContain(
			'{{cf.title}}'
		);
	});

	it('builds image snippet for asset fields', () => {
		expect(buildCfFieldMjmlSnippet({ name: 'bannerImage', type: 'asset', label: 'Banner' })).toContain(
			'{{cf.bannerImageUrl}}'
		);
	});
});
