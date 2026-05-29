// POST /api/templates/:id/versions — save MJML as a new template version

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { saveTemplateAsNewVersion } from '$lib/templates/service.js';

const BodySchema = z.object({
	mjml: z.string().min(1)
});

export const POST: RequestHandler = async ({ params, request, platform }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) throw error(400, `Invalid: ${parsed.error.message}`);

	const result = await saveTemplateAsNewVersion(platform, params.id, parsed.data.mjml);
	if (result.error) throw error(409, result.error);

	return json({ ok: true, ...result.data }, { status: 201 });
};
