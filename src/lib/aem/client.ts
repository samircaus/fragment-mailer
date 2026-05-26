// AEM Content Fragment Delivery API client.
// Fetches CFs from the AEM Publish tier using the CF Delivery OpenAPI.
//
// Auth: AEM Publish (headless delivery) typically uses an API key or service token.
// The exact auth mechanism depends on the AEM Cloud environment — check with the AEM team.
// TODO(decision): Confirm whether CF Delivery requires IMS service token or just an API key.

import type { CFDeliveryResponse, CFFragment, ResolvedCFData } from './types.js';

export interface AEMClientOptions {
	baseUrl: string;
	apiKey?: string;
	serviceToken?: string;
	mockMode?: boolean;
}

type Result<T> = { data: T; error?: never } | { error: string; data?: never };

// Fetch a single CF by its DAM path.
// path format: /content/dam/campaigns/spring-promo-2025
export async function fetchCF(path: string, opts: AEMClientOptions): Promise<Result<CFFragment>> {
	if (opts.mockMode) {
		return fetchMockCF(path);
	}

	const encoded = encodeURIComponent(path);
	const url = `${opts.baseUrl}/adobe/sites/cf/fragments?path=${encoded}`;

	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};
	if (opts.apiKey) headers['X-Api-Key'] = opts.apiKey;
	if (opts.serviceToken) headers['Authorization'] = `Bearer ${opts.serviceToken}`;

	const res = await fetch(url, { headers });
	if (!res.ok) {
		return { error: `AEM CF fetch failed ${res.status} for path: ${path}` };
	}

	const body = (await res.json()) as CFDeliveryResponse;
	const fragment = body.data?.[0];
	if (!fragment) {
		return { error: `No CF found at path: ${path}` };
	}
	return { data: fragment };
}

// Normalize a raw CF response into a consistent internal shape.
export function normalizeCF(fragment: CFFragment): ResolvedCFData {
	const { _path, _model, _metadata, ...fields } = fragment;

	// Extract version from metadata if present
	const version =
		_metadata?.stringMetadata?.find((m) => m.name === 'cq:lastModified')?.value ?? 'unknown';

	// Strip internal AEM fields from the data surface
	const cleanFields: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(fields)) {
		if (!key.startsWith('_')) {
			cleanFields[key] = value;
		}
	}

	return {
		path: _path,
		modelPath: _model._path,
		version,
		fields: cleanFields
	};
}

// --- Mock support ---

async function fetchMockCF(path: string): Promise<Result<CFFragment>> {
	// Dynamic import of fixtures — bundled with the worker in mock mode
	try {
		const mod = await import('../../../tests/fixtures/sample-cf.json', {
			with: { type: 'json' }
		});
		const fixtures = mod.default as Record<string, CFFragment>;
		const match = fixtures[path] ?? Object.values(fixtures)[0];
		if (!match) return { error: `No mock fixture for path: ${path}` };
		return { data: match };
	} catch {
		return { error: 'Mock fixtures not found. Ensure tests/fixtures/sample-cf.json exists.' };
	}
}
