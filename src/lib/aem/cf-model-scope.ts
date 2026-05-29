/** Map a DAM campaigns folder to its AEM configuration root (e.g. /content/dam/email → /conf/email). */
export function confRootFromDamFolder(damPath: string): string | null {
	const normalized = damPath.trim().replace(/\/$/, '');
	const match = normalized.match(/^\/content\/dam\/([^/]+)/i);
	if (!match?.[1]) return null;
	return `/conf/${match[1]}`;
}

export function cfmModelsPrefixForConfRoot(confRoot: string): string {
	return `${confRoot.replace(/\/$/, '')}/settings/dam/cfm/models`;
}

export interface CfModelListItem {
	id: string;
	path?: string;
	name?: string;
	title?: string;
}

/** Keep models under the conf tree that backs the campaigns DAM folder. */
export function filterModelsForCampaignsFolder(
	models: CfModelListItem[],
	campaignsPath: string
): CfModelListItem[] {
	const confRoot = confRootFromDamFolder(campaignsPath);
	if (!confRoot) return models;

	const prefix = cfmModelsPrefixForConfRoot(confRoot);
	const scoped = models.filter((model) => {
		const path = model.path?.trim();
		return path != null && (path === prefix || path.startsWith(`${prefix}/`));
	});

	return scoped.length > 0 ? scoped : models;
}

export function modelDisplayLabel(model: CfModelListItem): string {
	return model.title?.trim() || model.name?.trim() || model.id;
}

/** AEM Sites CF API model id is often a base64-encoded JCR path — decode for display. */
export function normalizeCfModelPath(pathOrId: string): string {
	const trimmed = pathOrId.trim();
	if (!trimmed || trimmed.startsWith('/')) return trimmed;

	try {
		const padded = trimmed + '='.repeat((4 - (trimmed.length % 4)) % 4);
		const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
		const decoded = decodeURIComponent(
			Array.from(atob(base64), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')
		);
		if (decoded.startsWith('/')) return decoded;
	} catch {
		// keep original when not decodable base64
	}

	return trimmed;
}
