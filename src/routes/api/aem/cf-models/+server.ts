// GET /api/aem/cf-models — list AEM Author CF models scoped to campaigns folder conf

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	confRootFromDamFolder,
	filterModelsForCampaignsFolder
} from '$lib/aem/cf-model-scope.js';
import { listAuthorModels } from '$lib/aem/author.js';
import { aemClientOptions, authorHostUrl, campaignsFolder } from '$lib/aem/env.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

export const GET: RequestHandler = async ({ platform }) => {
	const env = resolveAppEnv(platform?.env);
	const authorBase = authorHostUrl(env);
	if (!authorBase) {
		throw error(
			503,
			'AEM Author is not configured. Set AEM_TIER=author or AEM_AUTHOR_HOST.'
		);
	}

	const campaignsPath = campaignsFolder(env);
	const confRoot = confRootFromDamFolder(campaignsPath);

	const result = await listAuthorModels(
		aemClientOptions({ ...env, AEM_BASE_URL: authorBase }),
		env
	);
	if (result.error) throw error(502, result.error);

	const allModels = result.data ?? [];
	const models = filterModelsForCampaignsFolder(allModels, campaignsPath);

	return json({
		models,
		scope: {
			campaignsPath,
			confRoot,
			total: allModels.length,
			filtered: models.length
		},
		authorUrl: authorBase
	});
};
