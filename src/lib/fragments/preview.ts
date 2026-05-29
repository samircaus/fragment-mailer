import type { AppEnv } from '$lib/aem/env.js';
import { resolveFragmentExpression } from '$lib/ajo/fragments-client.js';
import { isAjoConfigured } from '$lib/auth/ajo-token-provider.js';
import {
	BRAND_FOOTER_FRAGMENT_ID,
	DEFAULT_BRAND_FOOTER_EXPRESSION
} from '$lib/fragments/brand-footer.js';
import { collectFragmentIds, inlineFragmentTags } from '$lib/render/fragment-tags.js';

const DEFAULT_FRAGMENTS: Record<string, string> = {
	[BRAND_FOOTER_FRAGMENT_ID]: DEFAULT_BRAND_FOOTER_EXPRESSION
};

export async function loadPreviewFragmentMap(
	template: string,
	env?: AppEnv
): Promise<Record<string, string>> {
	const ids = collectFragmentIds(template);
	if (ids.length === 0) return {};

	const map: Record<string, string> = { ...DEFAULT_FRAGMENTS };

	for (const id of ids) {
		if (env && isAjoConfigured(env)) {
			const live = await resolveFragmentExpression(id, env);
			if (live.data) {
				map[id] = live.data;
				continue;
			}
		}
		if (!map[id]) {
			map[id] = DEFAULT_FRAGMENTS[id] ?? `<!-- fragment "${id}" not found -->`;
		}
	}

	return map;
}

export async function applyPreviewFragments(
	template: string,
	env?: AppEnv
): Promise<string> {
	const fragments = await loadPreviewFragmentMap(template, env);
	return inlineFragmentTags(template, fragments);
}
