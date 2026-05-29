// Simulates prefers-color-scheme: dark in the editor preview iframe.
// Well-behaving clients apply @media (prefers-color-scheme: dark) rules when the user
// prefers dark; we promote those rules when the preview toggle is on. Does not emulate
// Outlook or Gmail-specific transforms.

export type PreviewColorScheme = 'light' | 'dark';

const PREVIEW_DARK_CLASS = 'fm-preview-dark';
const SIMULATION_STYLE_ID = 'fm-preview-dark-simulation';

const BASE_DARK_SIMULATION_CSS = `/* Fragment Mailer — simulated prefers-color-scheme: dark (preview only) */
html.${PREVIEW_DARK_CLASS} {
	color-scheme: dark;
}`;

/** Apply or remove dark-mode email preview simulation. */
export function applyPreviewColorScheme(html: string, scheme: PreviewColorScheme): string {
	if (scheme !== 'dark') return html;

	let out = tagHtmlForDarkPreview(html);
	out = ensureColorSchemeMeta(out);
	out = injectDarkSimulationStyles(out);
	return out;
}

function tagHtmlForDarkPreview(html: string): string {
	return html.replace(/<html(\s[^>]*)?>/i, (_match, attrs: string | undefined) => {
		const raw = attrs ?? '';
		let next = raw;

		if (/\bclass\s*=/i.test(next)) {
			next = next.replace(/\bclass\s*=\s*(["'])([^"']*)\1/i, (_m, q: string, classes: string) => {
				const merged = classes.includes(PREVIEW_DARK_CLASS)
					? classes
					: `${classes} ${PREVIEW_DARK_CLASS}`.trim();
				return `class=${q}${merged}${q}`;
			});
		} else {
			next += ` class="${PREVIEW_DARK_CLASS}"`;
		}

		if (/\bstyle\s*=/i.test(next)) {
			next = next.replace(/\bstyle\s*=\s*(["'])([^"']*)\1/i, (_m, q: string, styles: string) => {
				const merged = /color-scheme\s*:/i.test(styles)
					? styles.replace(/color-scheme\s*:\s*[^;]+/i, 'color-scheme: dark')
					: `${styles}; color-scheme: dark`;
				return `style=${q}${merged}${q}`;
			});
		} else {
			next += ' style="color-scheme: dark"';
		}

		return `<html${next}>`;
	});
}

function ensureColorSchemeMeta(html: string): string {
	const meta = '<meta name="color-scheme" content="dark light">';
	if (/<meta[^>]+name=["']color-scheme["']/i.test(html)) {
		return html.replace(
			/<meta[^>]+name=["']color-scheme["'][^>]*>/i,
			meta
		);
	}
	if (/<head(\s[^>]*)?>/i.test(html)) {
		return html.replace(/<head(\s[^>]*)?>/i, `$&\n\t\t${meta}`);
	}
	return `${meta}\n${html}`;
}

function injectDarkSimulationStyles(html: string): string {
	const extracted = collectDarkModeRulesFromHtml(html);
	const block = [
		BASE_DARK_SIMULATION_CSS,
		extracted ? `/* Activated @media (prefers-color-scheme: dark) rules */\n${extracted}` : ''
	]
		.filter(Boolean)
		.join('\n\n');

	const tag = `<style type="text/css" id="${SIMULATION_STYLE_ID}">\n${block}\n</style>`;

	if (/<\/head>/i.test(html)) {
		return html.replace(/<\/head>/i, `${tag}\n</head>`);
	}
	return `${tag}\n${html}`;
}

/** Extract rule bodies from @media (prefers-color-scheme: dark) blocks in HTML <style> tags. */
export function collectDarkModeRulesFromHtml(html: string): string {
	const chunks: string[] = [];
	const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
	let match: RegExpExecArray | null;
	while ((match = styleRe.exec(html)) !== null) {
		const css = match[1];
		if (!css) continue;
		for (const block of extractDarkModeRulesFromCss(css)) {
			chunks.push(block);
		}
	}
	return chunks.join('\n\n');
}

export function extractDarkModeRulesFromCss(css: string): string[] {
	const results: string[] = [];
	const lower = css.toLowerCase();
	let searchFrom = 0;

	while (searchFrom < css.length) {
		const mediaAt = lower.indexOf('@media', searchFrom);
		if (mediaAt === -1) break;

		const braceStart = css.indexOf('{', mediaAt);
		if (braceStart === -1) break;

		const query = css.slice(mediaAt + 7, braceStart).trim();
		const blockEnd = findMatchingBraceEnd(css, braceStart);
		if (blockEnd === -1) break;

		if (/prefers-color-scheme\s*:\s*dark/i.test(query)) {
			const inner = css.slice(braceStart + 1, blockEnd).trim();
			if (inner) results.push(inner);
		}

		searchFrom = blockEnd + 1;
	}

	return results;
}

function findMatchingBraceEnd(css: string, openBraceIndex: number): number {
	let depth = 0;
	for (let i = openBraceIndex; i < css.length; i++) {
		const ch = css[i];
		if (ch === '{') depth++;
		else if (ch === '}') {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}
