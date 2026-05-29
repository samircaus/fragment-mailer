// POST /api/session — stores the UE-forwarded IMS token in an httpOnly cookie.
// DELETE /api/session — clears the session.
//
// POST requires strict auth (Cloudflare Access or APP_AUTH_SECRET) when configured.
// The /ue/[fragmentId] bootstrap flow sets cookies directly from ?login-token.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveAppEnv } from '$lib/server/app-env.js';
import { isAllowedAuthorHost } from '$lib/server/auth.js';

function cookieOpts(secure: boolean) {
	return {
		path: '/',
		httpOnly: true,
		secure,
		sameSite: (secure ? 'none' : 'lax') as 'none' | 'lax',
		maxAge: 60 * 60 * 8 // 8 h — typical IMS token TTL
	};
}

export const POST: RequestHandler = async ({ request, cookies, url, platform }) => {
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body || typeof body.token !== 'string' || typeof body.authorHost !== 'string') {
		throw error(400, 'token and authorHost are required');
	}

	const { token, authorHost } = body as { token: string; authorHost: string };

	try {
		new URL(authorHost);
	} catch {
		throw error(400, 'authorHost must be a valid URL');
	}

	const env = resolveAppEnv(platform?.env);
	if (!isAllowedAuthorHost(authorHost, env)) {
		throw error(400, 'authorHost is not an allowed AEM Author origin');
	}

	const secure = url.protocol === 'https:';
	const opts = cookieOpts(secure);
	cookies.set('aem_token', token, opts);
	cookies.set('aem_author_host', authorHost, opts);

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ cookies }) => {
	cookies.delete('aem_token', { path: '/' });
	cookies.delete('aem_author_host', { path: '/' });
	return json({ ok: true });
};
