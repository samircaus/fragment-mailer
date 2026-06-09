// GET /api/export?campaignId=...&personaId=...
// Returns { html, manifest } for AJO handoff.
// HTML has profile tokens preserved; manifest includes all binding metadata.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { normalizeCF } from '$lib/aem/client.js';
import { buildRenderCfContext } from '$lib/render/cf-context.js';
import { fetchCampaignFragmentAtPath } from '$lib/aem/delivery.js';
import { aemAssetBaseUrl, type AppEnv } from '$lib/aem/env.js';
import { resolveAppEnv } from '$lib/server/app-env.js';
import type { CFFragment, ResolvedCFData } from '$lib/aem/types.js';
import { loadTemplateForCampaign } from '$lib/templates/load-for-campaign.js';
import type { TemplateDefinition } from '$lib/templates/types.js';
import { renderTemplateSource } from '$lib/render/compile-template.js';
import { getTemplateSourceFormat } from '$lib/templates/source-format.js';
import { rewriteCfRefsForAjo, wrapAjoControlTagsForMjml } from '$lib/render/ajo-export.js';
import { flattenPersona } from '$lib/personas/validate.js';
import { getPersonaById } from '$lib/personas/service.js';
import { buildManifest } from '$lib/manifest/builder.js';
import { getCampaignWithCF } from '$lib/campaigns/service.js';
import { resolveCampaignTemplateId } from '$lib/campaigns/template-preference.js';

export const GET: RequestHandler = async ({ url, platform }) => {
	const env = resolveAppEnv(platform?.env) as AppEnv | undefined;

	const campaignId = url.searchParams.get('campaignId');
	const personaId = url.searchParams.get('personaId') ?? 'persona-1';
	const cfMode = parseCfMode(url.searchParams.get('cfMode'));

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
	const templateId = await resolveCampaignTemplateId(platform, campaignId, campaign.templateId, {
		queryTemplateId: url.searchParams.get('templateId')
	});

	const templateResult = await loadTemplateForCampaign(platform, templateId, primaryCF.modelPath, env);
	if (templateResult.error) {
		throw error(404, templateResult.error);
	}
	const { definition, mjml } = templateResult.data!;

	// Resolve referenced CFs (one level deep) — skipped when already hydrated via direct-hydrated
	const referencedCFs = await resolveReferencedCFs(primaryCF.fields, definition, env);

	// Build context — preserve profile tokens for AJO send-time resolution
	const persona = await getPersonaById(platform, personaId);
	const flatProfile = flattenPersona(persona);

	const context = {
		cf: buildCFContext(primaryCF.fields, referencedCFs, aemAssetBaseUrl(env)),
		profile: flatProfile,
		preserveProfile: true,
		static: { year: new Date().getFullYear() }
	};

	const sourceFormat = getTemplateSourceFormat(definition);
	let compiledHtml: string;

	if (cfMode === 'preserve-refs' && sourceFormat === 'mjml') {
		const mjmlForCompile = buildPreserveRefsMJML(mjml, primaryCF, context.cf);
		const renderResult = await renderTemplateSource(mjmlForCompile, context, {
			definition,
			sourceFormat: 'mjml',
			applyFragments: false,
			compile: { minify: false }
		});
		if (!renderResult.html) {
			const details = renderResult.errors.map((e) => e.message).join('; ');
			throw error(500, `Template render failed: ${details}`);
		}
		compiledHtml = renderResult.html;
	} else {
		const renderResult = await renderTemplateSource(mjml, context, {
			definition,
			sourceFormat,
			applyFragments: false,
			compile: { minify: false }
		});
		if (!renderResult.html) {
			const details = renderResult.errors.map((e) => e.message).join('; ');
			throw error(500, `Template render failed: ${details}`);
		}
		compiledHtml = renderResult.html;
	}

	// Build manifest
	const manifest = buildManifest({
		campaignId,
		template: definition,
		primaryCF,
		referencedCFs,
		personaId,
		renderedHtml: compiledHtml
	});

	return json(
		{ html: compiledHtml, manifest, cfMode },
		{
			headers: {
				'Content-Disposition': `attachment; filename="${campaignId}-export.json"`
			}
		}
	);
};

function parseCfMode(raw: string | null): 'preserve-refs' | 'baked-content' {
	return raw === 'baked-content' ? 'baked-content' : 'preserve-refs';
}

function buildPreserveRefsMJML(
	mjml: string,
	primaryCF: ResolvedCFData,
	cfFields: Record<string, unknown>
): string {
	const referenceFragmentIds: Record<string, string> = {};
	for (const [fieldName, value] of Object.entries(cfFields)) {
		if (value && typeof value === 'object') {
			const refPath = (value as { _path?: string })._path;
			if (typeof refPath === 'string' && refPath) {
				referenceFragmentIds[fieldName] = refPath;
			}
		}
	}

	const rewritten = rewriteCfRefsForAjo(mjml, {
		primaryFragmentId: primaryCF.path,
		referenceFragmentIds
	});
	return wrapAjoControlTagsForMjml(rewritten.mjml);
}


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
	referencedCFs: ResolvedCFData[],
	assetBaseUrl?: string
): Record<string, unknown> {
	const context = buildRenderCfContext(fields, assetBaseUrl);

	// Merge when hydration was incomplete (reference is path-only).
	for (const refCF of referencedCFs) {
		const refName = refCF.path.split('/').pop();
		if (refName && context[refName] && typeof context[refName] === 'object') {
			Object.assign(context[refName] as Record<string, unknown>, refCF.fields);
		}
	}

	return context;
}
