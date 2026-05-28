// Server-side hooks.
// Populates event.locals.aem from the httpOnly session cookies set by /api/session.
// Also adds basic request logging for observability.

import { redirect, type Handle } from '@sveltejs/kit';
import { isUniversalEditorReferer } from '$lib/ue/context.js';

export const handle: Handle = async ({ event, resolve }) => {
	const start = Date.now();

	// UE opens the configured preview URL in a single iframe. The editor shell embeds
	// /preview in a nested iframe, which breaks the properties panel — serve preview HTML directly.
	if (
		event.request.method === 'GET' &&
		isUniversalEditorReferer(event.request.headers.get('referer'))
	) {
		const editorMatch = event.url.pathname.match(/^\/editor\/([^/]+)\/?$/);
		if (editorMatch) {
			const target = new URL(`/preview/${editorMatch[1]}`, event.url.origin);
			target.search = event.url.search;
			redirect(302, `${target.pathname}${target.search}`);
		}
	}

	// Populate AEM context from session cookies (written by /api/session or the UE bootstrap flow)
	const token = event.cookies.get('aem_token');
	const authorHost = event.cookies.get('aem_author_host');
	if (token && authorHost) {
		event.locals.aem = { token, authorHost };
	}

	const response = await resolve(event);

	// Structured log line — picked up by Cloudflare observability
	console.log(
		JSON.stringify({
			method: event.request.method,
			path: event.url.pathname,
			status: response.status,
			durationMs: Date.now() - start
		})
	);

	return response;
};
