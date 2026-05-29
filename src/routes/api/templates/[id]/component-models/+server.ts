// GET /api/templates/:id/component-models — UE property panel models for a template

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadTemplate } from '$lib/templates/service.js';

export const GET: RequestHandler = async ({ params, platform }) => {
	const result = await loadTemplate(platform, params.id);
	if (result.error) throw error(404, result.error);

	const doc = result.data?.componentModels ?? [];
	return json(doc, {
		headers: {
			'Cache-Control': 'no-store'
		}
	});
};
