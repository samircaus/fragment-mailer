// GET /api/export?campaignId=...&personaId=...
// Returns { html, manifest } for AJO handoff.
// HTML has profile tokens preserved; manifest includes all binding metadata.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { normalizeCF } from '$lib/aem/client.js';
import { fetchCampaignFragmentAtPath } from '$lib/aem/delivery.js';
import type { AppEnv } from '$lib/aem/env.js';
import { resolveAppEnv } from '$lib/server/app-env.js';
import type { CFFragment, ResolvedCFData } from '$lib/aem/types.js';
import { loadTemplate } from '$lib/templates/registry.js';
import type { TemplateEntry, TemplateDefinition } from '$lib/templates/registry.js';
import { resolve } from '$lib/render/resolve.js';
import { compileMJML } from '$lib/render/mjml.js';
import { getPersona, flattenPersona } from '$lib/personas/samples.js';
import { buildManifest } from '$lib/manifest/builder.js';
import { getCampaignWithCF } from '$lib/campaigns/service.js';

export const GET: RequestHandler = async ({ url, platform }) => {
	const env = resolveAppEnv(platform?.env) as AppEnv | undefined;

	const campaignId = url.searchParams.get('campaignId');
	const personaId = url.searchParams.get('personaId') ?? 'persona-1';

	if (!campaignId) {
		throw error(400, 'campaignId query parameter is required');
	}

	const campaignResult = await getCampaignWithCF(campaignId, env);
	if (campaignResult.error || !campaignResult.data) {
		const message = campaignResult.error ?? 'Campaign not found';
		const status = message.includes('not found') ? 404 : 502;
		throw error(status, message);
	}

	const { campaign, cf: primaryCF } = campaignResult.data;

	// Load template
	const templateResult = loadTemplate(campaign.templateId);
	if (templateResult.error) {
		throw error(404, templateResult.error);
	}
	const { definition, mjml } = templateResult.data as TemplateEntry;

	// Resolve referenced CFs (one level deep) — skipped when already hydrated via direct-hydrated
	const referencedCFs = await resolveReferencedCFs(primaryCF.fields, definition, env);

	// Build context — preserve profile tokens for AJO send-time resolution
	const persona = getPersona(personaId);
	const flatProfile = flattenPersona(persona);

	const context = {
		cf: buildCFContext(primaryCF.fields, referencedCFs),
		profile: flatProfile,
		preserveProfile: true, // export mode: profile tokens pass through to AJO
		static: buildStaticContext()
	};

	// Resolve + compile
	const { html: resolvedMJML } = resolve(mjml, context);
	const compileResult = await compileMJML(resolvedMJML, { minify: false });
	if (!compileResult.html) {
		throw error(
			500,
			`MJML compilation failed: ${compileResult.errors.map((e) => e.message).join('; ')}`
		);
	}

	// Build manifest
	const manifest = buildManifest({
		campaignId,
		template: definition,
		primaryCF,
		referencedCFs,
		personaId,
		renderedHtml: compileResult.html
	});

	return json(
		{ html: compileResult.html, manifest },
		{
			headers: {
				'Content-Disposition': `attachment; filename="${campaignId}-export.json"`
			}
		}
	);
};


async function resolveReferencedCFs(
	fields: Record<string, unknown>,
	definition: TemplateDefinition,
	env?: AppEnv
): Promise<ResolvedCFData[]> {
	const results: ResolvedCFData[] = [];

	for (const [fieldName, fieldDef] of Object.entries(definition.fields)) {
		if (fieldDef.type !== 'reference') continue;
		const refValue = fields[fieldName];
		if (!refValue || typeof refValue !== 'object') continue;

		const refObj = refValue as { _path?: string };
		if (refObj._path) {
			const refResult = await fetchCampaignFragmentAtPath(refObj._path, env);
			if (!refResult.error && refResult.data) {
				results.push(normalizeCF(refResult.data));
			}
		}
	}

	return results;
}

function buildCFContext(
	fields: Record<string, unknown>,
	referencedCFs: ResolvedCFData[]
): Record<string, unknown> {
	const context: Record<string, unknown> = { ...fields };

	// Merge referenced CF fields so {{cf.featuredOffer.headline}} resolves correctly.
	// The referenced CF's field data is already embedded in the primary CF value object
	// (AEM embeds referenced fragment data inline in CF Delivery responses).
	for (const refCF of referencedCFs) {
		const refName = refCF.path.split('/').pop();
		if (refName && context[refName] && typeof context[refName] === 'object') {
			Object.assign(context[refName] as Record<string, unknown>, refCF.fields);
		}
	}

	return context;
}

function buildStaticContext(): Record<string, unknown> {
	return {
		year: new Date().getFullYear(),
		companyName: 'Acme Corp',
		logoUrl: 'https://via.placeholder.com/120x40?text=Logo',
		unsubscribeUrl: '{{static.unsubscribeUrl}}',
		privacyUrl: 'https://example.com/privacy'
	};
}
