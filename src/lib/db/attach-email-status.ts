import type { CampaignSummary } from '$lib/campaigns/registry.js';
import { rowToEmailStatusInfo, type EmailStatusRow } from '$lib/db/email-status-types.js';

export function attachEmailStatusToSummaries(
	summaries: CampaignSummary[],
	statusByCfUuid: Map<string, EmailStatusRow>
): CampaignSummary[] {
	return summaries.map((summary) => {
		const cfUuid = summary.cfUuid;
		if (!cfUuid) return summary;

		const row = statusByCfUuid.get(cfUuid);
		const emailStatus = rowToEmailStatusInfo(row, summary.updatedAt);
		const status = emailStatus.syncStatus;

		return { ...summary, status, emailStatus };
	});
}

export interface SyncStatusMeta {
	label: string;
	hint: string;
}

export function syncStatusMeta(syncStatus: string): SyncStatusMeta {
	switch (syncStatus) {
		case 'synced':
			return {
				label: 'Synced',
				hint: 'Pushed to AJO and matches current AEM content'
			};
		case 'stale':
			return {
				label: 'Update Needed',
				hint: 'AEM content changed since the last push to AJO'
			};
		case 'never_pushed':
			return {
				label: 'Not Pushed',
				hint: 'This campaign has not been pushed to AJO yet'
			};
		default:
			return { label: syncStatus, hint: '' };
	}
}

export function displayStatusLabel(syncStatus: string): string {
	return syncStatusMeta(syncStatus).label;
}

export function displayStatusHint(syncStatus: string): string {
	return syncStatusMeta(syncStatus).hint;
}
