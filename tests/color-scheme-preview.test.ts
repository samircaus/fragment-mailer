import { describe, expect, it } from 'vitest';
import {
	applyPreviewColorScheme,
	collectDarkModeRulesFromHtml,
	extractDarkModeRulesFromCss
} from '../src/lib/preview/color-scheme-preview.js';

describe('extractDarkModeRulesFromCss', () => {
	it('extracts rules inside prefers-color-scheme: dark media blocks', () => {
		const css = `
			.body { background: #fff; }
			@media (prefers-color-scheme: dark) {
				.body { background: #1a1a1a !important; color: #eee !important; }
				a { color: #9cf; }
			}
		`;
		const rules = extractDarkModeRulesFromCss(css);
		expect(rules).toHaveLength(1);
		expect(rules[0]).toContain('background: #1a1a1a');
		expect(rules[0]).toContain('color: #9cf');
	});
});

describe('applyPreviewColorScheme', () => {
	it('tags html, meta, and injects activated dark rules', () => {
		const html = `<!DOCTYPE html><html><head>
			<style>
				@media (prefers-color-scheme: dark) {
					.wrap { background-color: #000000 !important; }
				}
			</style>
		</head><body class="wrap"><p>Hi</p></body></html>`;

		const out = applyPreviewColorScheme(html, 'dark');
		expect(out).toContain('class="fm-preview-dark"');
		expect(out).toContain('color-scheme: dark');
		expect(out).toContain('name="color-scheme" content="dark light"');
		expect(out).toContain('background-color: #000000 !important');
		expect(out).toContain('fm-preview-dark-simulation');
	});

	it('leaves html unchanged in light mode', () => {
		const html = '<html><body>Hi</body></html>';
		expect(applyPreviewColorScheme(html, 'light')).toBe(html);
	});
});

describe('collectDarkModeRulesFromHtml', () => {
	it('reads rules from style tags', () => {
		const html = `<html><head><style>
			@media only screen and (prefers-color-scheme: dark) {
				td { color: #fff; }
			}
		</style></head></html>`;
		expect(collectDarkModeRulesFromHtml(html)).toContain('color: #fff');
	});
});
