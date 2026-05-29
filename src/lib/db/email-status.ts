import type { D1Database } from '@cloudflare/workers-types';
import {
	hashContent,
	type EmailStatusRow,
	type StatusScope
} from './email-status-types.js';

type DbLike = Pick<D1Database, 'prepare' | 'batch'>;

const memoryStore = new Map<string, EmailStatusRow>();

function memoryKey(scope: StatusScope, cfUuid: string): string {
	return `${scope.imsOrgId}:${scope.ajoSandbox}:${cfUuid}`;
}

function rowFromDb(record: Record<string, unknown>): EmailStatusRow {
	return {
		cfUuid: String(record.cf_uuid),
		campaignId: String(record.campaign_id),
		imsOrgId: String(record.ims_org_id),
		ajoSandbox: String(record.ajo_sandbox),
		remoteTemplateId: record.remote_template_id ? String(record.remote_template_id) : null,
		lastPushedAt: record.last_pushed_at ? String(record.last_pushed_at) : null,
		aemModifiedAt: record.aem_modified_at ? String(record.aem_modified_at) : null,
		contentHash: record.content_hash ? String(record.content_hash) : null,
		lastPushError: record.last_push_error ? String(record.last_push_error) : null,
		updatedAt: String(record.updated_at)
	};
}

export function standaloneTemplateCfUuid(templateId: string): string {
	return `standalone:${templateId}`;
}

export async function getEmailStatus(
	db: DbLike | undefined,
	scope: StatusScope,
	cfUuid: string
): Promise<EmailStatusRow | null> {
	if (!cfUuid) return null;

	if (!db) {
		return memoryStore.get(memoryKey(scope, cfUuid)) ?? null;
	}

	const row = await db
		.prepare(
			`SELECT cf_uuid, campaign_id, ims_org_id, ajo_sandbox,
				remote_template_id, last_pushed_at, aem_modified_at, content_hash,
				last_push_error, updated_at
			FROM email_status
			WHERE cf_uuid = ? AND ims_org_id = ? AND ajo_sandbox = ?`
		)
		.bind(cfUuid, scope.imsOrgId, scope.ajoSandbox)
		.first<Record<string, unknown>>();

	return row ? rowFromDb(row) : null;
}

export async function getRemoteTemplateId(
	db: DbLike | undefined,
	scope: StatusScope,
	cfUuid: string | undefined,
	campaignId: string
): Promise<string | undefined> {
	if (cfUuid) {
		const row = await getEmailStatus(db, scope, cfUuid);
		if (row?.remoteTemplateId) return row.remoteTemplateId;
	}

	if (!db) {
		for (const row of memoryStore.values()) {
			if (
				row.campaignId === campaignId &&
				row.imsOrgId === scope.imsOrgId &&
				row.ajoSandbox === scope.ajoSandbox &&
				row.remoteTemplateId
			) {
				return row.remoteTemplateId;
			}
		}
		return undefined;
	}

	const row = await db
		.prepare(
			`SELECT remote_template_id FROM email_status
			WHERE campaign_id = ? AND ims_org_id = ? AND ajo_sandbox = ?
			ORDER BY updated_at DESC LIMIT 1`
		)
		.bind(campaignId, scope.imsOrgId, scope.ajoSandbox)
		.first<{ remote_template_id: string | null }>();

	return row?.remote_template_id ?? undefined;
}

export async function listEmailStatusForCfUuids(
	db: DbLike | undefined,
	scope: StatusScope,
	cfUuids: string[]
): Promise<Map<string, EmailStatusRow>> {
	const result = new Map<string, EmailStatusRow>();
	const ids = [...new Set(cfUuids.filter(Boolean))];
	if (ids.length === 0) return result;

	if (!db) {
		for (const id of ids) {
			const row = memoryStore.get(memoryKey(scope, id));
			if (row) result.set(id, row);
		}
		return result;
	}

	const placeholders = ids.map(() => '?').join(', ');
	const rows = await db
		.prepare(
			`SELECT cf_uuid, campaign_id, ims_org_id, ajo_sandbox,
				remote_template_id, last_pushed_at, aem_modified_at, content_hash,
				last_push_error, updated_at
			FROM email_status
			WHERE cf_uuid IN (${placeholders}) AND ims_org_id = ? AND ajo_sandbox = ?`
		)
		.bind(...ids, scope.imsOrgId, scope.ajoSandbox)
		.all<Record<string, unknown>>();

	for (const row of rows.results ?? []) {
		const parsed = rowFromDb(row);
		result.set(parsed.cfUuid, parsed);
	}
	return result;
}

export interface UpsertPushSuccessInput {
	cfUuid: string;
	campaignId: string;
	scope: StatusScope;
	remoteTemplateId: string;
	aemModifiedAt: string;
	content: string;
}

