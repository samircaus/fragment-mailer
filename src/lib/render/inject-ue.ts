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
	modelId?: string;  // per-span UE model, e.g. "hero", "body-text", "cta"
}

// 1 ─────────────────────────────────────────────────────────────────────────
// Inject data-aue-* onto each <span data-fm-binding> marker.
export function injectUEAttributes(html: string, bindings: UEBinding[]): string {
	let result = html;

	for (const binding of bindings) {
		const escapedPath = escapeAttr(binding.fieldPath);
		const searchPattern = `data-fm-binding="${escapedPath}"`;
		if (!result.includes(searchPattern)) continue;

		// URN uses the "aemconnection" reference name declared in the page <meta> tag.
		const aueResource = `urn:aemconnection:${binding.cfPath}`;
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
export function injectUEBody(html: string, cfPath: string, modelId: string): string {
	const aueResource = escapeAttr(`urn:aemconnection:${cfPath}`);
	return html.replace(
		/<body(\s|>)/,
		`<body data-aue-resource="${aueResource}" data-aue-type="component" data-aue-model="${escapeAttr(modelId)}"$1`
	);
}

// 3 ─────────────────────────────────────────────────────────────────────────
// Inject into <head>:
//   - AEM connection meta (registers the "aemconnection" URN reference name)
//   - UE CORS bridge script (allows UE overlay to attach)
//   - Component model definitions (properties panel field schema)
//   - Component definitions (groups/components registered in UE insert menu)
export function injectUEHead(html: string, aemBaseUrl: string): string {
	const tags = [
		`<meta name="urn:adobe:aue:system:aemconnection" content="aem:${aemBaseUrl}">`,
		`<script src="https://universal-editor-service.adobe.io/cors.js" async></script>`,
		`<script type="application/vnd.adobe.aue.model+json" src="/component-models.json"></script>`,
		`<script type="application/vnd.adobe.aue.component+json" src="/component-definition.json"></script>`
	].join('\n');

	return html.replace('</head>', `${tags}\n</head>`);
}

// 4 ─────────────────────────────────────────────────────────────────────────
// Wrap a resolved CF token value in the fm-binding marker span.
// Called by the render pipeline before MJML compilation.
export function wrapWithBinding(value: string, fieldPath: string): string {
	return `<span data-fm-binding="${escapeAttr(fieldPath)}">${value}</span>`;
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

function escapeAttr(value: string): string {
	return value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
