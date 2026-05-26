// Server-side hooks.
// Populates event.locals.aem from the httpOnly session cookies set by /api/session.
// Also adds basic request logging for observability.

import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const start = Date.now();

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
