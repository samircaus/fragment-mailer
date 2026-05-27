// GET  /api/templates       — list all templates
// POST /api/templates       — create a new template

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { listTemplates, createTemplate, loadTemplate } from '$lib/templates/registry.js';

export const GET: RequestHandler = async () => {
	return json({ templates: listTemplates() });
};

const DEFAULT_MJML = `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Arial, Helvetica, sans-serif" />
      <mj-text font-size="16px" color="#333333" line-height="1.6" />
    </mj-attributes>
  </mj-head>

  <mj-body background-color="#F4F4F4">
    <mj-section background-color="#FFFFFF" padding="32px 40px">
      <mj-column>
        <mj-text font-size="28px" font-weight="bold" color="#1A1A1A" align="center">
          New Template
        </mj-text>
        <mj-text align="center" color="#555555">
          Start editing your template here.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

const CreateSchema = z.object({
	id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'ID must be lowercase letters, numbers, and hyphens'),
	name: z.string().min(1),
	mjml: z.string().optional()
});

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = CreateSchema.safeParse(body);
	if (!parsed.success) throw error(400, `Invalid request: ${parsed.error.message}`);

	const result = createTemplate(parsed.data.id, parsed.data.name, parsed.data.mjml ?? DEFAULT_MJML);
	if (result.error) throw error(409, result.error);

	const templateResult = loadTemplate(parsed.data.id);
	return json({ template: templateResult.data?.definition }, { status: 201 });
};
