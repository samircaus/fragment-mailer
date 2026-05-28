// GET /api/campaigns
// Lists email campaign content fragments from AEM (or mock fixtures).

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listCampaigns } from '$lib/campaigns/service.js';
import { aemFetchMode, aemTier, isMockMode } from '$lib/aem/env.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

export const GET: RequestHandler = async ({ platform }) => {
	const appEnv = resolveAppEnv(platform?.env);
	const result = await listCampaigns(appEnv);

	if (result.error || !result.data) {
		console.error(
			JSON.stringify({
				event: 'api_campaigns_failed',
				error: result.error ?? 'unknown error',
				mockMode: isMockMode(appEnv),
				tier: aemTier(appEnv),
				fetchMode: aemFetchMode(appEnv),
				baseUrl: appEnv?.AEM_BASE_URL ?? '[missing AEM_BASE_URL]',
				campaignsPath: appEnv?.AEM_CAMPAIGNS_PATH ?? '[default]'
			})
		);
		throw error(502, result.error ?? 'Failed to list campaigns');
	}

	return json({
		campaigns: result.data,
		mockMode: isMockMode(appEnv),
		tier: aemTier(appEnv),
		fetchMode: aemFetchMode(appEnv)
	});
};
