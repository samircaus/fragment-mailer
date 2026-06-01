// Build the `cf` object passed to the template resolver.

export function buildRenderCfContext(
	fields: Record<string, unknown>,
	assetBaseUrl?: string
): Record<string, unknown> {
	const context: Record<string, unknown> = structuredClone(fields);
	if (assetBaseUrl) {
		absolutizeRelativeUrls(context, assetBaseUrl.replace(/\/$/, ''));
	}
	return context;
}

function absolutizeRelativeUrls(node: unknown, base: string): void {
	if (Array.isArray(node)) {
		for (let i = 0; i < node.length; i++) {
			const value = node[i];
			if (typeof value === 'string' && value.startsWith('/')) {
				node[i] = `${base}${value}`;
			} else {
				absolutizeRelativeUrls(value, base);
			}
		}
		return;
	}

	if (!node || typeof node !== 'object') return;

	for (const key of Object.keys(node as Record<string, unknown>)) {
		const record = node as Record<string, unknown>;
		const value = record[key];
		if (typeof value === 'string' && value.startsWith('/')) {
			record[key] = `${base}${value}`;
		} else {
			absolutizeRelativeUrls(value, base);
		}
	}
}
