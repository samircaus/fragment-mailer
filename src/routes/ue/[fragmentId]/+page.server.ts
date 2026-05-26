// UE preview route: /ue/:fragmentId
//
// Bootstrap flow on first UE open:
//   1. UE opens URL with ?login-token=...&author=...  (token in query string)
//   2. load() detects the params, writes httpOnly cookies, redirects to clean URL
//   3. Second request: hooks.server.ts reads cookies → locals.aem is populated
//   4. load() fetches the fragment from AEM Author and returns it to the page

import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createCfClient, TokenExpiredError } from '$lib/server/aem/cfClient.js';

export const load: PageServerLoad = async ({ params, locals, cookies, url }) => {
	// --- UE bootstrap: token arrives once in the URL -------------------------
	if (!locals.aem) {
		const loginToken = url.searchParams.get('login-token');
		const authorUrl = url.searchParams.get('author');

		if (!loginToken || !authorUrl) {
			throw error(401, 'No AEM session. Open this page from Universal Editor.');
		}

		try {
			new URL(authorUrl); // validate before storing
		} catch {
			throw error(400, 'Invalid author URL in query params');
		}

		const secure = url.protocol === 'https:';
		const cookieOpts = {
			path: '/',
			httpOnly: true,
			secure,
			sameSite: (secure ? 'none' : 'lax') as 'none' | 'lax',
			maxAge: 60 * 60 * 8
		};

		cookies.set('aem_token', loginToken, cookieOpts);
		cookies.set('aem_author_host', authorUrl, cookieOpts);

		// Redirect to clean URL — token must not appear in rendered HTML
		const clean = new URL(url);
		for (const p of ['login-token', 'author', 'publish', 'env']) {
			clean.searchParams.delete(p);
		}
		redirect(302, clean.toString());
	}

	// --- Normal load (session already established) ---------------------------
	const { token, authorHost } = locals.aem;
	const client = createCfClient({ authorHost, token, fetch });

	let fragment;
	try {
		const result = await client.getFragment(params.fragmentId, { references: true, depth: 2 });
		fragment = result.data;
	} catch (e) {
		if (e instanceof TokenExpiredError) throw error(401, e.message);
		throw e;
	}

	if (!fragment) {
		throw error(404, `Fragment "${params.fragmentId}" not found on Author`);
	}

	const { data: model } = await client.getModel(fragment.model.id).catch(() => ({ data: null }));

	return { fragment, model, authorHost };
};
