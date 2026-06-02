import type { AppEnv } from '$lib/aem/env.js';
import { applyPreviewFragments } from '$lib/fragments/preview.js';
import { wrapAjoControlTagsForMjml } from '$lib/render/ajo-export.js';
import { compileMJML } from '$lib/render/mjml.js';
import { resolve } from '$lib/render/resolve.js';
import { flattenPersona, resolvePreviewPersona } from '$lib/personas/validate.js';

export async function compileFragmentMjmlToHtml(
	mjml: string,
	env: AppEnv
): Promise<{ html: string } | { error: string }> {
	const resolvedPersona = resolvePreviewPersona('persona-1', null);
	const context = {
		cf: {},
		profile: flattenPersona(resolvedPersona),
		preserveProfile: false,
		static: { year: new Date().getFullYear() }
	};

	const mjmlWithFragments = await applyPreviewFragments(mjml, env);
	const { html: resolvedMJML } = resolve(mjmlWithFragments, context);
	const compileResult = await compileMJML(wrapAjoControlTagsForMjml(resolvedMJML), { beautify: true });

	if (!compileResult.html) {
		const details =
			compileResult.errors?.map((e) => e.message).join('; ') ?? 'MJML compile failed';
		return { error: details };
	}

	return { html: compileResult.html };
}
