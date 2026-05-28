// GET /api/campaigns/:id
// Returns campaign metadata + resolved CF content.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCampaignWithCF } from '$lib/campaigns/service.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

export const GET: RequestHandler = async ({ params, platform }) => {
	const { id } = params;
	const result = await getCampaignWithCF(id, resolveAppEnv(platform?.env));

	if (result.error || !result.data) {
		const message = result.error ?? 'Campaign not found';
		const status = message.includes('not found') ? 404 : 502;
		throw error(status, message);
	}

	return json({ campaign: result.data.campaign, cf: result.data.cf });
};
