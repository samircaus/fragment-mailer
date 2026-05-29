import { fetchCampaignFragmentAtPath, fetchCampaignFragmentById, listCampaignFragments } from '$lib/aem/delivery.js';
import { resolveAuthorModel } from '$lib/aem/author.js';
import { normalizeCfModelPath } from '$lib/aem/cf-model-scope.js';
import { aemClientOptions, authorHostUrl, campaignsFolder, type AppEnv } from '$lib/aem/env.js';
import { normalizeCF } from '$lib/aem/client.js';
import type { CFFragment } from '$lib/aem/types.js';
import type { ContentFragmentItem } from '$lib/aem/types.js';
import {
	authorFieldToInsert,
	fallbackFieldToInsert,
	type CfInsertField
} from '$lib/templates/cf-insert.js';
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

	const fragment = fragmentResult.data;
	const campaign = fragmentToCampaign(fragment, id);
	return { data: { campaign, cf: normalizeCF(fragment) } };
}

export async function getCampaignContentModel(
	id: string,
	env?: AppEnv
): Promise<Result<CampaignContentModel>> {
	const fragmentResult = UUID_RE.test(id)
		? await fetchCampaignFragmentById(id, env)
		: await fetchCampaignFragmentAtPath(resolveCampaignPath(id, env), env);

	if (fragmentResult.error || !fragmentResult.data) return fragmentResult;

	const fragment = fragmentResult.data;
	const modelPath = normalizeCfModelPath(fragment._model._path);
	const modelTitle = fragment._model.title;
	const modelKey = modelPath.split('/').filter(Boolean).pop() ?? modelTitle;

	const authorBase = authorHostUrl(env);
	if (authorBase) {
		const resolved = await resolveAuthorModel(
			modelKey,
			aemClientOptions({ ...env, AEM_BASE_URL: authorBase }),
			env
		);
		if (resolved.data) {
			const authorModel = resolved.data as { path?: string };
			return {
				data: {
					model: {
						id: resolved.data.id,
						title: resolved.data.title ?? modelTitle,
						path: normalizeCfModelPath(authorModel.path ?? modelPath)
					},
					fields: resolved.data.fields.map(authorFieldToInsert)
				}
			};
		}
	}

	const normalized = normalizeCF(fragment);
	const skipKeys = new Set(['title', 'id']);
	const fields = Object.keys(normalized.fields)
		.filter((key) => !key.startsWith('_') && !skipKeys.has(key) && !key.endsWith('Html') && !key.endsWith('Url'))
		.map((name) => fallbackFieldToInsert(name));

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
