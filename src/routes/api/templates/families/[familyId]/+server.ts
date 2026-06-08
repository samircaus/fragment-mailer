// PATCH /api/templates/families/:familyId — rename a template family
// DELETE /api/templates/families/:familyId — delete all versions of a custom template

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { deleteTemplateFamily, renameTemplateFamily } from '$lib/templates/service.js';

const RenameSchema = z.object({
	name: z.string().min(1)
});

export const PATCH: RequestHandler = async ({ params, request, platform }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = RenameSchema.safeParse(body);
	if (!parsed.success) throw error(400, `Invalid: ${parsed.error.message}`);

	const result = await renameTemplateFamily(platform, params.familyId, parsed.data.name);
	if (result.error) {
		const status = result.error.includes('Built-in') ? 403 : result.error.includes('not found') ? 404 : 400;
		throw error(status, result.error);
	}

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, platform }) => {
	const result = await deleteTemplateFamily(platform, params.familyId);
	if (result.error) {
		const status = result.error.includes('Built-in') ? 403 : result.error.includes('not found') ? 404 : 400;
		throw error(status, result.error);
	}

	return json({ ok: true });
};
