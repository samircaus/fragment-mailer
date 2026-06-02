import type { AppEnv } from '$lib/aem/env.js';
import { loadTemplate, type TemplateResult } from '$lib/templates/service.js';
import { resolveTemplateAssetsForCampaign } from '$lib/templates/resolve-from-aem.js';
import type { StoredTemplateEntry } from '$lib/templates/types.js';
import type { App } from '@sveltejs/kit';

export interface CampaignTemplateBundle extends StoredTemplateEntry {
	/** Fields / UE assets were taken from AEM Author for this request. */
	fieldsFromAem: boolean;
}

/** Load stored MJML + merge template field metadata from the campaign CF model in AEM. */
export async function loadTemplateForCampaign(
	platform: App.Platform | undefined,
	templateId: string,
	cfModelPath: string,
	env?: AppEnv
): Promise<TemplateResult<CampaignTemplateBundle>> {
	const templateResult = await loadTemplate(platform, templateId);
	if (templateResult.error || !templateResult.data) {
		return { error: templateResult.error ?? `Template "${templateId}" not found` };
	}

	const assets = await resolveTemplateAssetsForCampaign({
		stored: templateResult.data,
		cfModelPath,
		env
	});

	return {
		data: {
			...templateResult.data,
			definition: assets.definition,
			componentDefinition: assets.componentDefinition,
			componentModels: assets.componentModels,
			fieldsFromAem: assets.fromAem
		}
	};
}
