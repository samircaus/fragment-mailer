export interface AjoFragmentBinding {
	id: string;
	resultVar: string;
}

export interface PreserveCfRefsOptions {
	primaryFragmentId: string;
	referenceFragmentIds: Record<string, string>;
}

interface RewriteResult {
	mjml: string;
	usedBindings: AjoFragmentBinding[];
}

export function rewriteCfRefsForAjo(template: string, opts: PreserveCfRefsOptions): RewriteResult {
	const primaryBinding: AjoFragmentBinding = { id: opts.primaryFragmentId, resultVar: 'cf' };
	// Nested CF references (cf.heroOffer.*) resolve through the single main fragment in AJO.
	const withFragments = prependFragmentTags(template, [primaryBinding]);
	return { mjml: withFragments, usedBindings: [primaryBinding] };
}

export function wrapAjoControlTagsForMjml(mjml: string): string {
	return mjml.replace(/\{%[#/]?\s*(if|else|endif|let|fragment|load)\b[\s\S]*?%\}/g, (tag) => {
		return `<mj-raw>${tag}</mj-raw>`;
	});
}

/** Liquid `| default:` (preview resolver) → AJO `{%#if %}` blocks. */
export function convertLiquidDefaultFilters(html: string): string {
	return html.replace(
		/\{\{\s*([\s\S]*?)\s*\|\s*default:\s*(['"])([\s\S]*?)\2\s*\}\}/g,
		(_full, expr: string, _quote: string, fallback: string) => {
			const trimmedExpr = expr.trim();
			const trimmedFallback = fallback.trim();
			return `{%#if ${trimmedExpr} %}{{${trimmedExpr}}}{%else%}${trimmedFallback}{%/if%}`;
		}
	);
}

/** MJML leaves nested control tags inside literal `<mj-raw>` wrappers — unwrap for AJO. */
export function stripMjRawPersonalizationWrappers(html: string): string {
	return html.replace(/<mj-raw>\s*([\s\S]*?)\s*<\/mj-raw>/gi, '$1');
}

/**
 * AJO `{%#if %}` conditions are PQL — bare `{%#if offer0.title %}` fails validation.
 * @see https://experienceleague.adobe.com/docs/journey-optimizer/using/content-management/personalization/personalization-syntax.html
 */
export function convertBareAjoIfConditionsToPql(html: string): string {
	return html.replace(/\{%#if\s+([^%]+?)\s*%\}/g, (full, cond: string) => {
		const trimmed = cond.trim();
		if (/[=<>!]/.test(trimmed)) return full;
		return `{%#if ${trimmed} != "" %}`;
	});
}

/** Triple mustache in src/href breaks AJO visual preview (tries to load the token as a URL). */
export function useDoubleMustacheInUrlAttributes(html: string): string {
	return html.replace(
		/\b(src|href)(\s*=\s*)(["'])(\{\{\{([\s\S]*?)\}\}\})\3/gi,
		(_full, attr: string, eq: string, quote: string, _triple: string, expr: string) =>
			`${attr}${eq}${quote}{{${expr.trim()}}}${quote}`
	);
}

/** Normalize legacy single-quoted fragment helpers to AJO-friendly double quotes. */
export function normalizeAjoFragmentTagQuotes(html: string): string {
	return html.replace(
		/\{\{fragment\s+id='([^']+)'\s+result='([^']+)'\}\}/g,
		'{{fragment id="$1" result="$2"}}'
	);
}

/** Convert Liquid-style control tags to AJO Handlebars personalization syntax. */
export function normalizeAjoPersonalizationSyntax(html: string): string {
	return useDoubleMustacheInUrlAttributes(
		normalizeAjoFragmentTagQuotes(
			convertBareAjoIfConditionsToPql(
				stripMjRawPersonalizationWrappers(
					convertLiquidDefaultFilters(
						html
							.replace(/\{%\s*if\s+/g, '{%#if ')
							.replace(/\{%\s*endif\s*%\}/g, '{%/if%}')
							.replace(/\{%\s*else\s*%\}/g, '{%else%}')
					)
				)
			)
		)
	);
}

function prependFragmentTags(mjml: string, bindings: AjoFragmentBinding[]): string {
	if (bindings.length === 0) return mjml;
	const tags = bindings.map((b) => `{{fragment id='${b.id}' result='${b.resultVar}'}}`).join('\n');

	// Place declarations at the top of the document so subsequent usage can reference them.
	const mjmlStart = mjml.indexOf('<mjml');
	if (mjmlStart === -1) return `${tags}\n${mjml}`;
	return `${tags}\n${mjml}`;
}
