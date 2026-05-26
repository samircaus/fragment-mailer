// GET /api/campaigns/:id
// Returns campaign metadata + resolved CF content.
// In mock mode, reads from tests/fixtures/.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchCF, normalizeCF } from '$lib/aem/client.js';
import type { CFFragment } from '$lib/aem/types.js';

interface Campaign {
	id: string;
	name: string;
	templateId: string;
	cfPath: string;
	status: string;
	createdAt: string;
	updatedAt: string;
}

export const GET: RequestHandler = async ({ params, platform }) => {
	const { id } = params;
	const env = platform?.env;
	const mockMode = env?.MOCK_MODE === 'true' || !env;

	// Load campaign metadata
	let campaign: Campaign;
	if (mockMode) {
		campaign = await loadMockCampaign(id);
	} else {
		// TODO(implementation): Store campaigns in D1 (v1). For v0, campaigns are derived from
		// a known set of CF paths configured via env or a static campaigns.json in the Worker.
		campaign = await loadMockCampaign(id); // fall back to mock for now
	}

	if (!campaign) {
		throw error(404, `Campaign "${id}" not found`);
	}

	// Fetch CF content
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

async function loadMockCampaign(id: string): Promise<Campaign> {
	const mod = await import('../../../../../tests/fixtures/sample-campaigns.json', {
		with: { type: 'json' }
	});
	const campaigns = mod.default as Record<string, Campaign>;
	return campaigns[id] ?? campaigns['mock-campaign-1'];
}
