import { fetchCampaignFragmentAtPath, fetchCampaignFragmentById, listCampaignFragments } from '$lib/aem/delivery.js';
import { campaignsFolder, isMockMode, type AppEnv } from '$lib/aem/env.js';
import { normalizeCF } from '$lib/aem/client.js';
import type { CFFragment } from '$lib/aem/types.js';
import type { ContentFragmentItem } from '$lib/aem/types.js';
import {
	loadCampaign,
	listMockCampaigns,
	type Campaign,
	type CampaignSummary
} from './registry.js';

export type { CampaignSummary };

type Result<T> = { data: T; error?: never } | { error: string; data?: never };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listCampaigns(env?: AppEnv): Promise<Result<CampaignSummary[]>> {
	if (isMockMode(env)) {
		return { data: listMockCampaigns() };
	}

	const listResult = await listCampaignFragments(env);
	if (listResult.error || !listResult.data) return listResult;

	return { data: listResult.data.map((item) => itemToSummary(item)) };
}

export async function getCampaignWithCF(
	id: string,
	env?: AppEnv
): Promise<Result<{ campaign: Campaign; cf: ReturnType<typeof normalizeCF> }>> {
	if (isMockMode(env)) {
		const campaign = loadCampaign(id);
		if (!campaign) return { error: `Campaign "${id}" not found` };
		const cfResult = await fetchCampaignFragmentAtPath(campaign.cfPath, env);
		if (cfResult.error || !cfResult.data) return cfResult;
		return { data: { campaign, cf: normalizeCF(cfResult.data) } };
	}

	const fragmentResult = UUID_RE.test(id)
		? await fetchCampaignFragmentById(id, env)
		: await fetchCampaignFragmentAtPath(resolveCampaignPath(id, env), env);

	if (fragmentResult.error || !fragmentResult.data) return fragmentResult;

	const fragment = fragmentResult.data;
	const campaign = fragmentToCampaign(fragment, id);
	return { data: { campaign, cf: normalizeCF(fragment) } };
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

	return {
		id: slug,
		name,
		templateId,
		cfPath: path,
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

	// Offer model from AEM CF structure:
	// _model._path: /conf/.../cfm/models/offer
	// fields: title, bannerImage, emailCopy, ctaLabel, ctaLink
	if (modelPathLower.includes('/models/offer') || modelTitleLower === 'offer') {
		return 'offer';
	}

	const hasOfferFields = 'emailCopy' in fragmentLike && 'bannerImage' in fragmentLike;
	if (hasOfferFields) {
		return 'offer';
	}

	return 'promo';
}
