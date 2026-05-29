// GET /api/personas/:id — get persona
// PUT /api/personas/:id — update persona

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPersonaById, updatePersona } from '$lib/personas/service.js';

export const GET: RequestHandler = async ({ params, platform }) => {
	const persona = await getPersonaById(platform, params.id);
	return json({ persona });
};

export const PUT: RequestHandler = async ({ params, request, platform }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const result = await updatePersona(platform, params.id, body);
	if (!result.ok) throw error(400, result.error);

	return json({ persona: result.persona });
};
