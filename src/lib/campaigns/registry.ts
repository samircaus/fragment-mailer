import type { EmailStatusInfo } from '$lib/db/email-status-types.js';

export interface Campaign {
	id: string;
	name: string;
	templateId: string;
	cfPath: string;
	/** AEM Sites CF UUID for Experience Cloud editor deep links */
	cfUuid?: string;
	status: string;
}

export interface CampaignSummary {
	id: string;
	name: string;
	cfPath: string;
	cfUuid?: string;
	templateId: string;
	status: string;
	updatedAt: string;
	emailStatus?: EmailStatusInfo;
}
