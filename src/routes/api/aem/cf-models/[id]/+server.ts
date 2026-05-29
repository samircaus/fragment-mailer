// GET /api/aem/cf-models/:id — AEM Author CF model (Sites CF Management API)

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveAuthorModel } from '$lib/aem/author.js';
import { aemClientOptions, authorHostUrl } from '$lib/aem/env.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

export const GET: RequestHandler = async ({ params, platform }) => {
	const env = resolveAppEnv(platform?.env);
	const authorBase = authorHostUrl(env);
	if (!authorBase) {
		throw error(
			503,
			'AEM Author is not configured. Set AEM_TIER=author or AEM_AUTHOR_HOST for CF model import.'
		);
	}

	const result = await resolveAuthorModel(
		params.id,
		aemClientOptions({ ...env, AEM_BASE_URL: authorBase }),
		env
	);
	if (result.error) {
		const status = result.error.includes('401') || result.error.includes('403') ? 502 : 404;
		throw error(status, result.error);
	}

	return json({ model: result.data });
};
