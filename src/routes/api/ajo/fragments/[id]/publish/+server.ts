// POST /api/ajo/fragments/:id/publish — publish fragment

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { publishFragment } from '$lib/ajo/fragments-client.js';
import { isAjoConfigured } from '$lib/auth/ajo-token-provider.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

export const POST: RequestHandler = async ({ params, platform }) => {
	const env = resolveAppEnv(platform?.env);
	if (!isAjoConfigured(env)) {
		throw error(503, 'AJO credentials not configured');
	}

	const result = await publishFragment(params.id, env);
	if (result.error) {
		const status = result.status && result.status >= 400 ? result.status : 502;
		throw error(status, result.error);
	}

	return json({ ok: true, accepted: result.data?.accepted ?? true });
};
