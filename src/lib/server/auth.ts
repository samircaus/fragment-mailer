// Request authentication for routes that spend Worker-held Adobe credentials.
//
// Enabled when APP_AUTH_SECRET and/or Cloudflare Access (CF_ACCESS_*) is configured.
// When disabled, behavior matches the pre-auth POC (local dev default).

import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AppEnv } from '$lib/aem/env.js';
import {
	authorHostUrl,
	derivePublishOriginFromAuthor,
	normalizeAemBaseUrl,
	publishHostRepoId
} from '$lib/aem/env.js';

export interface AuthConfig {
	secret?: string;
	cfAccessTeamDomain?: string;
	cfAccessAudience?: string;
}

export type RouteAuthLevel = 'public' | 'protected' | 'strict';

export type AuthMethod = 'cf-access' | 'bearer-secret' | 'ue-session' | 'disabled';

export function authConfigFromEnv(env?: AppEnv): AuthConfig {
	const teamDomain = env?.CF_ACCESS_TEAM_DOMAIN?.trim()
		.replace(/^https?:\/\//i, '')
		.replace(/\/$/, '');

	return {
		secret: env?.APP_AUTH_SECRET?.trim() || undefined,
		cfAccessTeamDomain: teamDomain || undefined,
		cfAccessAudience: env?.CF_ACCESS_AUD?.trim() || undefined
	};
}

export function isAuthEnabled(config: AuthConfig): boolean {
	return Boolean(config.secret) || Boolean(config.cfAccessTeamDomain && config.cfAccessAudience);
}

let jwksTeamDomain: string | null = null;
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function accessJwks(teamDomain: string) {
	if (jwksTeamDomain !== teamDomain) {
		jwksTeamDomain = teamDomain;
		jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
	}
	return jwks!;
}

async function verifyCfAccessJwt(
	token: string,
	teamDomain: string,
	audience: string
): Promise<boolean> {
	try {
		await jwtVerify(token, accessJwks(teamDomain), {
			issuer: `https://${teamDomain}`,
			audience
		});
		return true;
	} catch {
		return false;
	}
}

export function secretsEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	const enc = new TextEncoder();
	const ba = enc.encode(a);
	const bb = enc.encode(b);
	const subtle = globalThis.crypto?.subtle;
	if (subtle && typeof subtle.timingSafeEqual === 'function') {
		return subtle.timingSafeEqual(ba, bb);
	}
	let mismatch = 0;
	for (let i = 0; i < ba.length; i++) {
		mismatch |= ba[i] ^ bb[i];
	}
	return mismatch === 0;
}

function bearerSecret(request: Request, secret: string): boolean {
	const auth = request.headers.get('Authorization');
	const match = auth?.match(/^Bearer\s+(.+)$/i);
	if (!match) return false;
	return secretsEqual(match[1], secret);
}

export async function getRouteAuthLevel(
	pathname: string,
	method: string,
	url: URL,
	request: Request
): Promise<RouteAuthLevel> {
	if (pathname.startsWith('/ue/')) return 'public';

		const appRoute =
		pathname === '/' ||
		pathname.startsWith('/editor/') ||
		pathname.startsWith('/templates') ||
		pathname.startsWith('/fragments') ||
		pathname.startsWith('/preview/') ||
		pathname.startsWith('/api/');

	if (!appRoute) return 'public';

	if (pathname === '/api/export/ajo' && method === 'POST') {
		if (url.searchParams.get('push') === 'true') return 'strict';
		try {
			const body = (await request.clone().json()) as { push?: boolean };
			if (body.push === true) return 'strict';
		} catch {
			// empty or non-JSON body
		}
	}

	if (pathname === '/api/export/ajo/standalone' && method === 'POST') {
		try {
			const body = (await request.clone().json()) as { push?: boolean };
			if (body.push === true) return 'strict';
		} catch {
			// empty or non-JSON body
		}
	}

	if (pathname === '/api/session' && method === 'POST') return 'strict';

	return 'protected';
}

export async function authenticateRequest(
	request: Request,
	locals: App.Locals,
	config: AuthConfig,
	level: RouteAuthLevel
): Promise<{ ok: true; method: AuthMethod } | { ok: false }> {
	if (level === 'public' || !isAuthEnabled(config)) {
		return { ok: true, method: 'disabled' };
	}

	const allowUeSession = level === 'protected';

	if (config.cfAccessTeamDomain && config.cfAccessAudience) {
		const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
		if (jwt && (await verifyCfAccessJwt(jwt, config.cfAccessTeamDomain, config.cfAccessAudience))) {
			return { ok: true, method: 'cf-access' };
		}
	}

	if (config.secret && bearerSecret(request, config.secret)) {
		return { ok: true, method: 'bearer-secret' };
	}

	if (allowUeSession && locals.aem) {
		return { ok: true, method: 'ue-session' };
	}

	return { ok: false };
}

/** Restrict session publishHost to configured or author-derived Publish origins. */
export function isAllowedPublishHost(
	publishHost: string,
	authorHost: string,
	env?: AppEnv
): boolean {
	const allowed = new Set<string>();

	const explicit = env?.AEM_PUBLISH_HOST?.trim();
	if (explicit) {
		const origin = normalizeAuthorOrigin(explicit);
		if (origin) allowed.add(origin);
	}

	const derivedFromAuthor = derivePublishOriginFromAuthor(authorHost);
	if (derivedFromAuthor) allowed.add(derivedFromAuthor.toLowerCase());

	const repoHost = publishHostRepoId(env);
	if (repoHost) allowed.add(`https://${repoHost}`.toLowerCase());

	if (allowed.size === 0) {
		return derivedFromAuthor !== null && normalizeAuthorOrigin(publishHost) === derivedFromAuthor.toLowerCase();
	}

	const requested = normalizeAuthorOrigin(publishHost);
	return requested !== null && allowed.has(requested);
}

/** Restrict session authorHost to configured AEM Author origins. */
export function isAllowedAuthorHost(authorHost: string, env?: AppEnv): boolean {
	const allowed = new Set<string>();
	for (const candidate of [authorHostUrl(env), env?.AEM_BASE_URL, env?.AEM_AUTHOR_HOST]) {
		const origin = normalizeAuthorOrigin(candidate);
		if (origin) allowed.add(origin);
	}

	// No AEM host configured — local dev without AEM vars.
	if (allowed.size === 0) return true;

	const requested = normalizeAuthorOrigin(authorHost);
	return requested !== null && allowed.has(requested);
}

function normalizeAuthorOrigin(value: string | undefined): string | null {
	if (!value?.trim()) return null;
	try {
		const url = value.includes('://') ? new URL(value) : new URL(`https://${value}`);
		return normalizeAemBaseUrl(url.origin).toLowerCase();
	} catch {
		return null;
	}
}

/** Reset cached JWKS (tests). */
export function resetAuthCaches(): void {
	jwksTeamDomain = null;
	jwks = null;
}
