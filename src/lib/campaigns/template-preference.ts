import {
	getCampaignTemplatePref,
	setCampaignTemplatePref
} from '$lib/db/campaign-template-prefs.js';
import { getDb, statusScopeFromEnv } from '$lib/db/email-status.js';
import type { StatusScope } from '$lib/db/email-status-types.js';

export async function resolveCampaignTemplateId(
	platform: App.Platform | undefined,
	campaignId: string,
	inferredTemplateId: string,
	options?: {
		queryTemplateId?: string | null;
		scope?: StatusScope;
	}
): Promise<string> {
	const queryId = options?.queryTemplateId?.trim();
	if (queryId) return queryId;

	const env = platform?.env;
	const scope = options?.scope ?? statusScopeFromEnv(env);
	const db = getDb(platform);
	const stored = await getCampaignTemplatePref(db, scope, campaignId);
	if (stored) return stored;

	return inferredTemplateId || 'promo';
}

export async function saveCampaignTemplatePreference(
	platform: App.Platform | undefined,
	campaignId: string,
	templateId: string
): Promise<void> {
	const scope = statusScopeFromEnv(platform?.env);
	const db = getDb(platform);
	await setCampaignTemplatePref(db, scope, campaignId, templateId);
}
