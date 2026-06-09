// AJO export: parse load tags → resolve UUIDs → rewrite → compile HTML.

import {
	fetchAuthorFragmentRawById,
	fetchAuthorFragmentRawByPath
} from '$lib/aem/author.js';
import { aemClientOptions, authorHostUrl, publishHostRepoId, type AppEnv } from '$lib/aem/env.js';
import { renderTemplateSource } from '$lib/render/compile-template.js';
import { compileMJML } from '$lib/render/mjml.js';
import {
	buildLetFragmentTag,
	hoistLetFragmentTagsInHtml,
	parseLoadTags,
	stripLoadTags,
	type ParsedLoadTag
} from '$lib/render/ajo-load-tags.js';
import { resolveLoadTagRefs } from '$lib/render/ajo-ref-resolver.js';
import { applyDynamicMediaImageUrls } from '$lib/render/ajo-dynamic-media.js';
import { normalizeAjoPersonalizationSyntax, wrapAjoControlTagsForMjml } from '$lib/render/ajo-export.js';
import { ensureLoadTagsInTemplate, restoreCfReferencePaths } from '$lib/render/ajo-load-inject.js';
import { stripLetStatements } from '$lib/render/let-bindings.js';
import { applyPreviewFragments } from '$lib/fragments/preview.js';
import type { TemplateDefinition } from '$lib/templates/registry.js';
import type { AuthorFragment } from '$lib/types/aem.js';
import { validateAjoExport, type AjoExportValidationError } from './validate.js';

export interface AjoTransformResult {
	html: string;
	repoId: string;
	loadTags: ParsedLoadTag[];
	injectedLoadTags: Array<{ varName: string; refExpression: string }>;
	resolvedCount: number;
	validationErrors: AjoExportValidationError[];
}

export interface AjoTransformInput {
	mjml: string;
	campaignId: string;
	campaignFragment?: AuthorFragment;
	templateDefinition?: TemplateDefinition;
	env?: AppEnv;
	imsOrgId: string;
	ajoSandboxName: string;
}

export async function transformTemplateForAjo(input: AjoTransformInput): Promise<AjoTransformResult> {
	const env = input.env;
	const opts = aemClientOptions(env);
	const repoId = publishHostRepoId(env);

	const campaign = input.campaignFragment ?? (await loadCampaignFragment(input, opts, env));

	const { mjml: preparedMjml, injected } = ensureLoadTagsInTemplate(
		input.mjml,
		input.templateDefinition,
		campaign ?? undefined
	);

	const loadTags = parseLoadTags(preparedMjml);
	if (loadTags.length === 0) {
		return {
			html: '',
			repoId,
			loadTags: [],
			injectedLoadTags: injected,
			resolvedCount: 0,
			validationErrors: [
				{
					code: 'leftover_load_tags',
					message:
						'No content fragment bindings found. Template must use {{ cf.field }} or {% load %} tags.'
				}
			]
		};
	}
	if (!campaign) {
		return {
			html: '',
			repoId,
			loadTags,
			injectedLoadTags: injected,
			resolvedCount: 0,
			validationErrors: [
				{
					code: 'unresolved_refs',
					message: 'Could not load campaign content fragment from AEM.'
				}
			]
		};
	}

	const { resolved, errors: resolutionErrors } = await resolveLoadTagRefs(
		loadTags.map((t) => ({ varName: t.varName, refExpression: t.refExpression })),
		campaign,
		opts,
		env
	);

	const nestedCfRefLoads = loadTags.filter(isNestedCfReferenceLoad);
	const activeLoadTags = loadTags.filter((tag) => !isNestedCfReferenceLoad(tag));

	const letTags = activeLoadTags.flatMap((tag) => {
		const match = resolved.find((r) => r.varName === tag.varName);
		if (!match) return [];
		return [buildLetFragmentTag(tag.varName, match.uuid, repoId)];
	});

	let transformedMjml = stripLetStatements(
		stripLoadTags(
			preparedMjml,
			loadTags.map((tag) => tag.raw)
		)
	);
	if (nestedCfRefLoads.length > 0) {
		transformedMjml = restoreCfReferencePaths(
			transformedMjml,
			nestedCfRefLoads.map((tag) => tag.varName)
		);
	}
	const wrappedMjml = wrapAjoControlTagsForMjml(transformedMjml);
	const compileResult = await compileMJML(wrappedMjml, { minify: false });
	const html = applyDynamicMediaImageUrls(
		normalizeAjoPersonalizationSyntax(
			hoistLetFragmentTagsInHtml(compileResult.html ?? '', letTags)
		),
		campaign,
		activeLoadTags,
		env
	);

	const validationErrors = await validateAjoExport(
		{
			transformedTemplate: transformedMjml,
			resolutionErrors,
			resolvedRefs: resolved,
			imsOrgId: input.imsOrgId,
			ajoSandboxName: input.ajoSandboxName
		},
		opts,
		env
	);

	if (!compileResult.html) {
		validationErrors.push({
			code: 'leftover_load_tags',
			message: `MJML compilation failed: ${compileResult.errors.map((e) => e.message).join('; ')}`
		});
	}

	return {
		html,
		repoId,
		loadTags,
		injectedLoadTags: injected,
		resolvedCount: resolved.length,
		validationErrors
	};
}

