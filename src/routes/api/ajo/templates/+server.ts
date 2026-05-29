// GET /api/ajo/templates — list AJO content templates

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listContentTemplates } from '$lib/ajo/client.js';
import { isAjoConfigured } from '$lib/auth/ajo-token-provider.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

export const GET: RequestHandler = async ({ platform }) => {
	const env = resolveAppEnv(platform?.env);
	if (!isAjoConfigured(env)) {
		throw error(503, 'AJO credentials not configured');
	}

	const result = await listContentTemplates(env, { channel: 'email', limit: 100 });
	if (result.error) {
		const status = result.status && result.status >= 400 ? result.status : 502;
		throw error(status, result.error);
	}

	return json({ templates: result.data?.items ?? [] });
};
