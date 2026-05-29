// GET /api/templates/:id   — get template MJML + definition + UE assets
// PUT /api/templates/:id   — update template MJML and/or metadata

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
	deleteTemplateVersion,
	loadTemplate,
	saveTemplateMJML,
	updateTemplate
} from '$lib/templates/service.js';

export const GET: RequestHandler = async ({ params, platform }) => {
	const result = await loadTemplate(platform, params.id);
	if (result.error) throw error(404, result.error);

	const { mjml, definition, componentDefinition, componentModels, isBuiltin } = result.data!;
	return json({
		id: params.id,
		mjml,
		definition,
		componentDefinition,
		componentModels,
		isBuiltin
	});
};

const UpdateSchema = z
	.object({
		mjml: z.string().min(1).optional(),
		definition: z.record(z.string(), z.unknown()).optional(),
		componentDefinition: z.record(z.string(), z.unknown()).nullable().optional(),
		componentModels: z.array(z.record(z.string(), z.unknown())).nullable().optional()
	})
	.refine(
		(data) =>
			data.mjml !== undefined ||
			data.definition !== undefined ||
			data.componentDefinition !== undefined ||
			data.componentModels !== undefined,
		{ message: 'At least one field must be provided' }
	);

export const PUT: RequestHandler = async ({ params, request, platform }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = UpdateSchema.safeParse(body);
	if (!parsed.success) throw error(400, `Invalid: ${parsed.error.message}`);

	if (parsed.data.mjml && parsed.data.definition === undefined && parsed.data.componentDefinition === undefined && parsed.data.componentModels === undefined) {
		const result = await saveTemplateMJML(platform, params.id, parsed.data.mjml);
		if (result.error) throw error(404, result.error);
		return json({ ok: true });
	}

	const result = await updateTemplate(platform, params.id, {
		mjml: parsed.data.mjml,
		definition: parsed.data.definition as never,
		componentDefinition: parsed.data.componentDefinition as never,
		componentModels: parsed.data.componentModels as never
	});
	if (result.error) throw error(404, result.error);

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, platform }) => {
	const result = await deleteTemplateVersion(platform, params.id);
	if (result.error) {
		const status = result.error.includes('Built-in') ? 403 : result.error.includes('only version') ? 409 : 404;
		throw error(status, result.error);
	}
	return json({ ok: true });
};
