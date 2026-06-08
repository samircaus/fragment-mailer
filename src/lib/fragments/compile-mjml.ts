import type { AppEnv } from '$lib/aem/env.js';
import { applyPreviewFragments } from '$lib/fragments/preview.js';
import {
	isMjmlFragmentSource,
	wrapFragmentHtmlForPreview,
	wrapFragmentMjmlForCompile
} from '$lib/mjml/fragment-mjml.js';
import { wrapAjoControlTagsForMjml } from '$lib/render/ajo-export.js';
import { compileMJML } from '$lib/render/mjml.js';
import { resolve } from '$lib/render/resolve.js';
import { flattenPersona, resolvePreviewPersona } from '$lib/personas/validate.js';

function previewContext(personaId = 'persona-1', personaJson: string | null = null) {
	const resolvedPersona = resolvePreviewPersona(personaId, personaJson);
	return {
		cf: {},
		profile: flattenPersona(resolvedPersona),
		preserveProfile: false,
		static: { year: new Date().getFullYear() }
	};
}

async function compileFragmentExpressionToHtml(
	expression: string,
	env: AppEnv,
	personaId = 'persona-1',
	personaJson: string | null = null
): Promise<{ html: string } | { error: string }> {
	const context = previewContext(personaId, personaJson);
	const mjmlWithFragments = await applyPreviewFragments(expression, env);
	const { html: resolved } = resolve(mjmlWithFragments, context);
	return { html: wrapFragmentHtmlForPreview(resolved) };
}

export async function compileFragmentMjmlToHtml(
	mjml: string,
	env: AppEnv,
	opts?: { personaId?: string; personaJson?: string | null }
): Promise<{ html: string } | { error: string }> {
	if (!isMjmlFragmentSource(mjml)) {
		return compileFragmentExpressionToHtml(
			mjml,
			env,
			opts?.personaId,
			opts?.personaJson ?? null
		);
	}

	const context = previewContext(opts?.personaId, opts?.personaJson ?? null);
	const mjmlWithFragments = await applyPreviewFragments(mjml, env);
	const { html: resolvedMJML } = resolve(mjmlWithFragments, context);
	const compileResult = await compileMJML(
		wrapAjoControlTagsForMjml(wrapFragmentMjmlForCompile(resolvedMJML)),
		{ beautify: true }
	);

	if (!compileResult.html) {
		const details =
			compileResult.errors?.map((e) => e.message).join('; ') ?? 'MJML compile failed';
		return { error: details };
	}

	return { html: compileResult.html };
}
