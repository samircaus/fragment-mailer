// GET /preview/standalone/:templateId — iframe preview for AJO content templates (no AEM CF)

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadTemplate } from '$lib/templates/service.js';
import { applyPreviewFragments } from '$lib/fragments/preview.js';
import { renderTemplateSource } from '$lib/render/compile-template.js';
import { flattenPersona, resolvePreviewPersona } from '$lib/personas/validate.js';
import { getPersonaById } from '$lib/personas/service.js';
import { applyPreviewColorScheme } from '$lib/preview/color-scheme-preview.js';
import {
	formatEnvelopeHtmlComment,
	resolveEmailEnvelope
} from '$lib/preview/envelope.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

export const GET: RequestHandler = async ({ params, url, platform }) => {
	const env = resolveAppEnv(platform?.env);
	const { templateId } = params;
	const previewTemplateId = url.searchParams.get('templateId') ?? templateId;
	const personaId = url.searchParams.get('personaId') ?? 'persona-1';
	const personaJson = url.searchParams.get('persona');
	const colorSchemeParam = url.searchParams.get('colorScheme')?.trim().toLowerCase();
	const previewColorScheme = colorSchemeParam === 'dark' ? 'dark' : 'light';

	const templateResult = await loadTemplate(platform, previewTemplateId);
	if (templateResult.error || !templateResult.data) {
		throw error(404, templateResult.error ?? 'Template not found');
	}

	const { definition, mjml } = templateResult.data;
	const persona = personaJson
		? resolvePreviewPersona(personaId, personaJson)
		: await getPersonaById(platform, personaId);
	const flatProfile = flattenPersona(persona);

	const context = {
		cf: {},
		profile: flatProfile,
		preserveProfile: false,
		static: { year: new Date().getFullYear() }
	};

	const mjmlWithFragments = await applyPreviewFragments(mjml, env);
	const envelope = resolveEmailEnvelope({
		mjml: mjmlWithFragments,
		context,
		templateName: definition.name,
		definition
	});

	const renderResult = await renderTemplateSource(mjmlWithFragments, context, {
		definition,
		applyFragments: false,
		env
	});
	const resolveWarnings = renderResult.warnings;

	if (!renderResult.html) {
		const details = renderResult.errors.map((e) => e.message).join('; ');
		throw error(500, `Template render failed: ${details}`);
	}

	let html = renderResult.html;
	const htmlComments = [formatEnvelopeHtmlComment(envelope)];
	if (resolveWarnings.length > 0) {
		htmlComments.push(
			...resolveWarnings.map((w) => `<!-- FRAGMENT_MAILER_WARNING: ${w} -->`)
		);
	}
	html = html.replace('</body>', `\n${htmlComments.join('\n')}\n</body>`);
	html = applyPreviewColorScheme(html, previewColorScheme);

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'no-store'
		}
	});
};
