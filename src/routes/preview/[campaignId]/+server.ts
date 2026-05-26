// GET /preview/:campaignId?personaId=...&templateId=...
// Serves the preview HTML for iframe embedding and Universal Editor attachment.
// Returns the full HTML document with UE attributes injected.
//
// CORS: must allow * so the editor page (same origin) and UE overlay (different origin) can load it.

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { fetchCF, normalizeCF } from '$lib/aem/client.js';
import type { CFFragment } from '$lib/aem/types.js';
import { loadTemplate } from '$lib/templates/registry.js';
import type { TemplateEntry, TemplateDefinition } from '$lib/templates/registry.js';
import { resolve } from '$lib/render/resolve.js';
import { compileMJML } from '$lib/render/mjml.js';
import { injectUEAttributes, injectUEBody, injectUEHead } from '$lib/render/inject-ue.js';
import { validate } from '$lib/render/validate.js';
import { getPersona, flattenPersona } from '$lib/personas/samples.js';

export const GET: RequestHandler = async ({ params, url, platform }) => {
	const env = platform?.env;
	const mockMode = env?.MOCK_MODE === 'true' || !env;

	const { campaignId } = params;
	const personaId = url.searchParams.get('personaId') ?? 'persona-1';
	const templateId = url.searchParams.get('templateId') ?? 'promo';

	// Load template
	const templateResult = loadTemplate(templateId);
	if (templateResult.error) {
		throw error(404, templateResult.error);
	}
	const { definition, mjml } = templateResult.data as TemplateEntry;

	// Load campaign to get CF path
	const campaign = await loadCampaign(campaignId);
	if (!campaign) {
		throw error(404, `Campaign "${campaignId}" not found`);
	}

	// Fetch CF
	const cfResult = await fetchCF(campaign.cfPath, {
		baseUrl: env?.AEM_BASE_URL ?? '',
		apiKey: env?.AEM_API_KEY,
		mockMode
	});
	if (cfResult.error) {
		throw error(502, cfResult.error);
	}
	const cf = normalizeCF(cfResult.data as CFFragment);

	// Resolve referenced CFs (for the featured offer block, etc.)
	const cfContext = buildCFContext(cf.fields, definition);

	// Build render context
	const persona = getPersona(personaId);
	const flatProfile = flattenPersona(persona);

	const context = {
		cf: cfContext,
		profile: flatProfile,
		preserveProfile: false, // preview mode: resolve profile tokens from persona
		static: buildStaticContext()
	};

	// Resolve tokens
	const { html: resolvedMJML, warnings: resolveWarnings } = resolve(mjml, context);

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
		cfPath: cf.path,
		fieldName: fieldId,
		fieldType: fieldDef.type as 'text' | 'richtext' | 'url' | 'reference'
	}));
	let html = injectUEAttributes(compileResult.html, bindings);
	html = injectUEBody(html, cf.path, 'email-cf');
	html = injectUEHead(html, env?.AEM_BASE_URL ?? 'https://author-p00000-e00000.adobeaemcloud.com');

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

interface Campaign {
	id: string;
	templateId: string;
	cfPath: string;
}

async function loadCampaign(id: string): Promise<Campaign | null> {
	const mod = await import('../../../../tests/fixtures/sample-campaigns.json', {
		with: { type: 'json' }
	});
	const campaigns = mod.default as Record<string, Campaign>;
	return campaigns[id] ?? null;
}

// Merge referenced CF objects into the top-level cf context so the resolver
// can traverse {{cf.featuredOffer.headline}} correctly.
function buildCFContext(
	fields: Record<string, unknown>,
	definition: TemplateDefinition
): Record<string, unknown> {
	const context: Record<string, unknown> = { ...fields };

	for (const [fieldName, fieldDef] of Object.entries(definition.fields)) {
		if (fieldDef.type !== 'reference') continue;
		const refValue = fields[fieldName];
		if (refValue && typeof refValue === 'object') {
			context[fieldName] = refValue;
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
