// Cached IMS access token for AJO Platform API (separate OAuth app from AEM).

import type { AppEnv } from '$lib/aem/env.js';
import { ajoImsClientId, ajoImsClientSecret } from '$lib/aem/env.js';
import { fetchServiceToken, isTokenExpired, type IMSToken } from './ims.js';

let cached: IMSToken | null = null;

export interface AjoCredentials {
	clientId: string;
	clientSecret: string;
	imsOrg: string;
	imsHost?: string;
	scopes?: string[];
}

/** Default IMS scopes for AJO / Experience Platform APIs (includes product context for region). */
export const DEFAULT_AJO_IMS_SCOPES = [
	'openid',
	'AdobeID',
	'read_organizations',
	'additional_info.projectedProductContext',
	'session'
] as const;

export function ajoImsScopesFromEnv(env?: AppEnv): string[] {
	const raw = env?.AJO_IMS_SCOPES?.trim();
	if (raw) {
		return raw
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	}
	return [...DEFAULT_AJO_IMS_SCOPES];
}

export function ajoCredentialsFromEnv(env?: AppEnv): AjoCredentials | null {
	const clientId = ajoImsClientId(env);
	const clientSecret = ajoImsClientSecret(env);
	const imsOrg = env?.IMS_ORG_ID?.trim();
	if (!clientId || !clientSecret || !imsOrg) return null;
	return {
		clientId,
		clientSecret,
		imsOrg,
		imsHost: env?.IMS_HOST?.trim() ? `https://${env.IMS_HOST.replace(/^https?:\/\//, '')}` : undefined,
		scopes: ajoImsScopesFromEnv(env)
	};
}

export function isAjoConfigured(env?: AppEnv): boolean {
	return ajoCredentialsFromEnv(env) !== null;
}

export async function getAjoAccessToken(env?: AppEnv): Promise<string> {
	const creds = ajoCredentialsFromEnv(env);
	if (!creds) {
		throw new Error(
			'AJO credentials missing. Set AJO_IMS_CLIENT_ID and AJO_IMS_CLIENT_SECRET (or reuse IMS_CLIENT_ID / IMS_CLIENT_SECRET), and IMS_ORG_ID.'
		);
	}

	if (cached && !isTokenExpired(cached)) {
		return cached.accessToken;
	}

	cached = await fetchServiceToken({
		clientId: creds.clientId,
		clientSecret: creds.clientSecret,
		imsHost: creds.imsHost,
		scopes: creds.scopes
	});
	return cached.accessToken;
}

export function resetAjoAccessTokenCache(): void {
	cached = null;
}
