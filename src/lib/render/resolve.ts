// Template token resolver. Handles the three-namespace token system:
//
//   {{cf.fieldName}}             — primary CF field
//   {{cf.refName.fieldName}}     — referenced CF field (one level deep)
//   {{profile.person.name.firstName}} — AJO send-time token; preserved in export mode
//   {{static.year}}              — resolved at build/render time
//
// Conditional blocks:
//   {{#if cf.fieldName}}...{{else}}...{{/if}}
//
// Choice: custom resolver instead of Handlebars to avoid the dependency and keep
// the token grammar minimal. The syntax is a strict subset of Handlebars.
// If the grammar grows (partials, each, nested ifs), migrate to handlebars proper.

export interface RenderContext {
	cf: Record<string, unknown>;
	// When preserveProfile is true, {{profile.*}} tokens are left as-is for AJO.
	profile: Record<string, unknown>;
	preserveProfile: boolean;
	static: Record<string, unknown>;
}

type ResolveResult = { html: string; warnings: string[] };

export function resolve(template: string, context: RenderContext): ResolveResult {
	const warnings: string[] = [];

	// Process conditionals first (before simple token substitution)
	let html = resolveConditionals(template, context, warnings);

	// Then resolve simple tokens
	html = resolveTokens(html, context, warnings);

	return { html, warnings };
}

// --- Conditional blocks ---

const IF_BLOCK_RE = /\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;

function resolveConditionals(
	template: string,
	context: RenderContext,
	warnings: string[]
): string {
	return template.replace(IF_BLOCK_RE, (_, path: string, content: string) => {
		const value = lookupPath(path, context, warnings, false);
		const truthy = value !== undefined && value !== null && value !== '' && value !== false;

		// Split on {{else}} if present
		const elseIdx = content.indexOf('{{else}}');
		if (elseIdx !== -1) {
			return truthy ? content.slice(0, elseIdx) : content.slice(elseIdx + 8);
		}
		return truthy ? content : '';
	});
}

// --- Simple tokens ---

// Matches {{some.dotted.path}} but not {{#if}}, {{else}}, {{/if}}
const TOKEN_RE = /\{\{([\w][\w.]*)\}\}/g;

function resolveTokens(template: string, context: RenderContext, warnings: string[]): string {
	return template.replace(TOKEN_RE, (match, path: string) => {
		const value = lookupPath(path, context, warnings, true);
		if (value === undefined) return match; // leave unresolved token visible
		if (value === null) return '';
		return String(value);
	});
}

// --- Path resolution ---

function lookupPath(
	path: string,
	context: RenderContext,
	warnings: string[],
	warnOnMissing: boolean
): unknown {
	const [ns, ...rest] = path.split('.');
	const fieldPath = rest.join('.');

	if (ns === 'profile') {
		if (context.preserveProfile) {
			// Return undefined so resolveTokens leaves the token verbatim for AJO.
			return undefined;
		}
		// Try direct key lookup first (handles flat objects like {'person.name.firstName': 'Sarah'})
		// then fall back to deep traversal (handles nested objects).
		const direct = context.profile[fieldPath];
		if (direct !== undefined) return direct;
		return getValueAtPath(context.profile, fieldPath);
	}

	if (ns === 'static') {
		const value = getValueAtPath(context.static, fieldPath);
		if (value === undefined && warnOnMissing) {
			warnings.push(`Unresolved static token: {{static.${fieldPath}}}`);
		}
		return value;
	}

	if (ns === 'cf') {
		const value = getValueAtPath(context.cf, fieldPath);
		if (value === undefined && warnOnMissing) {
			warnings.push(`Unresolved CF token: {{cf.${fieldPath}}}`);
		}
		return value;
	}

	// Unknown namespace — leave as-is
	return undefined;
}

function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
	if (!path) return undefined;
	return path.split('.').reduce<unknown>((current, key) => {
		if (current !== null && typeof current === 'object') {
			return (current as Record<string, unknown>)[key];
		}
		return undefined;
	}, obj);
}
