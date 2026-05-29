// GET  /api/brands — list preview brands
// POST /api/brands — create brand

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createBrand, listBrands } from '$lib/brands/service.js';

export const GET: RequestHandler = async ({ platform }) => {
	return json({ brands: await listBrands(platform) });
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
		throw error(400, 'Brand id is required');
	}

	const result = await createBrand(platform, id, data);
	if (!result.ok) throw error(400, result.error);

	return json({ brand: result.brand }, { status: 201 });
};
