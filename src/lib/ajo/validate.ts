// Pre-push validation for AJO export.

import {
	fetchAuthorFragmentRawById,
	fetchAuthorFragmentTags,
	fetchAuthorModelTags
} from '$lib/aem/author.js';
import type { AEMClientOptions } from '$lib/aem/client.js';
import {
	ajoEnabledTagFixHint,
	extractModelTags,
	modelHasAjoEnabledTag
} from '$lib/aem/model-tags.js';
import type { AppEnv } from '$lib/aem/env.js';
import { hasUnresolvedLoadTags } from '$lib/render/ajo-load-tags.js';
import type { RefResolutionError, ResolvedFragmentRef } from '$lib/render/ajo-ref-resolver.js';

export interface AjoExportValidationError {
	code:
		| 'unresolved_refs'
		| 'unpublished_fragment'
		| 'missing_ajo_tag'
		| 'leftover_load_tags';
	message: string;
	details?: string[];
}

export interface AjoExportValidationInput {
	transformedTemplate: string;
	resolutionErrors: RefResolutionError[];
	resolvedRefs: ResolvedFragmentRef[];
	imsOrgId: string;
	ajoSandboxName: string;
}

async function collectAjoTagsForRef(
	ref: ResolvedFragmentRef,
	fragment: { model?: { id?: string; title?: string }; path: string },
	opts: AEMClientOptions,
	env?: AppEnv
): Promise<{ tags: string[]; sources: string[]; errors: string[] }> {
	const tags = new Set<string>();
	const sources: string[] = [];
	const errors: string[] = [];

	const modelId = ref.modelId || fragment.model?.id;
	if (modelId) {
		const modelTagsResult = await fetchAuthorModelTags(modelId, opts, env);
		if (modelTagsResult.error) {
			errors.push(`model tags: ${modelTagsResult.error}`);
		} else if (modelTagsResult.data) {
			const parsed = extractModelTags(modelTagsResult.data);
			if (parsed.length) {
				sources.push('model');
				for (const t of parsed) tags.add(t);
			}
		}
	}

	const fragmentTagsResult = await fetchAuthorFragmentTags(ref.uuid, opts, env);
	if (fragmentTagsResult.error) {
		errors.push(`fragment tags: ${fragmentTagsResult.error}`);
	} else if (fragmentTagsResult.data) {
		const parsed = extractModelTags(fragmentTagsResult.data);
		if (parsed.length) {
			sources.push('fragment');
			for (const t of parsed) tags.add(t);
		}
	}

	return { tags: [...tags], sources, errors };
}

export async function validateAjoExport(
	input: AjoExportValidationInput,
	opts: AEMClientOptions,
	env?: AppEnv
): Promise<AjoExportValidationError[]> {
	const errors: AjoExportValidationError[] = [];

	if (input.resolutionErrors.length > 0) {
		errors.push({
			code: 'unresolved_refs',
			message: 'One or more fragment references could not be resolved.',
			details: input.resolutionErrors.map(
				(e) => `${e.varName} (ref='${e.refExpression}'): ${e.message}`
			)
		});
	}

	if (hasUnresolvedLoadTags(input.transformedTemplate)) {
		errors.push({
			code: 'leftover_load_tags',
			message: 'Template still contains unresolved {% load %} tags after transformation.'
		});
	}

	const requiredTag = `ajo-enabled:${input.imsOrgId}/${input.ajoSandboxName}`;

	for (const ref of input.resolvedRefs) {
		const fragmentResult = await fetchAuthorFragmentRawById(ref.uuid, opts, env);
		if (fragmentResult.error || !fragmentResult.data) {
			errors.push({
				code: 'unpublished_fragment',
				message: `Could not verify fragment ${ref.varName}: ${fragmentResult.error ?? 'unknown'}`
			});
			continue;
		}

		const fragment = fragmentResult.data;
		if (!fragment.published?.at && fragment.status?.toLowerCase() !== 'published') {
			errors.push({
				code: 'unpublished_fragment',
				message: `Fragment "${ref.fragmentPath}" (${ref.varName}) is not published on AEM.`,
				details: [`uuid: ${ref.uuid}`]
			});
		}

		const { tags, sources, errors: tagErrors } = await collectAjoTagsForRef(ref, fragment, opts, env);

		if (!modelHasAjoEnabledTag(tags, requiredTag)) {
			const modelId = ref.modelId || fragment.model?.id;
			errors.push({
				code: 'missing_ajo_tag',
				message: `Neither model nor fragment for "${ref.varName}" has required tag "${requiredTag}".`,
				details: [
					`fragment: ${fragment.path} (${ref.uuid})`,
					modelId ? `model: ${fragment.model?.title ?? modelId} (${modelId})` : 'model: unknown',
					tags.length
						? `tags from AEM (${sources.join(' + ') || 'none'}): ${tags.join(', ')}`
						: 'no tags returned from AEM /cf/models/{id}/tags or /cf/fragments/{id}/tags',
					...tagErrors,
					ajoEnabledTagFixHint(requiredTag, fragment.model?.title, modelId)
				]
			});
		}
	}

	return errors;
}
