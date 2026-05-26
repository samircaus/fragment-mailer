// GET /api/campaigns/:id
// Returns campaign metadata + resolved CF content.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchCF, normalizeCF } from '$lib/aem/client.js';
import type { CFFragment } from '$lib/aem/types.js';
import { loadCampaign } from '$lib/campaigns/registry.js';

export const GET: RequestHandler = async ({ params, platform }) => {
	const { id } = params;
	const env = platform?.env;
	const mockMode = env?.MOCK_MODE === 'true' || !env;

	// TODO(implementation): Store campaigns in D1 (v1). For v0, fall back to the in-process registry.
	const campaign = loadCampaign(id) ?? loadCampaign('mock-campaign-1');

	if (!campaign) {
		throw error(404, `Campaign "${id}" not found`);
	}

	const cfResult = await fetchCF(campaign.cfPath, {
		baseUrl: env?.AEM_BASE_URL ?? '',
		apiKey: env?.AEM_API_KEY,
		mockMode
	});

	if (cfResult.error) {
		throw error(502, `Failed to fetch CF: ${cfResult.error}`);
	}

	const cf = normalizeCF(cfResult.data as CFFragment);

	return json({ campaign, cf });
};
