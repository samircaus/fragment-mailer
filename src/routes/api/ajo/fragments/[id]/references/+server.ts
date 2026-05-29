// GET /api/ajo/fragments/:id/references — campaigns/templates using this fragment

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFragmentReferences } from '$lib/ajo/fragments-client.js';
import { isAjoConfigured } from '$lib/auth/ajo-token-provider.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

export const GET: RequestHandler = async ({ params, platform }) => {
	const env = resolveAppEnv(platform?.env);
	if (!isAjoConfigured(env)) {
		throw error(503, 'AJO credentials not configured');
	}

	const result = await getFragmentReferences(params.id, env);
	if (result.error) {
		if (result.status === 404) {
			return json({ count: 0, items: [] });
		}
		const status = result.status && result.status >= 400 ? result.status : 502;
		throw error(status, result.error);
	}

	return json(result.data ?? { count: 0, items: [] });
};
