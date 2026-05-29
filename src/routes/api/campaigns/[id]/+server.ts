// GET /api/campaigns/:id
// Returns campaign metadata + resolved CF content.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCampaignWithCF } from '$lib/campaigns/service.js';
import { resolveAppEnv } from '$lib/server/app-env.js';
import { getDb, getEmailStatus, statusScopeFromEnv } from '$lib/db/email-status.js';
import { rowToEmailStatusInfo } from '$lib/db/email-status-types.js';

export const GET: RequestHandler = async ({ params, platform }) => {
	const { id } = params;
	const appEnv = resolveAppEnv(platform?.env);
	const result = await getCampaignWithCF(id, appEnv);

	if (result.error || !result.data) {
		const message = result.error ?? 'Campaign not found';
		const status = message.includes('not found') ? 404 : 502;
		throw error(status, message);
	}

	const { campaign, cf } = result.data;
	const aemUpdatedAt = cf.version !== 'unknown' ? cf.version : new Date().toISOString();
	const scope = statusScopeFromEnv(platform?.env ?? appEnv);
	const statusRow = campaign.cfUuid
		? await getEmailStatus(getDb(platform), scope, campaign.cfUuid)
		: null;
	const emailStatus = rowToEmailStatusInfo(statusRow, aemUpdatedAt);

	return json({
		campaign: { ...campaign, status: emailStatus.syncStatus, emailStatus },
		cf
	});
};
