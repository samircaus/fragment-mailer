// GET  /api/personas — list preview personas
// POST /api/personas — create persona (optional, future use)

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listPersonas } from '$lib/personas/service.js';

export const GET: RequestHandler = async ({ platform }) => {
	return json({ personas: await listPersonas(platform) });
};
