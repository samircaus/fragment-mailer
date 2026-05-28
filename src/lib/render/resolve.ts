// AJO-flavored Liquid-ish resolver.
// Supported syntax:
//   {{ expression }}
//   {% if cond %}...{% else %}...{% endif %}
//   {% let varName = expression %}
//   {{ expression | default: 'fallback' }}
//
// Backward compatibility:
//   {{#if ...}} ... {{else}} ... {{/if}}

export interface RenderContext {
	cf: Record<string, unknown>;
	profile: Record<string, unknown>;
	static: Record<string, unknown>;
	// When true, profile.* expressions are preserved verbatim.
	preserveProfile: boolean;
}

type ResolveResult = { html: string; warnings: string[] };

interface EvalState {
	context: RenderContext;
	warnings: string[];
	vars: Record<string, unknown>;
}

export function resolve(template: string, context: RenderContext): ResolveResult {
	const state: EvalState = {
		context,
		warnings: [],
		vars: {}
	};

	const normalizedTemplate = normalizeLegacyConditionals(template);
	const html = renderBlock(normalizedTemplate, state);
	return { html, warnings: state.warnings };
}

function normalizeLegacyConditionals(template: string): string {
	return template
		.replace(/\{\{#if\s+([^}]+)\}\}/g, '{% if $1 %}')
		.replace(/\{\{else\}\}/g, '{% else %}')
		.replace(/\{\{\/if\}\}/g, '{% endif %}');
}

function renderBlock(input: string, state: EvalState): string {
	const withoutLets = applyLetStatements(input, state);
	const withConditionals = resolveIfBlocks(withoutLets, state);
	return resolveOutputTokens(withConditionals, state);
}

function applyLetStatements(input: string, state: EvalState): string {
	const LET_RE = /\{%\s*let\s+([A-Za-z_]\w*)\s*=\s*([\s\S]*?)\s*%\}/g;
	return input.replace(LET_RE, (_full, varName: string, rawExpr: string) => {
		const { value } = evaluateExpression(rawExpr.trim(), state);
		state.vars[varName] = value;
		return '';
	});
}

function resolveIfBlocks(input: string, state: EvalState): string {
	let output = '';
	let cursor = 0;

	for (;;) {
		const start = input.indexOf('{% if', cursor);
		if (start === -1) {
			output += input.slice(cursor);
			break;
		}

		output += input.slice(cursor, start);

		const openEnd = input.indexOf('%}', start);
		if (openEnd === -1) {
			output += input.slice(start);
			break;
		}

		const condExpr = input.slice(start + 5, openEnd).trim();
		const { closeStart, closeEnd, elseStart, elseEnd } = findIfBlockBounds(input, openEnd + 2);
		if (closeStart === -1 || closeEnd === -1) {
			output += input.slice(start);
			break;
		}

		const thenPart = input.slice(openEnd + 2, elseStart === -1 ? closeStart : elseStart);
		const elsePart = elseStart === -1 || elseEnd === -1 ? '' : input.slice(elseEnd, closeStart);
		const cond = evaluateCondition(condExpr, state);
		output += renderBlock(cond ? thenPart : elsePart, state);

		cursor = closeEnd;
	}

	return output;
}

function findIfBlockBounds(
	input: string,
	searchFrom: number
): { closeStart: number; closeEnd: number; elseStart: number; elseEnd: number } {
	let depth = 1;
	let cursor = searchFrom;
	let elseStart = -1;
	let elseEnd = -1;

	while (cursor < input.length) {
		const tagStart = input.indexOf('{%', cursor);
		if (tagStart === -1) break;
		const tagEnd = input.indexOf('%}', tagStart);
		if (tagEnd === -1) break;

		const tagBody = input.slice(tagStart + 2, tagEnd).trim();
		if (tagBody.startsWith('if ')) {
			depth += 1;
		} else if (tagBody === 'endif') {
			depth -= 1;
			if (depth === 0) {
				return { closeStart: tagStart, closeEnd: tagEnd + 2, elseStart, elseEnd };
			}
		} else if (tagBody === 'else' && depth === 1 && elseStart === -1) {
			elseStart = tagStart;
			elseEnd = tagEnd + 2;
		}

		cursor = tagEnd + 2;
	}

	return { closeStart: -1, closeEnd: -1, elseStart: -1, elseEnd: -1 };
}

function resolveOutputTokens(input: string, state: EvalState): string {
	const OUTPUT_RE = /\{\{\s*([\s\S]*?)\s*\}\}/g;
	return input.replace(OUTPUT_RE, (full, expr: string) => {
		const { value, preserve } = evaluateExpression(expr.trim(), state, true);
		if (preserve) return full;
		if (value === undefined) return full;
		if (value === null) return '';
		return String(value);
	});
}

function evaluateCondition(expr: string, state: EvalState): boolean {
	const { value } = evaluateExpression(expr, state);
	return value !== undefined && value !== null && value !== '' && value !== false;
}

function evaluateExpression(
	expr: string,
	state: EvalState,
	warnOnMissing = false
): { value: unknown; preserve: boolean } {
	const [baseRaw, ...filterParts] = expr.split('|').map((part) => part.trim());
	const baseResult = resolveTerm(baseRaw, state, warnOnMissing);
	if (baseResult.preserve) return baseResult;

	let value = baseResult.value;
	for (const filterPart of filterParts) {
		if (!filterPart) continue;
		value = applyFilter(value, filterPart, state);
	}

	return { value, preserve: false };
}

function resolveTerm(
	term: string,
	state: EvalState,
	warnOnMissing: boolean
): { value: unknown; preserve: boolean } {
	if (!term) return { value: undefined, preserve: false };

	if ((term.startsWith("'") && term.endsWith("'")) || (term.startsWith('"') && term.endsWith('"'))) {
		return { value: term.slice(1, -1), preserve: false };
	}
	if (term === 'true') return { value: true, preserve: false };
	if (term === 'false') return { value: false, preserve: false };
	if (term === 'null' || term === 'nil') return { value: null, preserve: false };
	if (/^-?\d+(\.\d+)?$/.test(term)) return { value: Number(term), preserve: false };

	if (term in state.vars) {
		return { value: state.vars[term], preserve: false };
	}

	const [ns, ...rest] = term.split('.');
	const fieldPath = rest.join('.');

	if (ns === 'profile') {
		if (state.context.preserveProfile) {
			return { value: undefined, preserve: true };
		}
		const direct = state.context.profile[fieldPath];
		return { value: direct !== undefined ? direct : getValueAtPath(state.context.profile, fieldPath), preserve: false };
	}

	if (ns === 'cf') {
		const value = getValueAtPath(state.context.cf, fieldPath);
		if (value === undefined && warnOnMissing) {
			state.warnings.push(`Unresolved CF token: {{${term}}}`);
		}
		return { value, preserve: false };
	}

	if (ns === 'static') {
		const value = getValueAtPath(state.context.static, fieldPath);
		if (value === undefined && warnOnMissing) {
			state.warnings.push(`Unresolved static token: {{${term}}}`);
		}
		return { value, preserve: false };
	}

	const fromContext = getValueAtPath(
		{
			...state.vars,
			...state.context.cf,
			profile: state.context.profile,
			static: state.context.static,
			cf: state.context.cf
		},
		term
	);
	return { value: fromContext, preserve: false };
}

function applyFilter(input: unknown, filterPart: string, state: EvalState): unknown {
	const [nameRaw, ...argRaw] = filterPart.split(':');
	const name = nameRaw.trim();
	const argText = argRaw.join(':').trim();

	if (name === 'default') {
		const fallbackExpr = argText || "''";
		const fallback = evaluateExpression(fallbackExpr, state).value;
		return input === undefined || input === null || input === '' ? fallback : input;
	}

	// Unknown filters are currently no-op.
	return input;
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
