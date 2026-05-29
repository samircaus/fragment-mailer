// AJO export: transform {% load %} → {% let fragment(...) %}, validate, push or return HTML.
//
// GET  — transform + validate; returns HTML for copy/download (no AJO push).
// POST — same transform; optional push to AJO Content Templates API.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { ajoSandboxName, type AppEnv } from '$lib/aem/env.js';
import { getCampaignWithCF } from '$lib/campaigns/service.js';
import { loadTemplate } from '$lib/templates/service.js';
import { resolveAppEnv } from '$lib/server/app-env.js';
import { transformTemplateForAjo } from '$lib/ajo/export-pipeline.js';
import { createContentTemplate, updateContentTemplate } from '$lib/ajo/client.js';
import {
	getDb,
	getRemoteTemplateId,
	recordPushFailure,
	statusScopeFromEnv,
	upsertPushSuccess
} from '$lib/db/email-status.js';
import { isAjoConfigured } from '$lib/auth/ajo-token-provider.js';
import { fetchAuthorFragmentRawById, fetchAuthorFragmentRawByPath } from '$lib/aem/author.js';
import { aemClientOptions, authorHostUrl } from '$lib/aem/env.js';

export const GET: RequestHandler = async ({ url, platform }) => {
	const env = resolveAppEnv(platform?.env) as AppEnv | undefined;
	return runAjoExport(url, env, { push: false }, platform);
};

export const POST: RequestHandler = async ({ url, request, platform }) => {
	const env = resolveAppEnv(platform?.env) as AppEnv | undefined;
	let body: Record<string, unknown> = {};
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		// allow push flag via query only
	}
	const push = body.push === true || url.searchParams.get('push') === 'true';
	const templateName =
		(typeof body.templateName === 'string' && body.templateName) ||
		url.searchParams.get('templateName') ||
		undefined;
	const ajoTemplateId =
		(typeof body.ajoTemplateId === 'string' && body.ajoTemplateId) ||
		url.searchParams.get('ajoTemplateId') ||
		undefined;

	const mjml = typeof body.mjml === 'string' ? body.mjml : undefined;

	return runAjoExport(url, env, { push, templateName, ajoTemplateId, mjml }, platform);
};

interface ExportOptions {
	push: boolean;
	templateName?: string;
	ajoTemplateId?: string;
	mjml?: string;
}

