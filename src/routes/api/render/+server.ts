// POST /api/render
// Full render pipeline: fetch CF → resolve tokens → compile MJML → inject UE attributes.
// Returns rendered HTML.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

import { fetchCF, normalizeCF } from '$lib/aem/client.js';
import { aemAssetBaseUrl, aemClientOptions } from '$lib/aem/env.js';
import type { CFFragment } from '$lib/aem/types.js';
import { loadTemplateForCampaign } from '$lib/templates/load-for-campaign.js';
import { buildRenderCfContext } from '$lib/render/cf-context.js';
import { resolve } from '$lib/render/resolve.js';
import { compileMJML } from '$lib/render/mjml.js';
import {
	collectCFOutputBindings,
	injectUEAttributes,
	injectUEBody,
	instrumentCFOutputTokens
} from '$lib/render/inject-ue.js';
import { buildUEBindings } from '$lib/render/ue-bindings.js';
import { flattenPersona } from '$lib/personas/validate.js';
import { getPersonaById } from '$lib/personas/service.js';
import { applyPreviewFragments } from '$lib/fragments/preview.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

// Zod v4: z.record() requires both key and value schemas.
const RenderRequestSchema = z.object({
	campaignId: z.string(),
	templateId: z.string(),
	cfPath: z.string(),
	mode: z.enum(['preview', 'export']),
	personaId: z.string().optional()
});

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	const aemOpts = aemClientOptions(env);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = RenderRequestSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, `Invalid request: ${parsed.error.message}`);
	}

	const { templateId, cfPath, mode, personaId } = parsed.data;
	const appEnv = resolveAppEnv(env);

	// Fetch CF
	const cfResult = await fetchCF(cfPath, aemOpts);
	if (cfResult.error) {
		throw error(502, cfResult.error);
	}
	const cf = normalizeCF(cfResult.data as CFFragment);

	const templateResult = await loadTemplateForCampaign(
		platform,
		templateId,
		cf.modelPath,
		appEnv
	);
	if (templateResult.error) {
		throw error(404, templateResult.error);
	}
	const { definition, mjml } = templateResult.data!;

	// Build render context
	const persona = await getPersonaById(platform, personaId ?? 'persona-1');
	const profileData = flattenPersona(persona);

	const context = {
		cf: buildRenderCfContext(cf.fields, aemAssetBaseUrl(appEnv)),
		profile: profileData,
		preserveProfile: mode === 'export',
		static: { year: new Date().getFullYear() }
	};

	const mjmlWithFragments =
		mode === 'preview' ? await applyPreviewFragments(mjml, appEnv) : mjml;

	// Instrument {{cf.*}} output tokens so UE can map editable spans.
	const instrumentedMJML = instrumentCFOutputTokens(mjmlWithFragments);
	const discoveredBindings = collectCFOutputBindings(mjmlWithFragments);

	// Resolve tokens
	const { html: resolvedMJML, warnings } = resolve(instrumentedMJML, context);

	// Compile MJML → HTML
	const compileResult = await compileMJML(resolvedMJML);
	if (!compileResult.html) {
		throw error(
			500,
			`MJML compilation failed: ${compileResult.errors.map((e) => e.message).join('; ')}`
		);
	}

	// Inject UE attributes (preview mode only)
	let finalHtml = compileResult.html;
	if (mode === 'preview') {
		const bindings = buildUEBindings({
			definition,
			discoveredBindings,
			defaultCfPath: cf.path,
			cfFields: cf.fields
		});
		finalHtml = injectUEAttributes(finalHtml, bindings);
		finalHtml = injectUEBody(finalHtml, cf.path);
	}

	return json({
		html: finalHtml,
		warnings,
		cfVersion: cf.version,
		renderedAt: new Date().toISOString()
	});
};


