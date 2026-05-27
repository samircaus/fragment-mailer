// GET /api/templates/:id   — get template MJML + definition
// PUT /api/templates/:id   — update template MJML

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { loadTemplate, saveTemplateMJML } from '$lib/templates/registry.js';

export const GET: RequestHandler = async ({ params }) => {
	const result = loadTemplate(params.id);
	if (result.error) throw error(404, result.error);

	const { mjml, definition } = result.data!;
	return json({ id: params.id, mjml, definition });
};

const UpdateSchema = z.object({
	mjml: z.string().min(1)
});

export const PUT: RequestHandler = async ({ params, request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = UpdateSchema.safeParse(body);
	if (!parsed.success) throw error(400, `Invalid: ${parsed.error.message}`);

	const result = saveTemplateMJML(params.id, parsed.data.mjml);
	if (result.error) throw error(404, result.error);

	return json({ ok: true });
};
