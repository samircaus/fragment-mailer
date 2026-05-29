export type EmailSyncStatus = 'never_pushed' | 'synced' | 'stale';

export interface EmailStatusRow {
	cfUuid: string;
	campaignId: string;
	imsOrgId: string;
	ajoSandbox: string;
	remoteTemplateId: string | null;
	lastPushedAt: string | null;
	aemModifiedAt: string | null;
	contentHash: string | null;
	lastPushError: string | null;
	updatedAt: string;
}

export interface EmailStatusInfo {
	syncStatus: EmailSyncStatus;
	remoteTemplateId?: string;
	lastPushedAt?: string;
	lastPushError?: string;
}

export interface StatusScope {
	imsOrgId: string;
	ajoSandbox: string;
}

export function deriveSyncStatus(
	row: EmailStatusRow | null | undefined,
	aemUpdatedAt: string
): EmailSyncStatus {
	if (!row?.remoteTemplateId) return 'never_pushed';

	if (row.aemModifiedAt && aemUpdatedAt) {
		const pushed = Date.parse(row.aemModifiedAt);
		const current = Date.parse(aemUpdatedAt);
		if (!Number.isNaN(pushed) && !Number.isNaN(current) && current > pushed) {
			return 'stale';
		}
	}

	return 'synced';
}

export function rowToEmailStatusInfo(
	row: EmailStatusRow | null | undefined,
	aemUpdatedAt: string
): EmailStatusInfo {
	const syncStatus = deriveSyncStatus(row, aemUpdatedAt);
	return {
		syncStatus,
		remoteTemplateId: row?.remoteTemplateId ?? undefined,
		lastPushedAt: row?.lastPushedAt ?? undefined,
		lastPushError: row?.lastPushError ?? undefined
	};
}

export async function hashContent(content: string): Promise<string> {
	const data = new TextEncoder().encode(content);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	return [...new Uint8Array(hashBuffer)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}
