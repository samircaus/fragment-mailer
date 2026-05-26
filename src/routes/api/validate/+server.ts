// POST /api/validate
// Validates CF field content against the rule set and returns warnings.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { validate } from '$lib/render/validate.js';

// Zod v4: z.record() requires both key and value schemas.
const ValidateRequestSchema = z.object({
	fields: z.record(z.string(), z.unknown()),
	fieldTypes: z.record(z.string(), z.string()).optional(),
	renderedHtml: z.string().optional()
});

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = ValidateRequestSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, `Invalid request: ${parsed.error.message}`);
	}

	const { fields, fieldTypes = {}, renderedHtml = '' } = parsed.data;

	const warnings = validate(fields, fieldTypes, renderedHtml);

	return json({ warnings });
};
