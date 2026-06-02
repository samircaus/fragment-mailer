import type { LayoutServerLoad } from './$types';
import { ajoSandboxName, authorHostUrl, cfEditorTenant } from '$lib/aem/env.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

export const load: LayoutServerLoad = async ({ platform, url }) => {
	const env = resolveAppEnv(platform?.env);
	const authorUrl = authorHostUrl(env) || env?.AEM_BASE_URL?.trim() || null;

	return {
		ue: {
			aemBaseUrl: env?.AEM_BASE_URL ?? null,
			previewUrl: url.toString()
		},
		aem: {
			authorUrl,
			cfEditorTenant: cfEditorTenant(env),
			ajoSandboxName: ajoSandboxName(env),
			campaignsPath: env?.AEM_CAMPAIGNS_PATH?.trim() || '/content/dam/email/en/campaigns'
		}
	};
};
