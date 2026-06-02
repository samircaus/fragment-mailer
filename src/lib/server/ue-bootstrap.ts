// Universal Editor first-open bootstrap: capture login-token, author, and publish from
// query params into httpOnly cookies, then redirect to a clean URL.

import type { Cookies } from '@sveltejs/kit';
import { derivePublishOriginFromAuthor, normalizeAemBaseUrl, type AppEnv } from '$lib/aem/env.js';
import { isAllowedAuthorHost, isAllowedPublishHost } from '$lib/server/auth.js';

const BOOTSTRAP_PARAMS = ['login-token', 'author', 'publish', 'env'] as const;

export function ueSessionCookieOpts(secure: boolean) {
	return {
		path: '/',
		httpOnly: true,
		secure,
		sameSite: (secure ? 'none' : 'lax') as 'none' | 'lax',
		maxAge: 60 * 60 * 8
	};
}

export function isUeBootstrapPath(pathname: string): boolean {
	return (
		pathname.startsWith('/preview/') ||
		pathname.startsWith('/editor/') ||
		pathname.startsWith('/ue/')
	);
}

function normalizeAemOrigin(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	try {
		const url = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`);
		return normalizeAemBaseUrl(url.origin);
	} catch {
		return null;
	}
}

/** Returns a redirect path (pathname + search) when bootstrap cookies were written. */
export function tryUeBootstrapRedirect(url: URL, cookies: Cookies, env?: AppEnv): string | null {
	if (!isUeBootstrapPath(url.pathname)) return null;

	const loginToken = url.searchParams.get('login-token');
	const authorUrl = url.searchParams.get('author');
	if (!loginToken || !authorUrl) return null;

	const authorOrigin = normalizeAemOrigin(authorUrl);
	if (!authorOrigin || !isAllowedAuthorHost(authorOrigin, env)) return null;

	let publishOrigin = normalizeAemOrigin(url.searchParams.get('publish') ?? '');
	if (publishOrigin && !isAllowedPublishHost(publishOrigin, authorOrigin, env)) {
		publishOrigin = null;
	}
	if (!publishOrigin) {
		publishOrigin = derivePublishOriginFromAuthor(authorOrigin);
	}

	const secure = url.protocol === 'https:';
	const opts = ueSessionCookieOpts(secure);
	cookies.set('aem_token', loginToken, opts);
	cookies.set('aem_author_host', authorOrigin, opts);
	if (publishOrigin) {
		cookies.set('aem_publish_host', publishOrigin, opts);
	}

	const clean = new URL(url);
	for (const param of BOOTSTRAP_PARAMS) {
		clean.searchParams.delete(param);
	}
	return `${clean.pathname}${clean.search}`;
}
