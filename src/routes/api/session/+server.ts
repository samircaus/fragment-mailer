// POST /api/session — stores the UE-forwarded IMS token in an httpOnly cookie.
// DELETE /api/session — clears the session.
//
// POST requires strict auth (Cloudflare Access or APP_AUTH_SECRET) when configured.
// The /ue/[fragmentId] bootstrap flow sets cookies directly from ?login-token.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveAppEnv } from '$lib/server/app-env.js';
import { isAllowedAuthorHost, isAllowedPublishHost } from '$lib/server/auth.js';
import { derivePublishOriginFromAuthor, normalizeAemBaseUrl } from '$lib/aem/env.js';
import { ueSessionCookieOpts } from '$lib/server/ue-bootstrap.js';

export const POST: RequestHandler = async ({ request, cookies, url, platform }) => {
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body || typeof body.token !== 'string' || typeof body.authorHost !== 'string') {
		throw error(400, 'token and authorHost are required');
	}

	const { token, authorHost, publishHost } = body as {
		token: string;
		authorHost: string;
		publishHost?: string;
	};

	let authorOrigin: string;
	try {
		authorOrigin = normalizeAemBaseUrl(authorHost);
		new URL(authorOrigin);
	} catch {
		throw error(400, 'authorHost must be a valid URL');
	}

	const env = resolveAppEnv(platform?.env);
	if (!isAllowedAuthorHost(authorOrigin, env)) {
		throw error(400, 'authorHost is not an allowed AEM Author origin');
	}

	let publishOrigin: string | null = null;
	if (typeof publishHost === 'string' && publishHost.trim()) {
		try {
			publishOrigin = normalizeAemBaseUrl(
				publishHost.startsWith('http') ? publishHost : `https://${publishHost}`
			);
			new URL(publishOrigin);
		} catch {
			throw error(400, 'publishHost must be a valid URL');
		}
		if (!isAllowedPublishHost(publishOrigin, authorOrigin, env)) {
			throw error(400, 'publishHost is not an allowed AEM Publish origin');
		}
	} else {
		publishOrigin = derivePublishOriginFromAuthor(authorOrigin);
	}

	const secure = url.protocol === 'https:';
	const opts = ueSessionCookieOpts(secure);
	cookies.set('aem_token', token, opts);
	cookies.set('aem_author_host', authorOrigin, opts);
	if (publishOrigin) {
		cookies.set('aem_publish_host', publishOrigin, opts);
	}

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ cookies }) => {
	cookies.delete('aem_token', { path: '/' });
	cookies.delete('aem_author_host', { path: '/' });
	cookies.delete('aem_publish_host', { path: '/' });
	return json({ ok: true });
};
