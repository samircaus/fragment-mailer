// POST /api/export/ajo/standalone — compile MJML and optionally push to AJO (no AEM CF)

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { transformStandaloneMjmlForAjo } from '$lib/ajo/export-pipeline.js';
import { createContentTemplate, updateContentTemplate } from '$lib/ajo/client.js';
import { buildAjoEmailHtmlTemplatePayload } from '$lib/ajo/types.js';
import { loadTemplate } from '$lib/templates/service.js';
import { resolveAppEnv } from '$lib/server/app-env.js';
import { isAjoConfigured } from '$lib/auth/ajo-token-provider.js';
import {
	getDb,
	getRemoteTemplateId,
	recordPushFailure,
	standaloneTemplateCfUuid,
	statusScopeFromEnv,
	upsertPushSuccess
} from '$lib/db/email-status.js';
import type { AppEnv } from '$lib/aem/env.js';

const ExportRequestSchema = z.object({
	templateId: z.string().min(1),
	mjml: z.string().optional(),
	push: z.boolean().optional(),
	templateName: z.string().optional(),
	ajoTemplateId: z.string().optional()
});

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = resolveAppEnv(platform?.env) as AppEnv | undefined;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = ExportRequestSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, `Invalid request: ${parsed.error.message}`);
	}

	const { templateId, push = false, templateName, ajoTemplateId } = parsed.data;
	const templateResult = await loadTemplate(platform, templateId);
	if (templateResult.error || !templateResult.data) {
		throw error(404, templateResult.error ?? 'Template not found');
	}

	const mjmlFromBody = parsed.data.mjml?.trim();
	const mjml =
		mjmlFromBody && mjmlFromBody.length > 0 ? mjmlFromBody : templateResult.data.mjml;

	const transform = await transformStandaloneMjmlForAjo({ mjml, env });
	if (transform.validationErrors.length > 0) {
		return json(
			{
				ok: false,
				html: transform.html,
				validationErrors: transform.validationErrors
			},
			{ status: 422 }
		);
	}

	if (!push) {
		return json({
			ok: true,
			html: transform.html,
			ajoConfigured: isAjoConfigured(env)
		});
	}

	if (!isAjoConfigured(env)) {
		return json(
			{
				ok: false,
				message: 'AJO credentials not configured.',
				html: transform.html
			},
			{ status: 503 }
		);
	}

	const db = getDb(platform);
	const scope = statusScopeFromEnv(env);
	const cfUuid = standaloneTemplateCfUuid(templateId);
	const name = templateName ?? templateResult.data.definition.name ?? templateId;
	const existingId =
		ajoTemplateId ?? (await getRemoteTemplateId(db, scope, cfUuid, templateId));

	const payload = buildAjoEmailHtmlTemplatePayload({
		name,
		html: transform.html,
		description: `Standalone template ${templateId}`,
		origin: 'ajo'
	});

	const pushResult = existingId
		? await updateContentTemplate(existingId, payload, env)
		: await createContentTemplate(payload, env);

	const contentVersion = new Date().toISOString();

	if (pushResult.error) {
		await recordPushFailure(db, {
			cfUuid,
			campaignId: templateId,
			scope,
			error: pushResult.error,
			remoteTemplateId: existingId,
			aemModifiedAt: contentVersion
		});
		const status = pushResult.status && pushResult.status >= 400 ? pushResult.status : 502;
		return json(
			{
				ok: false,
				message: pushResult.error,
				failure: pushResult.failure,
				html: transform.html
			},
			{ status }
		);
	}

	const remoteTemplateId = pushResult.data?.id?.trim() ?? '';
	if (!remoteTemplateId) {
		return json(
			{
				ok: false,
				message: 'AJO accepted the push but did not return a template id.',
				html: transform.html
			},
			{ status: 502 }
		);
	}

	await upsertPushSuccess(db, {
		cfUuid,
		campaignId: templateId,
		scope,
		remoteTemplateId,
		aemModifiedAt: contentVersion,
		content: transform.html
	});

	return json({
		ok: true,
		templateId: remoteTemplateId,
		pushMethod: existingId ? 'update' : 'create',
		status: pushResult.data?.status,
		html: transform.html
	});
};
