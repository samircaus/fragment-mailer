// POST /api/render
// Full render pipeline: fetch CF → resolve tokens → compile MJML → inject UE attributes.
// Returns rendered HTML.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

import { fetchCF, normalizeCF } from '$lib/aem/client.js';
import { aemClientOptions } from '$lib/aem/env.js';
import type { CFFragment } from '$lib/aem/types.js';
import { loadTemplate } from '$lib/templates/registry.js';
import type { TemplateEntry } from '$lib/templates/registry.js';
import { resolve } from '$lib/render/resolve.js';
import { compileMJML } from '$lib/render/mjml.js';
import { injectUEAttributes } from '$lib/render/inject-ue.js';
import { getPersona, flattenPersona } from '$lib/personas/samples.js';

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

	// Load template
	const templateResult = loadTemplate(templateId);
	if (templateResult.error) {
		throw error(404, templateResult.error);
	}
	const { definition, mjml } = templateResult.data as TemplateEntry;

	// Fetch CF
	const cfResult = await fetchCF(cfPath, aemOpts);
	if (cfResult.error) {
		throw error(502, cfResult.error);
	}
	const cf = normalizeCF(cfResult.data as CFFragment);

	// Build render context
	const persona = getPersona(personaId ?? 'persona-1');
	const profileData = flattenPersona(persona);

	const context = {
		cf: cf.fields,
		profile: profileData,
		preserveProfile: mode === 'export',
		static: buildStaticContext()
	};

	// Resolve tokens
	const { html: resolvedMJML, warnings } = resolve(mjml, context);

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
		const bindings = Object.entries(definition.fields).map(([fieldId, fieldDef]) => ({
			fieldPath: fieldDef.binding,
			cfPath: cf.path,
			fieldName: fieldId,
			fieldType: fieldDef.type as 'text' | 'richtext' | 'url' | 'reference'
		}));
		finalHtml = injectUEAttributes(finalHtml, bindings);
	}

	return json({
		html: finalHtml,
		warnings,
		cfVersion: cf.version,
		renderedAt: new Date().toISOString()
	});
};

function buildStaticContext(): Record<string, unknown> {
	return {
		year: new Date().getFullYear(),
		companyName: 'Acme Corp',
		logoUrl: 'https://via.placeholder.com/120x40?text=Logo',
		unsubscribeUrl: '{{static.unsubscribeUrl}}',
		privacyUrl: 'https://example.com/privacy'
	};
}
