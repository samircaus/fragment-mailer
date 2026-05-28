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

const OUTPUT_TOKEN_RE = /\{\{\s*([\s\S]*?)\s*\}\}/g;
const VALID_CF_PATH_RE = /^cf\.[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/;

// 1 ─────────────────────────────────────────────────────────────────────────
// Inject data-aue-* onto each <span data-fm-binding> marker.
export function injectUEAttributes(html: string, bindings: UEBinding[]): string {
	let result = html;

	for (const binding of bindings) {
		const escapedPath = escapeAttr(binding.fieldPath);
		const searchPattern = `data-fm-binding="${escapedPath}"`;
		if (!result.includes(searchPattern)) continue;

		// URN uses the "aemconnection" reference name declared in the page <meta> tag.
		const aueResource = cfUeResourceUrn(binding.cfPath);
		const aueType = mapFieldTypeToAUE(binding.fieldType);
		const aueLabel = binding.fieldName.replace(/([A-Z])/g, ' $1').trim();

		const replacement =
			`data-fm-binding="${escapedPath}" ` +
			`data-aue-resource="${escapeAttr(aueResource)}" ` +
			`data-aue-prop="${escapeAttr(binding.fieldName)}" ` +
			`data-aue-type="${aueType}" ` +
			`data-aue-label="${escapeAttr(aueLabel)}"` +
			(binding.modelId ? ` data-aue-model="${escapeAttr(binding.modelId)}"` : '');

		result = result.replaceAll(searchPattern, replacement);
	}

	return result;
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
export function injectUEHead(html: string, aemBaseUrl: string, previewUrl?: string): string {
	const tags = [
		`<link rel="preload" href="https://universal-editor-service.adobe.io/cors.js" as="script">`,
		`<meta name="urn:adobe:aue:system:aemconnection" content="aem:${aemBaseUrl}">`,
		...(previewUrl
			? [`<meta name="urn:adobe:aue:config:preview" content="${escapeAttr(previewUrl)}">`]
			: []),
		`<script src="https://universal-editor-service.adobe.io/cors.js"></script>`,
		`<script type="application/vnd.adobe.aue.component+json" src="/component-definition.json"></script>`,
		`<script type="application/vnd.adobe.aue.model+json" src="/component-models.json"></script>`
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
export function instrumentCFOutputTokens(template: string): string {
	return transformOutsideTags(template, (segment) =>
		segment.replace(OUTPUT_TOKEN_RE, (full, expr: string, offset: number, input: string) => {
			const fieldPath = extractCFPath(expr);
			if (!fieldPath) return full;
			if (isInsideBindingSpan(input, offset)) return full;
			return wrapWithBinding(full, fieldPath);
		})
	);
}

// Discover all {{cf.*}} output bindings used in the template body text.
export function collectCFOutputBindings(template: string): string[] {
	const found = new Set<string>();
	transformOutsideTags(template, (segment) => {
		segment.replace(OUTPUT_TOKEN_RE, (_full, expr: string) => {
			const fieldPath = extractCFPath(expr);
			if (fieldPath) found.add(fieldPath);
			return _full;
		});
		return segment;
	});
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

function transformOutsideTags(input: string, transform: (segment: string) => string): string {
	let output = '';
	let textStart = 0;
	let inTag = false;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		if (!inTag && ch === '<') {
			output += transform(input.slice(textStart, i));
			inTag = true;
			textStart = i;
			continue;
		}
		if (inTag && ch === '>') {
			output += input.slice(textStart, i + 1);
			inTag = false;
			textStart = i + 1;
		}
	}

	if (textStart < input.length) {
		const remainder = input.slice(textStart);
		output += inTag ? remainder : transform(remainder);
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
