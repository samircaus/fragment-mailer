// GET /api/ajo/fragments — list AJO content fragments

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listFragments } from '$lib/ajo/fragments-client.js';
import { isAjoConfigured } from '$lib/auth/ajo-token-provider.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

export const GET: RequestHandler = async ({ url, platform }) => {
	const env = resolveAppEnv(platform?.env);
	if (!isAjoConfigured(env)) {
		throw error(503, 'AJO credentials not configured');
	}

	const typeParam = url.searchParams.get('type');
	const type = typeParam === 'html' || typeParam === 'expression' ? typeParam : undefined;

	const result = await listFragments(env, { type, limit: 100 });
	if (result.error) {
		const status = result.status && result.status >= 400 ? result.status : 502;
		throw error(status, result.error);
	}

	return json({ fragments: result.data?.items ?? [] });
};
