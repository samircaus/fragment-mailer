import type { AEMClientOptions } from './client.js';

/** AEM instance: Author (Sites CF Management + OAuth) or Publish (Delivery / GraphQL). */
export type AemTier = 'author' | 'publish';

/** How to load CFs from AEM Publish. */
export type AemFetchMode = 'openapi' | 'graphql';

/** Worker bindings + vars (see app.d.ts and .dev.vars). */
export interface AppEnv {
	/** author | publish — default publish */
	AEM_TIER?: string;
	AEM_BASE_URL?: string;
	AEM_API_KEY?: string;
	AEM_CAMPAIGNS_PATH?: string;
	/** Author CF fetch: nested reference depth (default 3). */
	AEM_CF_REFERENCE_DEPTH?: string;
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
	/** Author host (defaults to AEM_BASE_URL when AEM_TIER=author) */
	AEM_AUTHOR_HOST?: string;
	/** Publish host for AJO repoId (hostname only after strip) */
	AEM_PUBLISH_HOST?: string;
	/** AJO sandbox name (falls back to AJO_SANDBOX) */
	AJO_SANDBOX_NAME?: string;
	/** AJO IMS OAuth client (separate from AEM) */
	AJO_IMS_CLIENT_ID?: string;
	AJO_IMS_CLIENT_SECRET?: string;
	/** Comma-separated IMS scopes for AJO token (default includes projectedProductContext) */
	AJO_IMS_SCOPES?: string;
	AJO_SANDBOX?: string;
	/** Experience Cloud hash tenant for CF editor links (URL segment after #/@). Default: psc */
	AEM_CF_EDITOR_TENANT?: string;
	/** Bearer secret for API auth (automation / complement to Cloudflare Access) */
	APP_AUTH_SECRET?: string;
	/** Cloudflare Access team domain, e.g. myteam.cloudflareaccess.com */
	CF_ACCESS_TEAM_DOMAIN?: string;
	/** Cloudflare Access application audience (AUD tag) */
	CF_ACCESS_AUD?: string;
}

export function cfEditorTenant(env?: AppEnv): string {
	return env?.AEM_CF_EDITOR_TENANT?.trim() || 'psc';
}

export interface GraphQLConfig {
	endpoint: string;
	listQuery: string;
	byPathQuery: string;
	byPathParam: string;
}

export const DEFAULT_CAMPAIGNS_PATH = '/content/dam/email/en/campaigns';

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
		apiKey: resolveApiKey(env?.AEM_API_KEY)
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

/** Author tier base URL for CF Management API. */
export function authorHostUrl(env?: AppEnv): string {
	const explicit = env?.AEM_AUTHOR_HOST?.trim();
	if (explicit) return normalizeAemBaseUrl(explicit);
	if (aemTier(env) === 'author') return normalizeAemBaseUrl(env?.AEM_BASE_URL ?? '');
	return '';
}

function stripUrlToHostname(raw: string): string {
	return raw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

/** Publish origin derived from an Author origin (author-p… → publish-p…). */
export function derivePublishOriginFromAuthor(authorHost: string): string | null {
	const normalized = normalizeAemBaseUrl(
		authorHost.startsWith('http') ? authorHost : `https://${authorHost}`
	);
	try {
		const url = new URL(normalized);
		if (!/^author[-.]/i.test(url.hostname)) return null;
		url.hostname = url.hostname.replace(/^author/i, 'publish');
		return normalizeAemBaseUrl(url.origin);
	} catch {
		return null;
	}
}

/** HTTPS origin for DAM assets in preview HTML (Publish when editing on Author). */
export function aemAssetBaseUrl(env?: AppEnv, sessionPublishHost?: string | null): string {
	const session = sessionPublishHost?.trim();
	if (session) {
		return normalizeAemBaseUrl(session.startsWith('http') ? session : `https://${session}`);
	}

	const explicit = env?.AEM_PUBLISH_HOST?.trim();
	if (explicit) {
		return normalizeAemBaseUrl(explicit.startsWith('http') ? explicit : `https://${explicit}`);
	}
	if (aemTier(env) === 'author') {
		const publishHost = publishHostRepoId(env);
		if (publishHost) return `https://${publishHost}`;
	}
	return normalizeAemBaseUrl(env?.AEM_BASE_URL ?? '');
}

export function publishHostRepoId(env?: AppEnv): string {
	const explicit = env?.AEM_PUBLISH_HOST?.trim();
	if (explicit) return stripUrlToHostname(explicit);

	const baseHost = stripUrlToHostname(env?.AEM_BASE_URL?.trim() ?? '');
	if (!baseHost) return '';

	if (/^author[-.]/i.test(baseHost)) {
		return baseHost.replace(/^author/i, 'publish');
	}

	return baseHost;
}

export function ajoSandboxName(env?: AppEnv): string {
	return env?.AJO_SANDBOX_NAME?.trim() || env?.AJO_SANDBOX?.trim() || 'prod';
}

/** AJO Platform API key — dedicated AJO_IMS_* or same S2S app as AEM Author. */
export function ajoImsClientId(env?: AppEnv): string | undefined {
	return env?.AJO_IMS_CLIENT_ID?.trim() || env?.IMS_CLIENT_ID?.trim() || undefined;
}

export function ajoImsClientSecret(env?: AppEnv): string | undefined {
	return env?.AJO_IMS_CLIENT_SECRET?.trim() || env?.IMS_CLIENT_SECRET?.trim() || undefined;
}
