import type { AppEnv } from '$lib/aem/env.js';
import { applyPreviewFragments } from '$lib/fragments/preview.js';
import {
	resolveTemplateSourceFormat as resolveFormat,
	type TemplateSourceFormat
} from '$lib/templates/source-format.js';
import type { TemplateDefinition } from '$lib/templates/types.js';
import { compileMJML, type CompileOptions } from './mjml.js';
import { instrumentCFOutputTokens } from './inject-ue.js';
import { resolve, type RenderContext } from './resolve.js';

export interface RenderTemplateOptions {
	sourceFormat?: TemplateSourceFormat;
	definition?: TemplateDefinition;
	applyFragments?: boolean;
	instrumentUe?: boolean;
	env?: AppEnv;
	compile?: CompileOptions;
}

export interface RenderTemplateResult {
	html: string | null;
	warnings: string[];
	errors: Array<{ message: string }>;
}

export { resolveTemplateSourceFormat } from '$lib/templates/source-format.js';

export async function renderTemplateSource(
	source: string,
	context: RenderContext,
	opts: RenderTemplateOptions = {}
): Promise<RenderTemplateResult> {
	const format = resolveFormat(source, opts);
	const shouldApplyFragments = opts.applyFragments !== false && Boolean(opts.env);
	const template = shouldApplyFragments
		? await applyPreviewFragments(source, opts.env!)
		: source;

	const prepared = opts.instrumentUe ? instrumentCFOutputTokens(template, format) : template;
	const { html: resolved, warnings } = resolve(prepared, context);

	if (format === 'html') {
		return { html: resolved, warnings, errors: [] };
	}

	const compileResult = await compileMJML(resolved, opts.compile);
	return {
		html: compileResult.html,
		warnings,
		errors: compileResult.errors
	};
}
