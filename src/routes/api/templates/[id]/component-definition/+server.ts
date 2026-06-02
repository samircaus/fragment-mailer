// GET /api/templates/:id/component-definition — UE component groups for a template

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCampaignWithCF } from '$lib/campaigns/service.js';
import { resolveAppEnv } from '$lib/server/app-env.js';
import { loadTemplateForCampaign } from '$lib/templates/load-for-campaign.js';
import { loadTemplate } from '$lib/templates/service.js';

export const GET: RequestHandler = async ({ params, url, platform }) => {
	const env = resolveAppEnv(platform?.env);
	const campaignId = url.searchParams.get('campaignId')?.trim();

	if (campaignId) {
		const campaignResult = await getCampaignWithCF(campaignId, env);
		if (campaignResult.error || !campaignResult.data) {
			const message = campaignResult.error ?? 'Campaign not found';
			throw error(message.includes('not found') ? 404 : 502, message);
		}
		const { cf } = campaignResult.data;
		const result = await loadTemplateForCampaign(platform, params.id, cf.modelPath, env);
		if (result.error) throw error(404, result.error);
		return json(result.data?.componentDefinition ?? { groups: [] }, {
			headers: { 'Cache-Control': 'no-store' }
		});
	}

	const result = await loadTemplate(platform, params.id);
	if (result.error) throw error(404, result.error);

	const doc = result.data?.componentDefinition ?? { groups: [] };
	return json(doc, {
		headers: {
			'Cache-Control': 'no-store'
		}
	});
};
