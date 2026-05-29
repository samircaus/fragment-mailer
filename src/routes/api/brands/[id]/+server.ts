// GET /api/brands/:id — get brand
// PUT /api/brands/:id — update brand

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBrandById, updateBrand } from '$lib/brands/service.js';

export const GET: RequestHandler = async ({ params, platform }) => {
	const brand = await getBrandById(platform, params.id);
	if (!brand) throw error(404, `Brand "${params.id}" not found`);
	return json({ brand });
};

export const PUT: RequestHandler = async ({ params, request, platform }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const result = await updateBrand(platform, params.id, body);
	if (!result.ok) throw error(400, result.error);

	return json({ brand: result.brand });
};
