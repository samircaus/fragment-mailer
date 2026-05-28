// POST /api/compile
// Compiles editor MJML to HTML with the same token resolution as preview (no UE injection).

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

import { getCampaignWithCF } from '$lib/campaigns/service.js';
import { loadTemplate } from '$lib/templates/registry.js';
import type { TemplateDefinition, TemplateEntry } from '$lib/templates/registry.js';
import { resolve } from '$lib/render/resolve.js';
import { compileMJML } from '$lib/render/mjml.js';
import { instrumentCFOutputTokens } from '$lib/render/inject-ue.js';
import { flattenPersona, resolvePreviewPersona } from '$lib/personas/samples.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

const CompileRequestSchema = z.object({
	mjml: z.string(),
	campaignId: z.string(),
	templateId: z.string(),
	personaId: z.string().optional(),
	companyName: z.string().optional(),
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

	const { mjml, campaignId, templateId, personaId, companyName, persona } = parsed.data;

	const campaignResult = await getCampaignWithCF(campaignId, env);
	if (campaignResult.error || !campaignResult.data) {
		const message = campaignResult.error ?? 'Campaign not found';
		const status = message.includes('not found') ? 404 : 502;
		throw error(status, message);
	}

	const templateResult = loadTemplate(templateId);
	if (templateResult.error) {
		throw error(404, templateResult.error);
	}
	const { definition } = templateResult.data as TemplateEntry;

	const { cf } = campaignResult.data;
	const cfContext = buildCFContext(cf.fields, definition, env?.AEM_BASE_URL);

	const personaJson =
		persona != null && typeof persona === 'object' ? JSON.stringify(persona) : null;
	const resolvedPersona = resolvePreviewPersona(personaId ?? 'persona-1', personaJson);

	const context = {
		cf: cfContext,
		profile: flattenPersona(resolvedPersona),
		preserveProfile: false,
		static: buildStaticContext(normalizeCompanyName(companyName))
	};

	const instrumentedMJML = instrumentCFOutputTokens(mjml);
	const { html: resolvedMJML, warnings } = resolve(instrumentedMJML, context);

	const compileResult = await compileMJML(resolvedMJML, { beautify: true });
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

function buildCFContext(
	fields: Record<string, unknown>,
	definition: TemplateDefinition,
	assetBaseUrl?: string
): Record<string, unknown> {
	const context: Record<string, unknown> = { ...fields };

	for (const [fieldName, fieldDef] of Object.entries(definition.fields)) {
		if (fieldDef.type !== 'reference') continue;
		const refValue = fields[fieldName];
		if (refValue && typeof refValue === 'object') {
			context[fieldName] = refValue;
		}
	}

	const imageUrl = context.bannerImageUrl;
	if (typeof imageUrl === 'string' && imageUrl.startsWith('/') && assetBaseUrl) {
		context.bannerImageUrl = `${assetBaseUrl.replace(/\/$/, '')}${imageUrl}`;
	}

	return context;
}

function buildStaticContext(companyName: string): Record<string, unknown> {
	return {
		year: new Date().getFullYear(),
		companyName,
		logoUrl: 'https://via.placeholder.com/120x40?text=Logo',
		unsubscribeUrl: '{{static.unsubscribeUrl}}',
		privacyUrl: 'https://example.com/privacy'
	};
}

function normalizeCompanyName(raw?: string): string {
	const trimmed = raw?.trim();
	return trimmed ? trimmed.slice(0, 120) : 'Acme Corp';
}
