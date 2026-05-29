// GET  /api/personas — list preview personas
// POST /api/personas — create persona

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createPersona, listPersonas } from '$lib/personas/service.js';

export const GET: RequestHandler = async ({ platform }) => {
	return json({ personas: await listPersonas(platform) });
};

export const POST: RequestHandler = async ({ request, platform }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		throw error(400, 'Request body must be a JSON object');
	}

	const { id, ...data } = body as Record<string, unknown>;
	if (typeof id !== 'string' || !id.trim()) {
		throw error(400, 'Persona id is required');
	}

	const result = await createPersona(platform, id, data);
	if (!result.ok) throw error(400, result.error);

	return json({ persona: result.persona }, { status: 201 });
};
