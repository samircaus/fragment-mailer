// Merge Cloudflare bindings with SvelteKit private env (.env / vite) for local dev.

import { env as privateEnv } from '$env/dynamic/private';
import type { AppEnv } from '$lib/aem/env.js';

function pick(key: keyof AppEnv, platform?: AppEnv): string | undefined {
	return platform?.[key] ?? (privateEnv as Record<string, string | undefined>)[key];
}

export function resolveAppEnv(platform?: AppEnv): AppEnv | undefined {
	const merged: AppEnv = {
		AEM_TIER: pick('AEM_TIER', platform),
		AEM_BASE_URL: pick('AEM_BASE_URL', platform),
		AEM_API_KEY: pick('AEM_API_KEY', platform),
		AEM_CAMPAIGNS_PATH: pick('AEM_CAMPAIGNS_PATH', platform),
		AEM_FETCH_MODE: pick('AEM_FETCH_MODE', platform),
		AEM_GRAPHQL_ENDPOINT: pick('AEM_GRAPHQL_ENDPOINT', platform),
		AEM_GRAPHQL_LIST_QUERY: pick('AEM_GRAPHQL_LIST_QUERY', platform),
		AEM_GRAPHQL_BY_PATH_QUERY: pick('AEM_GRAPHQL_BY_PATH_QUERY', platform),
		AEM_GRAPHQL_BY_PATH_PARAM: pick('AEM_GRAPHQL_BY_PATH_PARAM', platform),
		OAUTH_CONFIG_PATH: pick('OAUTH_CONFIG_PATH', platform),
		IMS_CLIENT_ID: pick('IMS_CLIENT_ID', platform),
		IMS_CLIENT_SECRET: pick('IMS_CLIENT_SECRET', platform),
		IMS_ORG_ID: pick('IMS_ORG_ID', platform),
		IMS_HOST: pick('IMS_HOST', platform),
		IMS_SCOPES: pick('IMS_SCOPES', platform),
		AEM_AUTHOR_HOST: pick('AEM_AUTHOR_HOST', platform),
		AEM_PUBLISH_HOST: pick('AEM_PUBLISH_HOST', platform),
		AEM_CF_EDITOR_TENANT: pick('AEM_CF_EDITOR_TENANT', platform),
		AJO_SANDBOX: pick('AJO_SANDBOX', platform),
		AJO_SANDBOX_NAME: pick('AJO_SANDBOX_NAME', platform),
		AJO_IMS_CLIENT_ID: pick('AJO_IMS_CLIENT_ID', platform),
		AJO_IMS_CLIENT_SECRET: pick('AJO_IMS_CLIENT_SECRET', platform),
		AJO_IMS_SCOPES: pick('AJO_IMS_SCOPES', platform),
		APP_AUTH_SECRET: pick('APP_AUTH_SECRET', platform),
		CF_ACCESS_TEAM_DOMAIN: pick('CF_ACCESS_TEAM_DOMAIN', platform),
		CF_ACCESS_AUD: pick('CF_ACCESS_AUD', platform)
	};

	const hasValue = Object.values(merged).some((v) => v !== undefined && v !== '');
	return hasValue ? merged : platform;
}
