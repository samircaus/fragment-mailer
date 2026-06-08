// GET/PUT /api/campaigns/:id/template-preference — persisted MJML template for a campaign

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getCampaignTemplatePref, setCampaignTemplatePref } from '$lib/db/campaign-template-prefs.js';
import { getDb, statusScopeFromEnv } from '$lib/db/email-status.js';
import { resolveAppEnv } from '$lib/server/app-env.js';
import { loadTemplate } from '$lib/templates/service.js';

export const GET: RequestHandler = async ({ params, platform }) => {
	const scope = statusScopeFromEnv(resolveAppEnv(platform?.env));
	const db = getDb(platform);
	const templateId = await getCampaignTemplatePref(db, scope, params.id);
	return json({ templateId });
};

const PutSchema = z.object({
	templateId: z.string().min(1)
});

export const PUT: RequestHandler = async ({ params, request, platform }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = PutSchema.safeParse(body);
	if (!parsed.success) throw error(400, `Invalid: ${parsed.error.message}`);

	const templateResult = await loadTemplate(platform, parsed.data.templateId);
	if (templateResult.error || !templateResult.data) {
		throw error(404, templateResult.error ?? 'Template not found');
	}

	const scope = statusScopeFromEnv(resolveAppEnv(platform?.env));
	const db = getDb(platform);
	await setCampaignTemplatePref(db, scope, params.id, parsed.data.templateId);

	return json({ ok: true, templateId: parsed.data.templateId });
};
