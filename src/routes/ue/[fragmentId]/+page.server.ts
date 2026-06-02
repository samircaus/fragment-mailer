// UE preview route: /ue/:fragmentId
//
// Bootstrap flow on first UE open (handled in hooks.server.ts):
//   1. UE opens URL with ?login-token=...&author=...&publish=...
//   2. hooks writes httpOnly cookies and redirects to a clean URL
//   3. Second request: hooks reads cookies → locals.aem is populated
//   4. load() fetches the fragment from AEM Author and returns it to the page

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createCfClient, TokenExpiredError } from '$lib/server/aem/cfClient.js';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.aem) {
		throw error(401, 'No AEM session. Open this page from Universal Editor.');
	}

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

	return { fragment, model, authorHost, previewUrl: url.toString() };
};
