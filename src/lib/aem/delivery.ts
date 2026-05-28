// Routes AEM campaign fetch by tier (author vs publish) and AEM_FETCH_MODE on publish.

import {
	fetchAuthorFragmentById,
	fetchAuthorFragmentByPath,
	listAuthorFragments
} from './author.js';
import {
	fetchCF,
	fetchCFById,
	listContentFragments,
	type AEMClientOptions
} from './client.js';
import {
	aemClientOptions,
	aemFetchMode,
	aemTier,
	campaignsFolder,
	graphqlConfig,
	type AppEnv
} from './env.js';
import { fetchCampaignByPathGraphQL, listCampaignsGraphQL } from './graphql.js';
import type { CFFragment, ContentFragmentItem } from './types.js';

type Result<T> = { data: T; error?: never } | { error: string; data?: never };

export async function listCampaignFragments(
	env?: AppEnv
): Promise<Result<ContentFragmentItem[]>> {
	const opts = aemClientOptions(env);
	if (opts.mockMode) {
		return listContentFragments(campaignsFolder(env), opts);
	}

	if (aemTier(env) === 'author') {
		return listAuthorFragments(campaignsFolder(env), opts, env);
	}

	if (aemFetchMode(env) === 'graphql') {
		const gql = graphqlConfig(env);
		const result = await listCampaignsGraphQL(opts, gql);
		if (result.error || !result.data) return result;

		const folder = campaignsFolder(env);
		const filtered = result.data.filter((item) => {
			const path = item.path ?? item._path ?? '';
			return path.startsWith(folder);
		});
		return { data: filtered };
	}

	return listContentFragments(campaignsFolder(env), opts);
}

export async function fetchCampaignFragmentAtPath(
	path: string,
	env?: AppEnv
): Promise<Result<CFFragment>> {
	const opts = aemClientOptions(env);
	if (opts.mockMode) {
		return fetchCF(path, opts);
	}

	if (aemTier(env) === 'author') {
		return fetchAuthorFragmentByPath(path, opts, env);
	}

	if (aemFetchMode(env) === 'graphql') {
		return fetchCampaignByPathGraphQL(path, opts, graphqlConfig(env));
	}

	return fetchCF(path, opts);
}

/** OpenAPI only — fetch by fragment UUID with reference hydration. */
export async function fetchCampaignFragmentById(
	id: string,
	env?: AppEnv
): Promise<Result<CFFragment>> {
	const opts = aemClientOptions(env);
	if (opts.mockMode) {
		return fetchCFById(id, opts);
	}

	if (aemTier(env) === 'author') {
		return fetchAuthorFragmentById(id, opts, env);
	}

	if (aemFetchMode(env) === 'graphql') {
		return {
			error:
				'GraphQL fetch mode does not support fragment UUID lookup. Use DAM path slug or full path as campaign id.'
		};
	}

	return fetchCFById(id, opts);
}
