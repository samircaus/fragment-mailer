// GET /api/campaigns
// Lists email campaign content fragments from AEM.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listCampaigns } from '$lib/campaigns/service.js';
import { aemFetchMode, aemTier } from '$lib/aem/env.js';
import { resolveAppEnv } from '$lib/server/app-env.js';
import {
	getDb,
	listEmailStatusForCfUuids,
	statusScopeFromEnv
} from '$lib/db/email-status.js';
import { attachEmailStatusToSummaries } from '$lib/db/attach-email-status.js';

export const GET: RequestHandler = async ({ platform }) => {
	const appEnv = resolveAppEnv(platform?.env);
	const result = await listCampaigns(appEnv);

	if (result.error || !result.data) {
		console.error(
			JSON.stringify({
				event: 'api_campaigns_failed',
				error: result.error ?? 'unknown error',
				tier: aemTier(appEnv),
				fetchMode: aemFetchMode(appEnv),
				baseUrl: appEnv?.AEM_BASE_URL ?? '[missing AEM_BASE_URL]',
				campaignsPath: appEnv?.AEM_CAMPAIGNS_PATH ?? '[default]'
			})
		);
		throw error(502, result.error ?? 'Failed to list campaigns');
	}

	const scope = statusScopeFromEnv(platform?.env ?? appEnv);
	const cfUuids = result.data.map((c) => c.cfUuid).filter((id): id is string => Boolean(id));
	const statusByCfUuid = await listEmailStatusForCfUuids(getDb(platform), scope, cfUuids);
	const campaigns = attachEmailStatusToSummaries(result.data, statusByCfUuid);

	return json({
		campaigns,
		tier: aemTier(appEnv),
		fetchMode: aemFetchMode(appEnv)
	});
};
