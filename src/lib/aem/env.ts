import type { AEMClientOptions } from './client.js';

/** AEM instance: Author (Sites CF Management + OAuth) or Publish (Delivery / GraphQL). */
export type AemTier = 'author' | 'publish';

/** How to load CFs from AEM Publish when not in mock mode. */
export type AemFetchMode = 'openapi' | 'graphql';

/** Worker bindings + vars (see app.d.ts and .dev.vars). */
export interface AppEnv {
	MOCK_MODE?: string;
	/** author | publish — default publish */
	AEM_TIER?: string;
	AEM_BASE_URL?: string;
	AEM_API_KEY?: string;
	AEM_CAMPAIGNS_PATH?: string;
	/** openapi (Content Fragment Delivery) or graphql (persisted queries). Default: openapi */
	AEM_FETCH_MODE?: string;
	/** GraphQL persisted-query endpoint segment (default: email) */
	AEM_GRAPHQL_ENDPOINT?: string;
	/** List query name under endpoint (default: campaigns-all) */
	AEM_GRAPHQL_LIST_QUERY?: string;
	/** Single-campaign query name (default: campaign-by-path) */
	AEM_GRAPHQL_BY_PATH_QUERY?: string;
	/** Path parameter name for by-path query (default: campaignPath) */
	AEM_GRAPHQL_BY_PATH_PARAM?: string;
	/** Local path to Postman-style oauth.json (default: oauth.json) */
	OAUTH_CONFIG_PATH?: string;
	IMS_CLIENT_ID?: string;
	IMS_CLIENT_SECRET?: string;
	IMS_ORG_ID?: string;
	IMS_HOST?: string;
	/** Comma-separated scopes override for Author OAuth */
	IMS_SCOPES?: string;
}

export interface GraphQLConfig {
	endpoint: string;
	listQuery: string;
	byPathQuery: string;
	byPathParam: string;
}

export const DEFAULT_CAMPAIGNS_PATH = '/content/dam/email/en/campaigns';

export function isMockMode(env?: AppEnv): boolean {
	if (!env) return true;
	return env.MOCK_MODE === 'true';
}

function resolveApiKey(raw: string | undefined): string | undefined {
	const key = raw?.trim();
	if (!key) return undefined;
	const lower = key.toLowerCase();
	// Matches .env.example / local placeholders — do not send as X-Api-Key (CDN often rejects them).
	if (lower === 'placeholder' || lower.includes('your-aem-api-key')) return undefined;
	return key;
}

/** Publish origin without trailing slash (avoids // in request URLs). */
export function normalizeAemBaseUrl(url: string): string {
	const t = url.trim();
	if (!t) return '';
	return t.endsWith('/') ? t.slice(0, -1) : t;
}

export function aemClientOptions(env?: AppEnv): AEMClientOptions {
	return {
		baseUrl: normalizeAemBaseUrl(env?.AEM_BASE_URL ?? ''),
		apiKey: resolveApiKey(env?.AEM_API_KEY),
		mockMode: isMockMode(env)
	};
}

export function campaignsFolder(env?: AppEnv): string {
	return env?.AEM_CAMPAIGNS_PATH ?? DEFAULT_CAMPAIGNS_PATH;
}

export function aemTier(env?: AppEnv): AemTier {
	const tier = env?.AEM_TIER?.trim().toLowerCase();
	return tier === 'author' ? 'author' : 'publish';
}

export function aemFetchMode(env?: AppEnv): AemFetchMode {
	if (aemTier(env) === 'author') return 'openapi';
	const mode = env?.AEM_FETCH_MODE?.trim().toLowerCase();
	return mode === 'graphql' ? 'graphql' : 'openapi';
}

export function graphqlConfig(env?: AppEnv): GraphQLConfig {
	return {
		endpoint: env?.AEM_GRAPHQL_ENDPOINT?.trim() || 'email',
		listQuery: env?.AEM_GRAPHQL_LIST_QUERY?.trim() || 'campaigns-all',
		byPathQuery: env?.AEM_GRAPHQL_BY_PATH_QUERY?.trim() || 'campaign-by-path',
		byPathParam: env?.AEM_GRAPHQL_BY_PATH_PARAM?.trim() || 'campaignPath'
	};
}
