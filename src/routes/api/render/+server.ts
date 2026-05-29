// POST /api/render
// Full render pipeline: fetch CF → resolve tokens → compile MJML → inject UE attributes.
// Returns rendered HTML.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

import { fetchCF, normalizeCF } from '$lib/aem/client.js';
import { aemClientOptions } from '$lib/aem/env.js';
import type { CFFragment } from '$lib/aem/types.js';
import { loadTemplate } from '$lib/templates/service.js';
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
import { resolveBrand } from '$lib/brands/service.js';
import { buildStaticContext } from '$lib/preview/static-context.js';

// Zod v4: z.record() requires both key and value schemas.
const RenderRequestSchema = z.object({
	campaignId: z.string(),
	templateId: z.string(),
	cfPath: z.string(),
	mode: z.enum(['preview', 'export']),
	personaId: z.string().optional(),
	brandId: z.string().optional(),
	brandName: z.string().optional()
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

	const { templateId, cfPath, mode, personaId, brandId, brandName } = parsed.data;

	// Load template
	const templateResult = await loadTemplate(platform, templateId);
	if (templateResult.error) {
		throw error(404, templateResult.error);
	}
	const { definition, mjml } = templateResult.data!;

	// Fetch CF
	const cfResult = await fetchCF(cfPath, aemOpts);
	if (cfResult.error) {
		throw error(502, cfResult.error);
	}
	const cf = normalizeCF(cfResult.data as CFFragment);

	// Build render context
	const persona = await getPersonaById(platform, personaId ?? 'persona-1');
	const brand = await resolveBrand(platform, { brandId, brandName });
	const profileData = flattenPersona(persona);

	const context = {
		cf: buildCFContext(cf.fields, aemOpts.baseUrl),
		profile: profileData,
		preserveProfile: mode === 'export',
		static: buildStaticContext(brand)
	};

	// Instrument {{cf.*}} output tokens so UE can map editable spans.
	const instrumentedMJML = instrumentCFOutputTokens(mjml);
	const discoveredBindings = collectCFOutputBindings(mjml);

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

function buildCFContext(
	fields: Record<string, unknown>,
	assetBaseUrl?: string
): Record<string, unknown> {
	const context: Record<string, unknown> = { ...fields };
	const imageUrl = context.bannerImageUrl;
	if (typeof imageUrl === 'string' && imageUrl.startsWith('/') && assetBaseUrl) {
		context.bannerImageUrl = `${assetBaseUrl.replace(/\/$/, '')}${imageUrl}`;
	}
	return context;
}

