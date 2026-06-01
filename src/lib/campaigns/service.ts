import { fetchCampaignFragmentAtPath, fetchCampaignFragmentById, listCampaignFragments } from '$lib/aem/delivery.js';
import { resolveAuthorModel } from '$lib/aem/author.js';
import { normalizeCfModelPath } from '$lib/aem/cf-model-scope.js';
import { aemClientOptions, authorHostUrl, campaignsFolder, type AppEnv } from '$lib/aem/env.js';
import { normalizeCF } from '$lib/aem/client.js';
import { hydrateUnresolvedFragmentReferences } from '$lib/aem/hydrate-references.js';
import type { CFFragment } from '$lib/aem/types.js';
import type { ContentFragmentItem } from '$lib/aem/types.js';
import { fallbackFieldToInsert } from '$lib/templates/cf-insert.js';
import { buildInsertFieldsForCampaign } from '$lib/templates/cf-insert-fields.js';
import type { TemplateDefinition } from '$lib/templates/types.js';
import type { CfInsertField } from '$lib/templates/cf-insert.js';
import type { AuthorModel } from '$lib/types/aem.js';
import type { Campaign, CampaignSummary } from './registry.js';

export type { CampaignSummary };

export interface CampaignContentModel {
	model: {
		id: string;
		title: string;
		path: string;
	};
	fields: CfInsertField[];
}

type Result<T> = { data: T; error?: never } | { error: string; data?: never };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listCampaigns(env?: AppEnv): Promise<Result<CampaignSummary[]>> {
	const listResult = await listCampaignFragments(env);
	if (listResult.error || !listResult.data) return listResult;

	return { data: listResult.data.map((item) => itemToSummary(item)) };
}

export async function getCampaignWithCF(
	id: string,
	env?: AppEnv
): Promise<Result<{ campaign: Campaign; cf: ReturnType<typeof normalizeCF> }>> {
	const fragmentResult = UUID_RE.test(id)
		? await fetchCampaignFragmentById(id, env)
		: await fetchCampaignFragmentAtPath(resolveCampaignPath(id, env), env);

	if (fragmentResult.error || !fragmentResult.data) return fragmentResult;

	const hydrated = await hydrateUnresolvedFragmentReferences(fragmentResult.data, env);
	const campaign = fragmentToCampaign(hydrated, id);
	return { data: { campaign, cf: normalizeCF(hydrated) } };
}

export async function getCampaignContentModel(
	id: string,
	env?: AppEnv,
	templateDefinition?: TemplateDefinition
): Promise<Result<CampaignContentModel>> {
	const fragmentResult = UUID_RE.test(id)
		? await fetchCampaignFragmentById(id, env)
		: await fetchCampaignFragmentAtPath(resolveCampaignPath(id, env), env);

	if (fragmentResult.error || !fragmentResult.data) return fragmentResult;

	const hydrated = await hydrateUnresolvedFragmentReferences(fragmentResult.data, env);
	const modelPath = normalizeCfModelPath(hydrated._model._path);
	const modelTitle = hydrated._model.title;
	const modelKey = modelPath.split('/').filter(Boolean).pop() ?? modelTitle;
	const normalized = normalizeCF(hydrated);

	const authorBase = authorHostUrl(env);
	const authorOpts = authorBase ? aemClientOptions({ ...env, AEM_BASE_URL: authorBase }) : null;

	let authorModel: AuthorModel | undefined;
	if (authorOpts) {
		const resolved = await resolveAuthorModel(modelKey, authorOpts, env);
		if (resolved.data) {
			authorModel = resolved.data;
		}
	}

	const resolveModel = async (modelKeyToResolve: string): Promise<AuthorModel | null> => {
		if (!authorOpts) return null;
		const resolved = await resolveAuthorModel(modelKeyToResolve, authorOpts, env);
		return resolved.data ?? null;
	};

	let fields: CfInsertField[];
	if (authorModel) {
		const authorModelMeta = authorModel as { path?: string };
		fields = await buildInsertFieldsForCampaign({
			authorModel,
			fragmentFields: normalized.fields,
			templateDefinition,
			resolveModel
		});
		return {
			data: {
				model: {
					id: authorModel.id,
					title: authorModel.title ?? modelTitle,
					path: normalizeCfModelPath(authorModelMeta.path ?? modelPath)
				},
				fields
			}
		};
	}

	fields = await buildInsertFieldsForCampaign({
		fragmentFields: normalized.fields,
		templateDefinition,
		resolveModel
	});

	const skipKeys = new Set(['title', 'id']);
	if (fields.length === 0) {
		fields = Object.keys(normalized.fields)
			.filter(
				(key) =>
					!key.startsWith('_') && !skipKeys.has(key) && !key.endsWith('Html') && !key.endsWith('Url')
			)
			.map((name) => fallbackFieldToInsert(name));
	}

	return {
		data: {
			model: {
				id: modelKey,
				title: modelTitle,
				path: modelPath
			},
			fields
		}
	};
}

function resolveCampaignPath(id: string, env?: AppEnv): string {
	if (id.startsWith('/content/')) return id;
	const folder = campaignsFolder(env);
	return `${folder}/${id}`;
}

function itemToSummary(item: ContentFragmentItem): CampaignSummary {
	const path = item.path ?? item._path ?? '';
	const id = path.split('/').pop() ?? item.id ?? path;
	const modified =
		item.modified ??
		item._metadata?.stringMetadata?.find((m) => m.name === 'cq:lastModified')?.value ??
		new Date().toISOString();
	const templateId = inferTemplateId(item._model?._path, item._model?.title, item);

	return {
		id,
		name: item.title ?? id,
		cfPath: path,
		cfUuid: item.id,
		templateId,
		status: 'draft',
		updatedAt: modified
	};
}

function fragmentToCampaign(fragment: CFFragment, id: string): Campaign {
	const title = typeof fragment.title === 'string' ? fragment.title : undefined;
	const path = fragment._path;
	const slug = path.split('/').pop() ?? id;
	const name = title ?? slug.replace(/-/g, ' ');
	const templateId = inferTemplateId(fragment._model?._path, fragment._model?.title, fragment);

	const cfUuid = typeof fragment.id === 'string' ? fragment.id : undefined;

	return {
		id: slug,
		name,
		templateId,
		cfPath: path,
		cfUuid,
		status: 'draft'
	};
}

function inferTemplateId(
	modelPath: string | undefined,
	modelTitle: string | undefined,
	fragmentLike: Record<string, unknown>
): string {
	const modelPathLower = modelPath?.toLowerCase() ?? '';
	const modelTitleLower = modelTitle?.toLowerCase() ?? '';

	if (modelPathLower.includes('/models/offer') || modelTitleLower === 'offer') {
		return 'offer';
	}

	const hasOfferFields = 'emailCopy' in fragmentLike && 'bannerImage' in fragmentLike;
	if (hasOfferFields) {
		return 'offer';
	}

	return 'promo';
}
