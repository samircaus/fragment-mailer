// Content validation rules.
// Scans resolved CF field values and the final rendered HTML for common authoring mistakes.
//
// Rule set is intentionally conservative — false positives confuse authors more than false negatives.

export type Severity = 'error' | 'warning' | 'info';

export interface ValidationWarning {
	severity: Severity;
	fieldPath: string;
	message: string;
	suggestion: string;
}

type ValidationResult = { warnings: ValidationWarning[] };

// Rule 1: HTML-as-text — markup typed into a plain-text CF field gets escaped and renders as literals.
// Catches patterns like &lt;sub&gt;, &lt;br&gt;, &lt;strong&gt; where the author typed raw HTML
// into a plain-text field and AEM escaped it on save.
// The alternation handles both space/slash-terminated tags (&lt;br /&gt;) and &gt;-terminated ones.
const HTML_ENTITY_RE = /&lt;[a-z][a-z0-9]*(?:[\s/>]|&gt;)/i;
const ESCAPED_CLOSE_TAG_RE = /&lt;\/[a-z]+&gt;/i;

// Rule 2: Unresolved CF tokens in rendered output — a CF field was missing
const UNRESOLVED_CF_TOKEN_RE = /\{\{cf\.[^}]+\}\}/;

// Rule 3: AJO comment-style tokens leaking through (should only appear in source, not output)
const AJO_COMMENT_TOKEN_RE = /\{\{!--[\s\S]*?--\}\}/;

// Rule 4: Empty structural tags in final HTML
const EMPTY_TAG_RE = /<(h[1-6]|p|td)[^>]*>\s*<\/\1>/g;

export function validateCFFields(
	fields: Record<string, unknown>,
	_fieldTypes: Record<string, string>
): ValidationResult {
	const warnings: ValidationWarning[] = [];

	for (const [fieldName, value] of Object.entries(fields)) {
		if (typeof value !== 'string') continue;

		const path = `cf.${fieldName}`;

		// Rule 1: escaped HTML entities in any field
		if (HTML_ENTITY_RE.test(value) || ESCAPED_CLOSE_TAG_RE.test(value)) {
			warnings.push({
				severity: 'error',
				fieldPath: path,
				message: `Field contains escaped HTML markup (e.g. &lt;sub&gt;). This will render as literal text in the email.`,
				suggestion:
					'Remove the HTML tags from this field. Use a rich-text field type if formatting is needed.'
			});
		}
	}

	return { warnings };
}

export function validateRenderedHTML(html: string): ValidationResult {
	const warnings: ValidationWarning[] = [];

	// Rule 2: unresolved CF tokens
	const cfTokenMatches = html.match(new RegExp(UNRESOLVED_CF_TOKEN_RE.source, 'g')) ?? [];
	for (const token of cfTokenMatches) {
		warnings.push({
			severity: 'error',
			fieldPath: token,
			message: `Unresolved token "${token}" found in rendered output — the CF field is missing or empty.`,
			suggestion: 'Ensure the CF fragment has a value for this field.'
		});
	}

	// Rule 3: AJO comment tokens leaking through
	if (AJO_COMMENT_TOKEN_RE.test(html)) {
		warnings.push({
			severity: 'warning',
			fieldPath: 'html',
			message: 'AJO comment-style tokens ({{!-- ... --}}) found in rendered output.',
			suggestion: 'These should not appear in the final HTML. Check the template for stray tokens.'
		});
	}

	// Rule 4: empty structural tags
	const emptyTagMatches = html.match(EMPTY_TAG_RE) ?? [];
	for (const tag of emptyTagMatches) {
		const tagName = tag.match(/<([a-z0-9]+)/)?.[1] ?? 'element';
		warnings.push({
			severity: 'warning',
			fieldPath: `html/${tagName}`,
			message: `Empty <${tagName}> element in rendered output — likely a missing CF field.`,
			suggestion: 'Check whether the corresponding CF field is populated.'
		});
	}

	return { warnings };
}

// Merge field-level and HTML-level validation results
export function validate(
	fields: Record<string, unknown>,
	fieldTypes: Record<string, string>,
	renderedHtml: string
): ValidationWarning[] {
	const { warnings: fieldWarnings } = validateCFFields(fields, fieldTypes);
	const { warnings: htmlWarnings } = validateRenderedHTML(renderedHtml);
	return [...fieldWarnings, ...htmlWarnings];
}
