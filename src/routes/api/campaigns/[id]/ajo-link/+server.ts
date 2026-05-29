// DELETE /api/campaigns/:id/ajo-link
// Clears stored AJO template link when the remote template was removed manually.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCampaignWithCF } from '$lib/campaigns/service.js';
import { resolveAppEnv } from '$lib/server/app-env.js';
import {
	clearRemoteTemplateLink,
	getDb,
	getEmailStatus,
	statusScopeFromEnv
} from '$lib/db/email-status.js';
import { rowToEmailStatusInfo } from '$lib/db/email-status-types.js';

export const DELETE: RequestHandler = async ({ params, platform }) => {
	const { id } = params;
	const appEnv = resolveAppEnv(platform?.env);
	const result = await getCampaignWithCF(id, appEnv);

	if (result.error || !result.data) {
		const message = result.error ?? 'Campaign not found';
		const status = message.includes('not found') ? 404 : 502;
		throw error(status, message);
	}

	const { campaign, cf } = result.data;
	if (!campaign.cfUuid) {
		throw error(400, 'Campaign has no content fragment UUID');
	}

	const scope = statusScopeFromEnv(platform?.env ?? appEnv);
	const db = getDb(platform);
	const cleared = await clearRemoteTemplateLink(db, scope, campaign.cfUuid);

	const aemUpdatedAt = cf.version !== 'unknown' ? cf.version : new Date().toISOString();
	const statusRow = await getEmailStatus(db, scope, campaign.cfUuid);
	const emailStatus = rowToEmailStatusInfo(statusRow, aemUpdatedAt);

	return json({
		ok: true,
		cleared,
		emailStatus,
		campaign: { ...campaign, status: emailStatus.syncStatus, emailStatus }
	});
};
