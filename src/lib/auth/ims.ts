// Adobe IMS service-to-service token handler.
// TODO(decision): This stub assumes OAuth server-to-server (formerly service account/JWT).
// Verify the exact credential type available in this project's Adobe Developer Console app.
//
// For now, tokens are read from env vars (set by wrangler secrets in production).
// In production this should implement token caching + refresh before expiry.

export interface IMSTokenOptions {
	clientId: string;
	clientSecret: string;
	imsHost?: string;
	scopes?: string[];
}

export interface IMSToken {
	accessToken: string;
	expiresAt: number; // epoch ms
}

// TODO(implementation): Replace with real IMS OAuth server-to-server call.
// POST https://ims-na1.adobelogin.com/ims/token/v3
//   grant_type=client_credentials&client_id=...&client_secret=...&scope=...
export async function fetchServiceToken(opts: IMSTokenOptions): Promise<IMSToken> {
	const imsHost = opts.imsHost ?? 'https://ims-na1.adobelogin.com';
	const scopes = opts.scopes ?? ['AdobeID', 'openid', 'read_organizations'];

	const res = await fetch(`${imsHost}/ims/token/v3`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'client_credentials',
			client_id: opts.clientId,
			client_secret: opts.clientSecret,
			scope: scopes.join(',')
		})
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`IMS token fetch failed ${res.status}: ${body}`);
	}

	const json = (await res.json()) as { access_token: string; expires_in: number };
	return {
		accessToken: json.access_token,
		expiresAt: Date.now() + json.expires_in * 1000
	};
}

export function isTokenExpired(token: IMSToken, bufferMs = 30_000): boolean {
	return Date.now() + bufferMs >= token.expiresAt;
}
