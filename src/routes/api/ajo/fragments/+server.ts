// GET /api/ajo/fragments — list AJO content fragments
// ?source=local  returns only locally-tracked fragments (from DB)
// ?type=expression|html  filters by type (AJO API only)

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listFragments } from '$lib/ajo/fragments-client.js';
import { isAjoConfigured } from '$lib/auth/ajo-token-provider.js';
import { resolveAppEnv } from '$lib/server/app-env.js';
import { listAjoFragments } from '$lib/db/ajo-fragments.js';
import { getDb } from '$lib/db/email-status.js';

export const GET: RequestHandler = async ({ url, platform }) => {
	if (url.searchParams.get('source') === 'local') {
		const db = getDb(platform);
		const fragments = await listAjoFragments(db);
		return json({ fragments });
	}

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
