// GET /preview/:campaignId?personaId=...&templateId=...
// Serves the preview HTML for iframe embedding and Universal Editor attachment.
// Returns the full HTML document with UE attributes injected.
//
// CORS: must allow * so the editor page (same origin) and UE overlay (different origin) can load it.

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { loadTemplate } from '$lib/templates/registry.js';
import type { TemplateEntry, TemplateDefinition } from '$lib/templates/registry.js';
import { resolve } from '$lib/render/resolve.js';
import { compileMJML } from '$lib/render/mjml.js';
import {
	collectCFOutputBindings,
	injectUEAttributes,
	injectUEBody,
	injectUEHead,
	instrumentCFOutputTokens
} from '$lib/render/inject-ue.js';
import { validate } from '$lib/render/validate.js';
import { flattenPersona, resolvePreviewPersona } from '$lib/personas/samples.js';
import { getCampaignWithCF } from '$lib/campaigns/service.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

export const GET: RequestHandler = async ({ params, url, platform }) => {
	const env = resolveAppEnv(platform?.env);

	const { campaignId } = params;
	const personaId = url.searchParams.get('personaId') ?? 'persona-1';
	const personaJson = url.searchParams.get('persona');
	const companyName = normalizeCompanyName(url.searchParams.get('companyName'));

	const campaignResult = await getCampaignWithCF(campaignId, env);
	if (campaignResult.error || !campaignResult.data) {
		const message = campaignResult.error ?? 'Campaign not found';
		const status = message.includes('not found') ? 404 : 502;
		throw error(status, message);
	}

	const { campaign, cf } = campaignResult.data;
	const templateId = url.searchParams.get('templateId') ?? campaign.templateId ?? 'promo';

	// Load template
	const templateResult = loadTemplate(templateId);
	if (templateResult.error) {
		throw error(404, templateResult.error);
	}
	const { definition, mjml } = templateResult.data as TemplateEntry;

	// Resolve referenced CFs (for the featured offer block, etc.)
	const cfContext = buildCFContext(cf.fields, definition, env?.AEM_BASE_URL);

	// Build render context
	const persona = resolvePreviewPersona(personaId, personaJson);
	const flatProfile = flattenPersona(persona);

	const context = {
		cf: cfContext,
		profile: flatProfile,
		preserveProfile: false, // preview mode: resolve profile tokens from persona
		static: buildStaticContext(companyName)
	};

	// Instrument {{cf.*}} output tokens first, then resolve values.
	const instrumentedMJML = instrumentCFOutputTokens(mjml);
	const discoveredBindings = collectCFOutputBindings(mjml);

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

	// Inject UE attributes onto each CF-bound span
	const bindings = Object.entries(definition.fields).map(([fieldId, fieldDef]) => ({
		fieldPath: fieldDef.binding,
		cfPath: resolveBindingCFPath(fieldDef.binding, cf.path, cf.fields),
		fieldName: fieldId,
		fieldType: fieldDef.type as 'text' | 'richtext' | 'url' | 'reference',
		modelId: fieldDef.modelId
	}));
	const knownBindings = new Set(bindings.map((binding) => binding.fieldPath));
	for (const fieldPath of discoveredBindings) {
		if (knownBindings.has(fieldPath)) continue;
		bindings.push({
			fieldPath,
			cfPath: resolveBindingCFPath(fieldPath, cf.path, cf.fields),
			fieldName: bindingFieldName(fieldPath),
			fieldType: inferBindingFieldType(fieldPath, definition),
			modelId: undefined
		});
	}
	let html = injectUEAttributes(compileResult.html, bindings);
	html = injectUEBody(html, cf.path);
	html = injectUEHead(
		html,
		env?.AEM_BASE_URL ?? 'https://author-p00000-e00000.adobeaemcloud.com',
		url.toString()
	);

	// Run validation and inject warning markers as HTML comments
	const fieldTypes: Record<string, string> = {};
	for (const [id, def] of Object.entries(definition.fields)) fieldTypes[id] = def.type;
	const validationWarnings = validate(cf.fields, fieldTypes, html);
	const allWarnings = [...resolveWarnings, ...validationWarnings.map((w) => w.message)];

	if (allWarnings.length > 0) {
		const warningBlock = allWarnings
			.map((w) => `<!-- FRAGMENT_MAILER_WARNING: ${w} -->`)
			.join('\n');
		html = html.replace('</body>', `\n${warningBlock}\n</body>`);
	}

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


// Merge referenced CF objects into the top-level cf context so the resolver
// can traverse {{cf.featuredOffer.headline}} correctly.
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

function normalizeCompanyName(raw: string | null): string {
	const trimmed = raw?.trim();
	return trimmed ? trimmed.slice(0, 120) : 'Acme Corp';
}

function bindingFieldName(fieldPath: string): string {
	const parts = fieldPath.split('.');
	return parts[parts.length - 1] ?? fieldPath;
}

function inferBindingFieldType(
	fieldPath: string,
	definition: TemplateDefinition
): 'text' | 'richtext' | 'url' | 'reference' {
	const parts = fieldPath.split('.');
	const rootField = parts[1];
	const fieldDef = rootField ? definition.fields[rootField] : undefined;
	if (parts.length === 2 && fieldDef) return fieldDef.type;
	return parts.length === 2 ? 'text' : 'text';
}

function resolveBindingCFPath(
	fieldPath: string,
	defaultPath: string,
	fields: Record<string, unknown>
): string {
	const parts = fieldPath.split('.');
	const rootField = parts[1];
	if (!rootField || parts.length < 3) return defaultPath;
	const rootValue = fields[rootField];
	if (rootValue && typeof rootValue === 'object') {
		const refPath = (rootValue as Record<string, unknown>)._path;
		if (typeof refPath === 'string' && refPath) return refPath;
	}
	return defaultPath;
}
