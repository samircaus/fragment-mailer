// Cached IMS access token for AJO Platform API (separate OAuth app from AEM).

import type { AppEnv } from '$lib/aem/env.js';
import { fetchServiceToken, isTokenExpired, type IMSToken } from './ims.js';

let cached: IMSToken | null = null;

export interface AjoCredentials {
	clientId: string;
	clientSecret: string;
	imsOrg: string;
	imsHost?: string;
	scopes?: string[];
}

export function ajoCredentialsFromEnv(env?: AppEnv): AjoCredentials | null {
	const clientId = env?.AJO_IMS_CLIENT_ID?.trim();
	const clientSecret = env?.AJO_IMS_CLIENT_SECRET?.trim();
	const imsOrg = env?.IMS_ORG_ID?.trim();
	if (!clientId || !clientSecret || !imsOrg) return null;
	return {
		clientId,
		clientSecret,
		imsOrg,
		imsHost: env?.IMS_HOST?.trim() ? `https://${env.IMS_HOST.replace(/^https?:\/\//, '')}` : undefined,
		scopes: ['openid', 'AdobeID', 'session', 'adobeio_api', 'read_organizations']
	};
}

export function isAjoConfigured(env?: AppEnv): boolean {
	return ajoCredentialsFromEnv(env) !== null;
}

export async function getAjoAccessToken(env?: AppEnv): Promise<string> {
	const creds = ajoCredentialsFromEnv(env);
	if (!creds) {
		throw new Error(
			'AJO credentials missing. Set AJO_IMS_CLIENT_ID, AJO_IMS_CLIENT_SECRET, and IMS_ORG_ID.'
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
