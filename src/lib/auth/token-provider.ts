// Cached IMS access token for AEM Author (OAuth server-to-server).

import type { AppEnv } from '$lib/aem/env.js';
import { fetchServiceToken, isTokenExpired, type IMSToken } from './ims.js';
import { resolveOAuthCredentials } from './oauth-config.js';

let cached: IMSToken | null = null;

export async function getAemAccessToken(env?: AppEnv): Promise<string> {
	const creds = await resolveOAuthCredentials(env);
	if (!creds) {
		throw new Error(
			'AEM Author OAuth credentials missing. Set IMS_CLIENT_ID and IMS_CLIENT_SECRET in .dev.vars, or copy oauth.example.json to oauth.json.'
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

/** Clear cached token (tests). */
export function resetAemAccessTokenCache(): void {
	cached = null;
}
