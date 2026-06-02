import { resolveAuthorModel } from '$lib/aem/author.js';
import { aemClientOptions, authorHostUrl, type AppEnv } from '$lib/aem/env.js';
import { syncTemplateFromAemModel } from '$lib/templates/cf-fields.js';
import type {
	ComponentDefinitionDoc,
	ComponentModelDoc,
	StoredTemplateEntry,
	TemplateDefinition
} from '$lib/templates/types.js';

export interface ResolvedTemplateAssets {
	definition: TemplateDefinition;
	componentDefinition: ComponentDefinitionDoc | null;
	componentModels: ComponentModelDoc | null;
	/** True when fields / UE assets were rebuilt from the live AEM CF model. */
	fromAem: boolean;
}

export interface ResolveTemplateAssetsInput {
	stored: Pick<StoredTemplateEntry, 'definition' | 'componentDefinition' | 'componentModels'>;
	/** CF model path from the campaign fragment (e.g. /conf/.../models/offer). */
	cfModelPath: string;
	env?: AppEnv;
}

/**
 * Prefer AEM Author CF model for template fields + UE assets (same source as content-model dialog).
 * Falls back to stored template when Author is unavailable.
 */
export async function resolveTemplateAssetsForCampaign(
	input: ResolveTemplateAssetsInput
): Promise<ResolvedTemplateAssets> {
	const { stored, cfModelPath, env } = input;
	const fallback: ResolvedTemplateAssets = {
		definition: stored.definition,
		componentDefinition: stored.componentDefinition,
		componentModels: stored.componentModels,
		fromAem: false
	};

	const authorBase = authorHostUrl(env);
	if (!authorBase) return fallback;

	const modelKey =
		cfModelPath.split('/').filter(Boolean).pop()?.replace(/\.json$/i, '') ??
		stored.definition.cfModel;
	if (!modelKey) return fallback;

	const authorOpts = aemClientOptions({ ...env, AEM_BASE_URL: authorBase });
	const modelResult = await resolveAuthorModel(modelKey, authorOpts, env);
	if (!modelResult.data) return fallback;

	const synced = syncTemplateFromAemModel({
		aemModel: modelResult.data,
		templateId: stored.definition.id,
		existingDefinition: stored.definition
	});

	return {
		definition: synced.definition,
		componentDefinition: synced.componentDefinition,
		componentModels: synced.componentModels,
		fromAem: true
	};
}
