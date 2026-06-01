// DELETE /api/templates/:id/ajo-link — clear AJO link for standalone content templates

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadTemplate } from '$lib/templates/service.js';
import { resolveAppEnv } from '$lib/server/app-env.js';
import {
	clearRemoteTemplateLink,
	getDb,
	getEmailStatus,
	standaloneTemplateCfUuid,
	statusScopeFromEnv
} from '$lib/db/email-status.js';
import { rowToEmailStatusInfo } from '$lib/db/email-status-types.js';

export const DELETE: RequestHandler = async ({ params, platform }) => {
	const { id } = params;
	const templateResult = await loadTemplate(platform, id);
	if (templateResult.error || !templateResult.data) {
		throw error(404, templateResult.error ?? 'Template not found');
	}

	const scope = statusScopeFromEnv(resolveAppEnv(platform?.env));
	const db = getDb(platform);
	const cfUuid = standaloneTemplateCfUuid(id);
	const cleared = await clearRemoteTemplateLink(db, scope, cfUuid);

	const statusRow = await getEmailStatus(db, scope, cfUuid);
	const updatedAt = templateResult.data.definition.version ?? new Date().toISOString();
	const emailStatus = rowToEmailStatusInfo(statusRow, updatedAt);

	return json({ ok: true, cleared, emailStatus });
};
