// Universal Editor (UE) attribute injector.
//
// After MJML compiles to HTML, this module locates elements that correspond to
// CF-bound fields and adds the data-aue-* attributes that the UE overlay reads.
//
// Approach: the resolver wraps CF token values in <span data-fm-binding="cf.fieldName">
// markers before MJML compilation. MJML passes these spans through unchanged inside
// mj-text components. This post-processor then enriches those markers with the full
// data-aue-* attribute set.
//
// TODO(decision): Verify that the UE overlay can attach to Worker-served HTML.
// UE normally expects content to be hosted on an AEM-authored URL with an adobe-ims
// cookie session. Using UE on a Workers preview URL may require the UE init script
// and a custom connection.url in the page metadata. See README § UE integration.

export interface UEBinding {
	fieldPath: string; // e.g. "cf.heroHeadline" or "cf.featuredOffer.headline"
	cfPath: string; // AEM DAM path, e.g. /content/dam/campaigns/spring-promo
	fieldName: string; // e.g. "heroHeadline"
	fieldType: 'text' | 'richtext' | 'url' | 'reference'; // maps to data-aue-type
}

// Returns HTML with data-aue-* attributes injected onto fm-binding spans.
export function injectUEAttributes(html: string, bindings: UEBinding[]): string {
	let result = html;

	for (const binding of bindings) {
		const escapedPath = escapeAttr(binding.fieldPath);
		// Find <span data-fm-binding="cf.fieldName"> and add aue attributes.
		// Uses a simple string replacement — safe because fm-binding values are controlled.
		const searchPattern = `data-fm-binding="${escapedPath}"`;
		if (!result.includes(searchPattern)) continue;

		const aueResource = `aem:${binding.cfPath}`;
		const aueProp = binding.fieldName;
		const aueType = mapFieldTypeToAUE(binding.fieldType);

		const replacement =
			`data-fm-binding="${escapedPath}" ` +
			`data-aue-resource="${escapeAttr(aueResource)}" ` +
			`data-aue-prop="${escapeAttr(aueProp)}" ` +
			`data-aue-type="${aueType}"`;

		result = result.replaceAll(searchPattern, replacement);
	}

	return result;
}

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
			return 'reference';
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