export interface StandaloneAjoTransformResult {
	html: string;
	validationErrors: AjoExportValidationError[];
}

/** Compile template source for AJO without AEM content fragment bindings. */
export async function transformStandaloneMjmlForAjo(input: {
	mjml: string;
	env?: AppEnv;
	sourceFormat?: 'mjml' | 'html';
}): Promise<StandaloneAjoTransformResult> {
	const sourceFormat = input.sourceFormat ?? 'mjml';
	const mjmlWithFragments = await applyPreviewFragments(input.mjml, input.env);
	const validationErrors: AjoExportValidationError[] = [];

	if (sourceFormat === 'html') {
		const renderResult = await renderTemplateSource(mjmlWithFragments, {
			cf: {},
			profile: {},
			preserveProfile: true,
			static: { year: new Date().getFullYear() }
		}, {
			sourceFormat: 'html',
			applyFragments: false
		});
		const html = normalizeAjoPersonalizationSyntax(renderResult.html ?? '');
		if (!renderResult.html) {
			validationErrors.push({
				code: 'leftover_load_tags',
				message: `HTML render failed: ${renderResult.errors.map((e) => e.message).join('; ')}`
			});
		}
		return { html, validationErrors };
	}

	const wrappedMjml = wrapAjoControlTagsForMjml(mjmlWithFragments);
	const compileResult = await compileMJML(wrappedMjml, { minify: false });
	const html = normalizeAjoPersonalizationSyntax(compileResult.html ?? '');

	if (!compileResult.html) {
		validationErrors.push({
			code: 'leftover_load_tags',
			message: `MJML compilation failed: ${compileResult.errors.map((e) => e.message).join('; ')}`
		});
	}

	return { html, validationErrors };
}

async function loadCampaignFragment(
	input: AjoTransformInput,
	opts: ReturnType<typeof aemClientOptions>,
	env?: AppEnv
): Promise<AuthorFragment | null> {
	if (input.campaignFragment) return input.campaignFragment;

	const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	const authorBase = authorHostUrl(env);
	if (!authorBase) return null;

	const authorOpts = { ...opts, baseUrl: authorBase };

	if (UUID_RE.test(input.campaignId)) {
		const r = await fetchAuthorFragmentRawById(input.campaignId, authorOpts, env);
		return r.data ?? null;
	}

	const path = input.campaignId.startsWith('/content/')
		? input.campaignId
		: `${env?.AEM_CAMPAIGNS_PATH ?? '/content/dam/email/en/campaigns'}/${input.campaignId}`;

	const r = await fetchAuthorFragmentRawByPath(path, authorOpts, env);
	return r.data ?? null;
}

/** this.fieldName loads (not indexed) are nested CF refs — AJO resolves them via the main cf fragment. */
function isNestedCfReferenceLoad(tag: ParsedLoadTag): boolean {
	return tag.varName !== 'cf' && /^this\.[A-Za-z_]\w*$/.test(tag.refExpression);
}
