import { collectLetVariableBindings, extractLetVarPath, parseLetFragmentAliases } from '$lib/render/let-bindings.js';
import type { TemplateSourceFormat } from '$lib/templates/source-format.js';
import { cfUeResourceUrn } from '$lib/ue/context.js';

// Universal Editor (UE) attribute injector.
//
// After MJML compiles to HTML, this module:
//   1. injectUEAttributes — adds data-aue-* onto <span data-fm-binding> markers placed by the resolver
//   2. injectUEBody       — stamps the <body> tag as the UE component root for the CF resource
//   3. injectUEHead       — adds the AEM connection meta, CORS script, and model/definition script refs
//
// The resolver wraps CF token values in <span data-fm-binding="cf.fieldName"> before MJML
// compilation. MJML passes these spans through unchanged inside mj-text components.

export interface UEBinding {
	fieldPath: string; // e.g. "cf.heroHeadline" or "cf.featuredOffer.headline"
	cfPath: string;    // AEM DAM path, e.g. /content/dam/campaigns/spring-promo
	fieldName: string; // e.g. "heroHeadline"
	fieldType: 'text' | 'richtext' | 'url' | 'reference';
	modelId?: string;  // per-span UE model, e.g. "hero", "promo-body", "offer-body"
}

const TRIPLE_OUTPUT_TOKEN_RE = /\{\{\{\s*([\s\S]*?)\s*\}\}\}/g;
const OUTPUT_TOKEN_RE = /\{\{\s*([\s\S]*?)\s*\}\}/g;
const VALID_CF_PATH_RE = /^cf\.[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/;

// 1 ─────────────────────────────────────────────────────────────────────────
// Inject data-aue-* onto each <span data-fm-binding> marker and on <img> after fm-binding comments.
export function injectUEAttributes(html: string, bindings: UEBinding[]): string {
	let result = injectUEImageCommentBindings(html, bindings);

	for (const binding of bindings) {
		const escapedPath = escapeAttr(binding.fieldPath);
		const searchPattern = `data-fm-binding="${escapedPath}"`;
		if (!result.includes(searchPattern)) continue;

		result = result.replaceAll(searchPattern, buildFmBindingReplacement(binding, escapedPath));
	}

	return result;
}

/** Stamp data-aue-* on the first <img> after each compile-time fm-binding comment. */
function injectUEImageCommentBindings(html: string, bindings: UEBinding[]): string {
	let result = html;

	for (const binding of bindings) {
		const comment = fmBindingComment(binding.fieldPath);
		let searchFrom = 0;

		while (searchFrom < result.length) {
			const commentIdx = result.indexOf(comment, searchFrom);
			if (commentIdx === -1) break;

			const nextMarker = result.indexOf('<!-- fm-binding:', commentIdx + comment.length);
			const segmentEnd = nextMarker === -1 ? result.length : nextMarker;
			const segment = result.slice(commentIdx, segmentEnd);
			const imgMatch = segment.match(/<img\b([^>]*)>/i);
			if (!imgMatch || imgMatch.index === undefined) {
				searchFrom = commentIdx + comment.length;
				continue;
			}

			if (/\bdata-aue-resource=/.test(imgMatch[1])) {
				searchFrom = commentIdx + comment.length;
				continue;
			}

			const aueAttrs = buildAueAttributeSuffix(binding);
			const attrs = imgMatch[1];
			const trimmed = attrs.trimStart();
			const spacer = trimmed.length > 0 ? ' ' : '';
			const stampedImg = `<img ${aueAttrs}${spacer}${trimmed}>`;
			const absoluteStart = commentIdx + imgMatch.index;
			result =
				result.slice(0, absoluteStart) +
				stampedImg +
				result.slice(absoluteStart + imgMatch[0].length);

			searchFrom = absoluteStart + stampedImg.length;
		}
	}

	return result;
}

function buildFmBindingReplacement(binding: UEBinding, escapedPath: string): string {
	return `data-fm-binding="${escapedPath}" ${buildAueAttributeSuffix(binding)}`.trimEnd();
}

function buildAueAttributeSuffix(binding: UEBinding): string {
	const aueResource = cfUeResourceUrn(binding.cfPath);
	const aueType = mapFieldTypeToAUE(binding.fieldType);
	const aueLabel = binding.fieldName.replace(/([A-Z])/g, ' $1').trim();

	return (
		`data-aue-resource="${escapeAttr(aueResource)}" ` +
		`data-aue-prop="${escapeAttr(binding.fieldName)}" ` +
		`data-aue-type="${aueType}" ` +
		`data-aue-label="${escapeAttr(aueLabel)}"` +
		(binding.modelId ? ` data-aue-model="${escapeAttr(binding.modelId)}"` : '')
	);
}

function fmBindingComment(fieldPath: string): string {
	return `<!-- fm-binding:${fieldPath} -->`;
}

// 2 ─────────────────────────────────────────────────────────────────────────
// Stamp the <body> tag as the UE component root pointing to the CF resource.
// UE uses this to scope in-context editing and load the right properties panel model.
export function injectUEBody(html: string, cfPath: string, modelId?: string): string {
	const aueResource = escapeAttr(cfUeResourceUrn(cfPath));
	const modelAttr = modelId ? ` data-aue-model="${escapeAttr(modelId)}"` : '';
	return html.replace(
		/<body(\s|>)/,
		`<body data-aue-resource="${aueResource}" data-aue-type="component"${modelAttr}$1`
	);
}

// 3 ─────────────────────────────────────────────────────────────────────────
// Inject into <head>:
//   - AEM connection meta (registers the "aemconnection" URN reference name)
//   - UE CORS bridge script (allows UE overlay to attach)
//   - Component model definitions (properties panel field schema)
//   - Component definitions (groups/components registered in UE insert menu)
export function injectUEHead(
	html: string,
	aemBaseUrl: string,
	previewUrl?: string,
	ueAssets?: { componentDefinitionUrl?: string; componentModelsUrl?: string }
): string {
	const componentDefinitionUrl = ueAssets?.componentDefinitionUrl ?? '/component-definition.json';
	const componentModelsUrl = ueAssets?.componentModelsUrl ?? '/component-models.json';
	const tags = [
		`<link rel="preload" href="https://universal-editor-service.adobe.io/cors.js" as="script">`,
		`<meta name="urn:adobe:aue:system:aemconnection" content="aem:${aemBaseUrl}">`,
		...(previewUrl
			? [`<meta name="urn:adobe:aue:config:preview" content="${escapeAttr(previewUrl)}">`]
			: []),
		`<script src="https://universal-editor-service.adobe.io/cors.js"></script>`,
		`<script type="application/vnd.adobe.aue.component+json" src="${escapeAttr(componentDefinitionUrl)}"></script>`,
		`<script type="application/vnd.adobe.aue.model+json" src="${escapeAttr(componentModelsUrl)}"></script>`
	].join('\n');

	return html.replace('</head>', `${tags}\n</head>`);
}

// 4 ─────────────────────────────────────────────────────────────────────────
// Wrap a resolved CF token value in the fm-binding marker span.
// Called by the render pipeline before MJML compilation.
export function wrapWithBinding(value: string, fieldPath: string): string {
	return `<span data-fm-binding="${escapeAttr(fieldPath)}">${value}</span>`;
}

// Wrap all render-output CF tokens ({{cf.*}}) in data-fm-binding spans.
// This runs on template MJML before resolver execution, so compiled HTML keeps
// stable markers that UE can instrument even if template definitions lag behind.
function instrumentCfTokensInSegment(segment: string, letAliases: Map<string, string>): string {
	const withCf = instrumentOutputTokensInSegment(segment, letAliases, (expr) => extractCFPath(expr));
	return instrumentOutputTokensInSegment(withCf, letAliases, (expr, roots) =>
		extractLetVarPath(expr, roots)
	);
}

function instrumentOutputTokensInSegment(
	segment: string,
	letAliases: Map<string, string>,
	extractPath: (expr: string, letRoots: Set<string>) => string | null
): string {
	const letRoots = new Set(letAliases.keys());
	const wrap = (full: string, expr: string, offset: number, input: string) => {
		const fieldPath = extractPath(expr, letRoots);
		if (!fieldPath) return full;
		if (isInsideBindingSpan(input, offset)) return full;
		return wrapWithBinding(full, fieldPath);
	};

	return segment.replace(TRIPLE_OUTPUT_TOKEN_RE, wrap).replace(OUTPUT_TOKEN_RE, wrap);
}

function collectCfTokensInSegment(segment: string, found: Set<string>): void {
	collectCfPathsInText(segment, found);
}

function collectCfPathsInText(text: string, found: Set<string>): void {
	const collect = (_full: string, expr: string) => {
		const fieldPath = extractCFPath(expr);
		if (fieldPath) found.add(fieldPath);
		return _full;
	};

	text.replace(TRIPLE_OUTPUT_TOKEN_RE, collect);
	text.replace(OUTPUT_TOKEN_RE, collect);
}

const UE_ATTRIBUTE_TAG_RE: Record<TemplateSourceFormat, RegExp> = {
	mjml: /\b(?:mj-image|mj-button)\b/i,
	html: /\b(?:img|a)\b/i
};

export function instrumentCFOutputTokens(
	template: string,
	sourceFormat: TemplateSourceFormat = 'mjml'
): string {
	const letAliases = parseLetFragmentAliases(template);
	return transformTemplateMarkup(
		template,
		(seg) => instrumentCfTokensInSegment(seg, letAliases),
		(tag) => instrumentCfTokensInTag(tag, letAliases, sourceFormat)
	);
}

// Discover all {{cf.*}} and {{offer0.*}} output bindings used in the template.
export function collectCFOutputBindings(template: string): string[] {
	const letAliases = parseLetFragmentAliases(template);
	const found = new Set<string>();
	transformTemplateMarkup(
		template,
		(segment) => {
			collectCfTokensInSegment(segment, found);
			return segment;
		},
		(tag) => {
			collectCfPathsInText(tag, found);
			return tag;
		}
	);
	for (const path of collectLetVariableBindings(template, letAliases)) {
		found.add(path);
	}
	return [...found];
}

function mapFieldTypeToAUE(type: UEBinding['fieldType']): string {
	switch (type) {
		case 'richtext':
			return 'richtext';
		case 'url':
			return 'text';
		case 'reference':
			return 'reference';
		case 'text':
		default:
			return 'text';
	}
}

function instrumentCfTokensInTag(
	tag: string,
	letAliases: Map<string, string>,
	sourceFormat: TemplateSourceFormat = 'mjml'
): string {
	if (!UE_ATTRIBUTE_TAG_RE[sourceFormat].test(tag)) return tag;

	const paths = collectCfPathsFromTag(tag, letAliases);
	if (paths.length === 0) return tag;

	const fieldPath = pickPrimaryTagBindingPath(tag, paths);
	if (!fieldPath) return tag;

	const comment = fmBindingComment(fieldPath);
	if (tag.includes(comment)) return tag;

	return `${comment}${tag}`;
}

function collectCfPathsFromTag(tag: string, letAliases: Map<string, string>): string[] {
	const found = new Set<string>();
	collectCfPathsInText(tag, found);
	const letRoots = new Set(letAliases.keys());
	const collectVar = (_full: string, expr: string) => {
		const path = extractLetVarPath(expr, letRoots);
		if (path) found.add(path);
		return _full;
	};
	tag.replace(TRIPLE_OUTPUT_TOKEN_RE, collectVar);
	tag.replace(OUTPUT_TOKEN_RE, collectVar);
	return [...found];
}

function pickPrimaryTagBindingPath(tag: string, paths: string[]): string | null {
	if (paths.length === 0) return null;
	if (paths.length === 1) return paths[0] ?? null;

	const attrOrder = ['src', 'href', 'alt'] as const;
	for (const attr of attrOrder) {
		const attrRe = new RegExp(`${attr}\\s*=\\s*["'][^"']*["']`, 'i');
		const attrMatch = tag.match(attrRe);
		if (!attrMatch) continue;
		const attrValue = attrMatch[0];
		for (const path of paths) {
			if (attrValue.includes(path)) return path;
		}
	}

	return paths[0] ?? null;
}

function transformTemplateMarkup(
	input: string,
	transformText: (segment: string) => string,
	transformTag: (tag: string) => string
): string {
	let output = '';
	let textStart = 0;
	let inTag = false;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		if (!inTag && ch === '<') {
			output += transformText(input.slice(textStart, i));
			inTag = true;
			textStart = i;
			continue;
		}
		if (inTag && ch === '>') {
			output += transformTag(input.slice(textStart, i + 1));
			inTag = false;
			textStart = i + 1;
		}
	}

	if (textStart < input.length) {
		const remainder = input.slice(textStart);
		output += inTag ? transformTag(remainder) : transformText(remainder);
	}

	return output;
}

function extractCFPath(expr: string): string | null {
	const baseExpr = expr.split('|')[0]?.trim();
	if (!baseExpr) return null;
	return VALID_CF_PATH_RE.test(baseExpr) ? baseExpr : null;
}

function isInsideBindingSpan(segment: string, offset: number): boolean {
	const openSpanIdx = segment.lastIndexOf('<span', offset);
	if (openSpanIdx === -1) return false;
	const closeSpanIdx = segment.lastIndexOf('</span>', offset);
	if (closeSpanIdx > openSpanIdx) return false;
	const openSpan = segment.slice(openSpanIdx, offset);
	return openSpan.includes('data-fm-binding=');
}

function escapeAttr(value: string): string {
	return value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
