// GET /api/campaigns/:id/content-model — AEM CF model + insertable fields for this email

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCampaignContentModel } from '$lib/campaigns/service.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

export const GET: RequestHandler = async ({ params, platform }) => {
	const result = await getCampaignContentModel(params.id, resolveAppEnv(platform?.env));
	if (result.error || !result.data) {
		const message = result.error ?? 'Campaign not found';
		throw error(message.includes('not found') ? 404 : 502, message);
	}
	return json(result.data);
};
