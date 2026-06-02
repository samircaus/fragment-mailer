// GET /preview/:campaignId?personaId=...&templateId=...
// Serves the preview HTML for iframe embedding and Universal Editor attachment.
// Returns the full HTML document with UE attributes injected.
//
// CORS: must allow * so the editor page (same origin) and UE overlay (different origin) can load it.

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { loadTemplateForCampaign } from '$lib/templates/load-for-campaign.js';
import { resolve } from '$lib/render/resolve.js';
import { compileMJML } from '$lib/render/mjml.js';
import {
	collectCFOutputBindings,
	injectUEAttributes,
	injectUEBody,
	injectUEHead,
	instrumentCFOutputTokens
} from '$lib/render/inject-ue.js';
import { buildUEBindings } from '$lib/render/ue-bindings.js';
import { validate, type ValidationWarning } from '$lib/render/validate.js';
import { flattenPersona, resolvePreviewPersona } from '$lib/personas/validate.js';
import { getPersonaById } from '$lib/personas/service.js';
import { applyPreviewColorScheme } from '$lib/preview/color-scheme-preview.js';
import {
	formatEnvelopeHtmlComment,
	resolveEmailEnvelope
} from '$lib/preview/envelope.js';
import { applyPreviewFragments } from '$lib/fragments/preview.js';
import { getCampaignWithCF } from '$lib/campaigns/service.js';
import { aemAssetBaseUrl } from '$lib/aem/env.js';
import { buildRenderCfContext } from '$lib/render/cf-context.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

export const GET: RequestHandler = async ({ params, url, platform }) => {
	const env = resolveAppEnv(platform?.env);

	const { campaignId } = params;
	const personaId = url.searchParams.get('personaId') ?? 'persona-1';
	const personaJson = url.searchParams.get('persona');
	const colorSchemeParam = url.searchParams.get('colorScheme')?.trim().toLowerCase();
	const previewColorScheme = colorSchemeParam === 'dark' ? 'dark' : 'light';

	const campaignResult = await getCampaignWithCF(campaignId, env);
	if (campaignResult.error || !campaignResult.data) {
		const message = campaignResult.error ?? 'Campaign not found';
		const status = message.includes('not found') ? 404 : 502;
		throw error(status, message);
	}

	const { campaign, cf } = campaignResult.data;
	const templateId = url.searchParams.get('templateId') ?? campaign.templateId ?? 'promo';

	const templateResult = await loadTemplateForCampaign(
		platform,
		templateId,
		cf.modelPath,
		env
	);
	if (templateResult.error) {
		throw error(404, templateResult.error);
	}
	const { definition, mjml } = templateResult.data!;
	const campaignIdEncoded = encodeURIComponent(campaignId);

	const cfContext = buildRenderCfContext(cf.fields, aemAssetBaseUrl(env));

	// Build render context
	const persona = personaJson
		? resolvePreviewPersona(personaId, personaJson)
		: await getPersonaById(platform, personaId);
	const flatProfile = flattenPersona(persona);

	const context = {
		cf: cfContext,
		profile: flatProfile,
		preserveProfile: false,
		static: { year: new Date().getFullYear() }
	};

	const mjmlWithFragments = await applyPreviewFragments(mjml, env);

	// Instrument {{cf.*}} output tokens first, then resolve values.
	const instrumentedMJML = instrumentCFOutputTokens(mjmlWithFragments);
	const discoveredBindings = collectCFOutputBindings(mjmlWithFragments);

	const envelope = resolveEmailEnvelope({
		mjml: mjmlWithFragments,
		context,
		templateName: definition.name
	});

	// Resolve tokens
	const { html: resolvedMJML, warnings: resolveWarnings } = resolve(instrumentedMJML, context);

	// Compile MJML → HTML
	const compileResult = await compileMJML(resolvedMJML);
	if (!compileResult.html) {
		throw error(
			500,
			`MJML compilation failed: ${compileResult.errors.map((e) => e.message).join('; ')}`
		);
	}

	const bindings = buildUEBindings({
		definition,
		discoveredBindings,
		defaultCfPath: cf.path,
		cfFields: cf.fields,
		mjml: mjmlWithFragments
	});
	let html = injectUEAttributes(compileResult.html, bindings);
	html = injectUEBody(html, cf.path);
	html = injectUEHead(
		html,
		env?.AEM_BASE_URL ?? 'https://author-p00000-e00000.adobeaemcloud.com',
		url.toString(),
		{
			componentDefinitionUrl: `/api/templates/${encodeURIComponent(templateId)}/component-definition?campaignId=${campaignIdEncoded}`,
			componentModelsUrl: `/api/templates/${encodeURIComponent(templateId)}/component-models?campaignId=${campaignIdEncoded}`
		}
	);

	// Run validation and inject warning markers as HTML comments
	const fieldTypes: Record<string, string> = {};
	for (const [id, def] of Object.entries(definition.fields)) fieldTypes[id] = def.type;
	const validationWarnings = validate(cf.fields, fieldTypes, html);
	const allWarnings = [
		...resolveWarnings,
		...validationWarnings.map(formatValidationWarning)
	];

	const htmlComments = [formatEnvelopeHtmlComment(envelope)];
	if (allWarnings.length > 0) {
		htmlComments.push(
			...allWarnings.map((w) => `<!-- FRAGMENT_MAILER_WARNING: ${w} -->`)
		);
	}
	html = html.replace('</body>', `\n${htmlComments.join('\n')}\n</body>`);

	html = applyPreviewColorScheme(html, previewColorScheme);

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'no-store',
			// UE reads this to identify the AEM resource root
			'X-AEM-CF-Path': cf.path
		}
	});
};


function formatValidationWarning(w: ValidationWarning): string {
	if (w.fieldPath.startsWith('cf.')) {
		const fieldName = w.fieldPath.slice(3);
		return `Content field “${fieldName}”: ${w.message} ${w.suggestion}`;
	}
	if (w.fieldPath.startsWith('html/')) {
		return `Rendered output: ${w.message} ${w.suggestion}`;
	}
	return `${w.message} ${w.suggestion}`;
}

