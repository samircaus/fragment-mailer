// Server-side hooks.
// Bootstraps IMS token from env on startup (if not in mock mode) and adds
// basic request logging for observability.

import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const start = Date.now();

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
