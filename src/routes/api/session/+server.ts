// POST /api/session — stores the UE-forwarded IMS token in an httpOnly cookie.
// DELETE /api/session — clears the session.
//
// The load function in /ue/[fragmentId] also sets cookies directly when it
// detects ?login-token in the URL; this endpoint exists for any future
// client-side or external caller that needs to update the session.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function cookieOpts(secure: boolean) {
	return {
		path: '/',
		httpOnly: true,
		secure,
		sameSite: (secure ? 'none' : 'lax') as 'none' | 'lax',
		maxAge: 60 * 60 * 8 // 8 h — typical IMS token TTL
	};
}

export const POST: RequestHandler = async ({ request, cookies, url }) => {
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
