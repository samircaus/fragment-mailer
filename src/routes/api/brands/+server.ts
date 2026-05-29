// GET /api/brands — list preview brands

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listBrands } from '$lib/brands/service.js';

export const GET: RequestHandler = async ({ platform }) => {
	return json({ brands: await listBrands(platform) });
};
