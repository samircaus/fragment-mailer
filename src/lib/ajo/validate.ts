// Pre-push validation for AJO export.

import { fetchAuthorFragmentRawById, fetchAuthorModel } from '$lib/aem/author.js';
import type { AEMClientOptions } from '$lib/aem/client.js';
import { isMockMode, type AppEnv } from '$lib/aem/env.js';
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

	if (isMockMode(env)) {
		return errors;
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

		const modelId = ref.modelId || fragment.model?.id;
		if (!modelId) {
			errors.push({
				code: 'missing_ajo_tag',
				message: `Fragment "${ref.fragmentPath}" has no model id for AJO tag check.`
			});
			continue;
		}

		const modelResult = await fetchAuthorModel(modelId, opts, env);
		if (modelResult.error || !modelResult.data) {
			errors.push({
				code: 'missing_ajo_tag',
				message: `Could not fetch model for ${ref.varName}: ${modelResult.error ?? 'unknown'}`
			});
			continue;
		}

		const tags = modelResult.data.tags ?? [];
		if (!tags.includes(requiredTag)) {
			errors.push({
				code: 'missing_ajo_tag',
				message: `Model for "${ref.varName}" is missing required tag "${requiredTag}".`,
				details: tags.length ? [`model tags: ${tags.join(', ')}`] : ['model has no tags']
			});
		}
	}

	return errors;
}
