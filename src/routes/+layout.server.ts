import type { LayoutServerLoad } from './$types';
import { resolveAppEnv } from '$lib/server/app-env.js';

export const load: LayoutServerLoad = async ({ platform, url }) => {
	const env = resolveAppEnv(platform?.env);

	return {
		ue: {
			aemBaseUrl: env?.AEM_BASE_URL ?? null,
			previewUrl: url.toString()
		}
	};
};
