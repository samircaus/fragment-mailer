// POST /api/compile/standalone — compile source without AEM content fragments

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { applyPreviewFragments } from '$lib/fragments/preview.js';
import { wrapAjoControlTagsForMjml } from '$lib/render/ajo-export.js';
import { resolveTemplateSourceFormat } from '$lib/render/compile-template.js';
import { compileMJML } from '$lib/render/mjml.js';
import { resolve } from '$lib/render/resolve.js';
import {
	isMjmlFragmentSource,
	wrapFragmentHtmlForPreview,
	wrapFragmentMjmlForCompile
} from '$lib/mjml/fragment-mjml.js';
import { loadTemplate } from '$lib/templates/service.js';
import { flattenPersona, resolvePreviewPersona } from '$lib/personas/validate.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

const CompileRequestSchema = z.object({
	mjml: z.string(),
	templateId: z.string().optional(),
	personaId: z.string().optional(),
	persona: z.unknown().optional()
});

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = resolveAppEnv(platform?.env);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = CompileRequestSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, `Invalid request: ${parsed.error.message}`);
	}

	const { mjml, templateId, personaId, persona } = parsed.data;
	const resolvedPersona = resolvePreviewPersona(
		personaId ?? 'persona-1',
		persona != null && typeof persona === 'object' ? JSON.stringify(persona) : null
	);

	const context = {
		cf: {},
		profile: flattenPersona(resolvedPersona),
		preserveProfile: false,
		static: { year: new Date().getFullYear() }
	};

	const definition = templateId
		? (await loadTemplate(platform, templateId)).data?.definition
		: undefined;
	const sourceFormat = resolveTemplateSourceFormat(mjml, { definition });

	const templateWithFragments = await applyPreviewFragments(mjml, env);
	const { html: resolved, warnings } = resolve(templateWithFragments, context);

	if (sourceFormat === 'html' || !isMjmlFragmentSource(resolved)) {
		return json({
			html: wrapFragmentHtmlForPreview(resolved),
			warnings
		});
	}

	const compileResult = await compileMJML(
		wrapAjoControlTagsForMjml(wrapFragmentMjmlForCompile(resolved)),
		{ beautify: true }
	);

	if (!compileResult.html) {
		return json(
			{
				html: null,
				errors: compileResult.errors,
				warnings
			},
			{ status: 422 }
		);
	}

	return json({ html: compileResult.html, warnings });
};
