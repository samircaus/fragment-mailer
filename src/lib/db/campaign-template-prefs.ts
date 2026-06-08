import type { D1Database } from '@cloudflare/workers-types';
import type { StatusScope } from './email-status-types.js';

type DbLike = Pick<D1Database, 'prepare' | 'batch'>;

export interface CampaignTemplatePrefRow {
	campaignId: string;
	imsOrgId: string;
	ajoSandbox: string;
	selectedTemplateId: string;
	updatedAt: string;
}

const memoryStore = new Map<string, CampaignTemplatePrefRow>();

function memoryKey(scope: StatusScope, campaignId: string): string {
	return `${scope.imsOrgId}:${scope.ajoSandbox}:${campaignId}`;
}

function rowFromDb(record: Record<string, unknown>): CampaignTemplatePrefRow {
	return {
		campaignId: String(record.campaign_id),
		imsOrgId: String(record.ims_org_id),
		ajoSandbox: String(record.ajo_sandbox),
		selectedTemplateId: String(record.selected_template_id),
		updatedAt: String(record.updated_at)
	};
}

export async function getCampaignTemplatePref(
	db: DbLike | undefined,
	scope: StatusScope,
	campaignId: string
): Promise<string | null> {
	if (!campaignId) return null;

	if (!db) {
		return memoryStore.get(memoryKey(scope, campaignId))?.selectedTemplateId ?? null;
	}

	const row = await db
		.prepare(
			`SELECT selected_template_id FROM campaign_template_prefs
			WHERE campaign_id = ? AND ims_org_id = ? AND ajo_sandbox = ?`
		)
		.bind(campaignId, scope.imsOrgId, scope.ajoSandbox)
		.first<{ selected_template_id: string }>();

	return row?.selected_template_id ?? null;
}

export async function setCampaignTemplatePref(
	db: DbLike | undefined,
	scope: StatusScope,
	campaignId: string,
	selectedTemplateId: string
): Promise<void> {
	const now = new Date().toISOString();
	const row: CampaignTemplatePrefRow = {
		campaignId,
		imsOrgId: scope.imsOrgId,
		ajoSandbox: scope.ajoSandbox,
		selectedTemplateId,
		updatedAt: now
	};

	if (!db) {
		memoryStore.set(memoryKey(scope, campaignId), row);
		return;
	}

	await db
		.prepare(
			`INSERT INTO campaign_template_prefs (
				campaign_id, ims_org_id, ajo_sandbox, selected_template_id, updated_at
			) VALUES (?, ?, ?, ?, ?)
			ON CONFLICT (campaign_id, ims_org_id, ajo_sandbox) DO UPDATE SET
				selected_template_id = excluded.selected_template_id,
				updated_at = excluded.updated_at`
		)
		.bind(campaignId, scope.imsOrgId, scope.ajoSandbox, selectedTemplateId, now)
		.run();
}

export async function clearCampaignTemplatePref(
	db: DbLike | undefined,
	scope: StatusScope,
	campaignId: string
): Promise<void> {
	if (!db) {
		memoryStore.delete(memoryKey(scope, campaignId));
		return;
	}

	await db
		.prepare(
			`DELETE FROM campaign_template_prefs
			WHERE campaign_id = ? AND ims_org_id = ? AND ajo_sandbox = ?`
		)
		.bind(campaignId, scope.imsOrgId, scope.ajoSandbox)
		.run();
}

export function clearCampaignTemplatePrefsMemoryStore(): void {
	memoryStore.clear();
}
