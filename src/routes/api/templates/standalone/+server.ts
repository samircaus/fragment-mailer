// GET /api/templates/standalone — list local MJML templates for AJO (no AEM CF)

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listStandaloneTemplatePickerItems } from '$lib/templates/service.js';
import { listEmailTemplateRows } from '$lib/db/email-templates.js';
import {
	getDb,
	getEmailStatus,
	standaloneTemplateCfUuid,
	statusScopeFromEnv
} from '$lib/db/email-status.js';
import { rowToEmailStatusInfo } from '$lib/db/email-status-types.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

export const GET: RequestHandler = async ({ platform }) => {
	const env = resolveAppEnv(platform?.env);
	const scope = statusScopeFromEnv(env);
	const db = getDb(platform);
	const templates = await listStandaloneTemplatePickerItems(platform);
	const rows = await listEmailTemplateRows(db);
	const updatedAtById = new Map(rows.map((row) => [row.id, row.updatedAt]));

	const latestByFamily = new Map<string, (typeof templates)[number]>();
	for (const template of templates) {
		const existing = latestByFamily.get(template.familyId);
		if (
			!existing ||
			template.version.localeCompare(existing.version, undefined, { numeric: true }) > 0
		) {
			latestByFamily.set(template.familyId, template);
		}
	}

	const withStatus = await Promise.all(
		[...latestByFamily.values()].map(async (template) => {
			const cfUuid = standaloneTemplateCfUuid(template.familyId);
			const row = await getEmailStatus(db, scope, cfUuid);
			const updatedAt =
				updatedAtById.get(template.id) ?? row?.updatedAt ?? new Date().toISOString();
			return {
				...template,
				id: template.familyId,
				updatedAt,
				emailStatus: rowToEmailStatusInfo(row, updatedAt)
			};
		})
	);

	return json({ templates: withStatus.sort((a, b) => a.name.localeCompare(b.name)) });
};
