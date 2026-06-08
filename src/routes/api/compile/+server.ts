// POST /api/compile
// Compiles editor MJML to HTML with the same token resolution as preview (no UE injection).

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

import { getCampaignWithCF } from '$lib/campaigns/service.js';
import { loadTemplate } from '$lib/templates/service.js';
import { aemAssetBaseUrl } from '$lib/aem/env.js';
import { buildRenderCfContext } from '$lib/render/cf-context.js';
import { resolve } from '$lib/render/resolve.js';
import { compileMJML } from '$lib/render/mjml.js';
import { instrumentCFOutputTokens } from '$lib/render/inject-ue.js';
import { flattenPersona, resolvePreviewPersona } from '$lib/personas/validate.js';
import { applyPreviewFragments } from '$lib/fragments/preview.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

const CompileRequestSchema = z.object({
	mjml: z.string(),
	campaignId: z.string(),
	templateId: z.string(),
	personaId: z.string().optional(),
	persona: z.unknown().optional(),
	/** AEM cq:lastModified — skips refetch when it matches the server cache. */
	cfVersion: z.string().optional()
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

	const { mjml, campaignId, templateId, personaId, persona, cfVersion } = parsed.data;

	const campaignResult = await getCampaignWithCF(campaignId, env, { cfVersion });
	if (campaignResult.error || !campaignResult.data) {
		const message = campaignResult.error ?? 'Campaign not found';
		const status = message.includes('not found') ? 404 : 502;
		throw error(status, message);
	}

	const templateResult = await loadTemplate(platform, templateId);
	if (templateResult.error) {
		throw error(404, templateResult.error);
	}
	const { cf } = campaignResult.data;
	const cfContext = buildRenderCfContext(cf.fields, aemAssetBaseUrl(env));

	const resolvedPersona = resolvePreviewPersona(
		personaId ?? 'persona-1',
		persona != null && typeof persona === 'object' ? JSON.stringify(persona) : null
	);

	const context = {
		cf: cfContext,
		profile: flattenPersona(resolvedPersona),
		preserveProfile: false,
		static: { year: new Date().getFullYear() }
	};

	const mjmlWithFragments = await applyPreviewFragments(mjml, env);
	const instrumentedMJML = instrumentCFOutputTokens(mjmlWithFragments);
	const { html: resolvedMJML, warnings } = resolve(instrumentedMJML, context);

	const compileResult = await compileMJML(resolvedMJML);
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