export async function upsertPushSuccess(
	db: DbLike | undefined,
	input: UpsertPushSuccessInput
): Promise<void> {
	const now = new Date().toISOString();
	const contentHash = await hashContent(input.content);
	const row: EmailStatusRow = {
		cfUuid: input.cfUuid,
		campaignId: input.campaignId,
		imsOrgId: input.scope.imsOrgId,
		ajoSandbox: input.scope.ajoSandbox,
		remoteTemplateId: input.remoteTemplateId,
		lastPushedAt: now,
		aemModifiedAt: input.aemModifiedAt,
		contentHash,
		lastPushError: null,
		updatedAt: now
	};

	if (!db) {
		memoryStore.set(memoryKey(input.scope, input.cfUuid), row);
		return;
	}

	await db
		.prepare(
			`INSERT INTO email_status (
				cf_uuid, campaign_id, ims_org_id, ajo_sandbox,
				remote_template_id, last_pushed_at, aem_modified_at, content_hash,
				last_push_error, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
			ON CONFLICT (cf_uuid, ims_org_id, ajo_sandbox) DO UPDATE SET
				campaign_id = excluded.campaign_id,
				remote_template_id = excluded.remote_template_id,
				last_pushed_at = excluded.last_pushed_at,
				aem_modified_at = excluded.aem_modified_at,
				content_hash = excluded.content_hash,
				last_push_error = NULL,
				updated_at = excluded.updated_at`
		)
		.bind(
			input.cfUuid,
			input.campaignId,
			input.scope.imsOrgId,
			input.scope.ajoSandbox,
			input.remoteTemplateId,
			now,
			input.aemModifiedAt,
			contentHash,
			now
		)
		.run();
}

export interface RecordPushFailureInput {
	cfUuid: string;
	campaignId: string;
	scope: StatusScope;
	error: string;
	remoteTemplateId?: string;
	aemModifiedAt?: string;
}

export async function recordPushFailure(
	db: DbLike | undefined,
	input: RecordPushFailureInput
): Promise<void> {
	const now = new Date().toISOString();

	if (!db) {
		const key = memoryKey(input.scope, input.cfUuid);
		const existing = memoryStore.get(key);
		memoryStore.set(key, {
			cfUuid: input.cfUuid,
			campaignId: input.campaignId,
			imsOrgId: input.scope.imsOrgId,
			ajoSandbox: input.scope.ajoSandbox,
			remoteTemplateId: input.remoteTemplateId ?? existing?.remoteTemplateId ?? null,
			lastPushedAt: existing?.lastPushedAt ?? null,
			aemModifiedAt: input.aemModifiedAt ?? existing?.aemModifiedAt ?? null,
			contentHash: existing?.contentHash ?? null,
			lastPushError: input.error,
			updatedAt: now
		});
		return;
	}

	await db
		.prepare(
			`INSERT INTO email_status (
				cf_uuid, campaign_id, ims_org_id, ajo_sandbox,
				remote_template_id, last_pushed_at, aem_modified_at, content_hash,
				last_push_error, updated_at
			) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)
			ON CONFLICT (cf_uuid, ims_org_id, ajo_sandbox) DO UPDATE SET
				campaign_id = excluded.campaign_id,
				last_push_error = excluded.last_push_error,
				updated_at = excluded.updated_at`
		)
		.bind(
			input.cfUuid,
			input.campaignId,
			input.scope.imsOrgId,
			input.scope.ajoSandbox,
			input.remoteTemplateId ?? null,
			input.aemModifiedAt ?? null,
			input.error,
			now
		)
		.run();
}

export async function clearRemoteTemplateLink(
	db: DbLike | undefined,
	scope: StatusScope,
	cfUuid: string
): Promise<boolean> {
	if (!cfUuid) return false;

	const now = new Date().toISOString();

	if (!db) {
		const key = memoryKey(scope, cfUuid);
		const existing = memoryStore.get(key);
		if (!existing?.remoteTemplateId) return false;
		memoryStore.set(key, {
			...existing,
			remoteTemplateId: null,
			lastPushedAt: null,
			contentHash: null,
			lastPushError: null,
			updatedAt: now
		});
		return true;
	}

	const result = await db
		.prepare(
			`UPDATE email_status SET
				remote_template_id = NULL,
				last_pushed_at = NULL,
				content_hash = NULL,
				last_push_error = NULL,
				updated_at = ?
			WHERE cf_uuid = ? AND ims_org_id = ? AND ajo_sandbox = ?
				AND remote_template_id IS NOT NULL`
		)
		.bind(now, cfUuid, scope.imsOrgId, scope.ajoSandbox)
		.run();

	return (result.meta.changes ?? 0) > 0;
}

export function clearEmailStatusMemoryStore(): void {
	memoryStore.clear();
}

export function getDb(platform: App.Platform | undefined): DbLike | undefined {
	return platform?.env?.DB;
}

export function statusScopeFromEnv(env?: {
	IMS_ORG_ID?: string;
	AJO_SANDBOX?: string;
	AJO_SANDBOX_NAME?: string;
}): StatusScope {
	return {
		imsOrgId: env?.IMS_ORG_ID?.trim() ?? '',
		ajoSandbox: env?.AJO_SANDBOX_NAME?.trim() || env?.AJO_SANDBOX?.trim() || 'prod'
	};
}