async function runAjoExport(
	url: URL,
	env: AppEnv | undefined,
	opts: ExportOptions,
	platform?: App.Platform
) {
	const campaignId = url.searchParams.get('campaignId');
	if (!campaignId) {
		throw error(400, 'campaignId query parameter is required');
	}

	const campaignResult = await getCampaignWithCF(campaignId, env);
	if (campaignResult.error || !campaignResult.data) {
		const message = campaignResult.error ?? 'Campaign not found';
		const status = message.includes('not found') ? 404 : 502;
		throw error(status, message);
	}

	const { campaign } = campaignResult.data;
	const templateResult = await loadTemplate(platform, campaign.templateId);
	if (templateResult.error || !templateResult.data) {
		throw error(404, templateResult.error ?? 'Template not found');
	}

	const imsOrgId = env?.IMS_ORG_ID?.trim() ?? '';
	const sandbox = ajoSandboxName(env);

	const campaignFragment = await loadAuthorCampaign(campaignId, campaign.cfPath, env);

	const mjmlFromBody = opts.mjml?.trim();
	const mjml = mjmlFromBody && mjmlFromBody.length > 0 ? mjmlFromBody : templateResult.data.mjml;

	const transform = await transformTemplateForAjo({
		mjml,
		campaignId,
		campaignFragment: campaignFragment ?? undefined,
		templateDefinition: templateResult.data.definition,
		env,
		imsOrgId,
		ajoSandboxName: sandbox
	});

	const validationOk = transform.validationErrors.length === 0;

	if (!validationOk) {
		return json(
			{
				ok: false,
				html: transform.html,
				repoId: transform.repoId,
				loadTags: transform.loadTags,
				validationErrors: transform.validationErrors
			},
			{ status: 422 }
		);
	}

	if (!opts.push) {
		const disposition = url.searchParams.get('format') === 'html' ? 'attachment' : undefined;
		const headers: Record<string, string> = {};
		if (disposition) {
			headers['Content-Disposition'] = `attachment; filename="${campaignId}-ajo.html"`;
			headers['Content-Type'] = 'text/html; charset=utf-8';
			return new Response(transform.html, { headers });
		}

		return json({
			ok: true,
			html: transform.html,
			repoId: transform.repoId,
			loadTags: transform.loadTags,
			injectedLoadTags: transform.injectedLoadTags,
			ajoConfigured: isAjoConfigured(env)
		});
	}

	if (!isAjoConfigured(env)) {
		return json(
			{
				ok: false,
				message:
					'AJO credentials not configured. Set AJO_IMS_CLIENT_ID and AJO_IMS_CLIENT_SECRET (or reuse IMS_CLIENT_ID / IMS_CLIENT_SECRET), or use GET without push for HTML copy.',
				html: transform.html,
				repoId: transform.repoId
			},
			{ status: 503 }
		);
	}

	const name = opts.templateName ?? campaign.name ?? campaignId;
	const db = getDb(platform);
	const scope = statusScopeFromEnv(env);
	const existingId =
		opts.ajoTemplateId ??
		(await getRemoteTemplateId(db, scope, campaign.cfUuid, campaignId));

	const payload = {
		name,
		channel: 'email' as const,
		contentType: 'text/html' as const,
		body: transform.html
	};

	const pushResult = existingId
		? await updateContentTemplate(existingId, payload, env as AppEnv)
		: await createContentTemplate(payload, env as AppEnv);

	const aemModifiedAt =
		campaignResult.data.cf.version !== 'unknown'
			? campaignResult.data.cf.version
			: new Date().toISOString();

	if (pushResult.error) {
		console.error(
			JSON.stringify({
				event: 'ajo_export_push_failed',
				timestamp: new Date().toISOString(),
				campaignId,
				cfUuid: campaign.cfUuid,
				scope,
				templateName: name,
				existingRemoteTemplateId: existingId,
				message: pushResult.error,
				...(pushResult.failure ?? {})
			})
		);
		if (campaign.cfUuid) {
			await recordPushFailure(db, {
				cfUuid: campaign.cfUuid,
				campaignId,
				scope,
				error: pushResult.error,
				remoteTemplateId: existingId,
				aemModifiedAt
			});
		}
		const status = pushResult.status && pushResult.status >= 400 ? pushResult.status : 502;
		return json(
			{
				ok: false,
				message: pushResult.error,
				failure: pushResult.failure,
				html: transform.html,
				repoId: transform.repoId
			},
			{ status }
		);
	}

	const templateId = pushResult.data?.id;
	if (templateId && campaign.cfUuid) {
		await upsertPushSuccess(db, {
			cfUuid: campaign.cfUuid,
			campaignId,
			scope,
			remoteTemplateId: templateId,
			aemModifiedAt,
			content: transform.html
		});
	}

	return json({
		ok: true,
		templateId,
		status: pushResult.data?.status,
		html: transform.html,
		repoId: transform.repoId
	});
}

async function loadAuthorCampaign(campaignId: string, cfPath: string, env?: AppEnv) {
	const authorBase = authorHostUrl(env);
	if (!authorBase) return null;

	const opts = { ...aemClientOptions(env), baseUrl: authorBase };
	const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

	if (UUID_RE.test(campaignId)) {
		const r = await fetchAuthorFragmentRawById(campaignId, opts, env);
		return r.data ?? null;
	}

	const r = await fetchAuthorFragmentRawByPath(cfPath, opts, env);
	return r.data ?? null;
}
