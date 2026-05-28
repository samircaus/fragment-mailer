// AEM Content Fragment Delivery API client.
// Uses the Content Fragment Delivery OpenAPI on Publish:
//   GET /adobe/contentFragments?path=...
//   GET /adobe/contentFragments/{id}?references=direct-hydrated

import type {
	CFDeliveryResponse,
	CFFragment,
	ContentFragmentField,
	ContentFragmentItem,
	ContentFragmentListResponse,
	ResolvedCFData
} from './types.js';

export interface AEMClientOptions {
	baseUrl: string;
	apiKey?: string;
	serviceToken?: string;
	mockMode?: boolean;
}

type Result<T> = { data: T; error?: never } | { error: string; data?: never };

const ERROR_SNIPPET_MAX = 400;

function deliveryHeaders(opts: AEMClientOptions): Record<string, string> {
	const headers: Record<string, string> = {
		Accept: 'application/json'
	};
	if (opts.apiKey) headers['X-Api-Key'] = opts.apiKey;
	if (opts.serviceToken) headers['Authorization'] = `Bearer ${opts.serviceToken}`;
	return headers;
}

/** List email campaign fragments in a DAM folder. */
export async function listContentFragments(
	folderPath: string,
	opts: AEMClientOptions
): Promise<Result<ContentFragmentItem[]>> {
	if (opts.mockMode) {
		return listMockContentFragments();
	}

	const url = `${opts.baseUrl}/adobe/contentFragments?path=${encodeURIComponent(folderPath)}`;
	const res = await fetch(url, { headers: deliveryHeaders(opts) });
	if (!res.ok) {
		const responseSnippet = await readResponseSnippet(res);
		console.error(
			JSON.stringify({
				event: 'aem_list_failed',
				url,
				status: res.status,
				folderPath,
				hasApiKey: Boolean(opts.apiKey),
				responseSnippet
			})
		);
		const hint =
			res.status === 404
				? ' Check that Content Fragment Delivery OpenAPI is enabled on Publish and Dispatcher allows /adobe/contentFragments*.'
				: res.status === 401 || res.status === 403
					? ' Publish may require a CDN Edge Key — set AEM_API_KEY in .dev.vars.'
					: '';
		return {
			error: `AEM list failed ${res.status} for path: ${folderPath}.${hint} Body: ${responseSnippet}`
		};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(await res.text()) as unknown;
	} catch {
		console.error(
			JSON.stringify({
				event: 'aem_list_invalid_json',
				url,
				status: res.status,
				folderPath
			})
		);
		return {
			error: `AEM list returned invalid JSON for path: ${folderPath}. Expected JSON matching Content Fragment Delivery OpenAPI.`
		};
	}

	const items = extractContentFragmentList(parsed);
	return { data: items };
}

function extractContentFragmentList(body: unknown): ContentFragmentItem[] {
	if (Array.isArray(body)) {
		return body as ContentFragmentItem[];
	}
	if (body && typeof body === 'object') {
		const o = body as Record<string, unknown>;
		for (const key of ['items', 'data', 'results', 'fragments']) {
			const arr = o[key];
			if (Array.isArray(arr)) {
				return arr as ContentFragmentItem[];
			}
		}
	}
	return [];
}

async function readResponseSnippet(res: Response): Promise<string> {
	try {
		const text = (await res.text()).replace(/\s+/g, ' ').trim();
		if (!text) return '[empty response body]';
		return text.slice(0, ERROR_SNIPPET_MAX);
	} catch {
		return '[unable to read response body]';
	}
}

/** Fetch a single CF by UUID with direct reference hydration. */
export async function fetchCFById(id: string, opts: AEMClientOptions): Promise<Result<CFFragment>> {
	if (opts.mockMode) {
		return fetchMockCFById(id);
	}

	const url = `${opts.baseUrl}/adobe/contentFragments/${encodeURIComponent(id)}?references=direct-hydrated`;
	const res = await fetch(url, { headers: deliveryHeaders(opts) });
	if (!res.ok) {
		return { error: `AEM CF fetch failed ${res.status} for id: ${id}` };
	}

	const body = (await res.json()) as ContentFragmentItem;
	return { data: contentFragmentToCFFragment(body) };
}

// Fetch a single CF by its DAM path.
// path format: /content/dam/email/en/campaigns/welcome-series-1
export async function fetchCF(path: string, opts: AEMClientOptions): Promise<Result<CFFragment>> {
	if (opts.mockMode) {
		return fetchMockCF(path);
	}

	const url = `${opts.baseUrl}/adobe/contentFragments?path=${encodeURIComponent(path)}`;
	const res = await fetch(url, { headers: deliveryHeaders(opts) });
	if (!res.ok) {
		return { error: `AEM CF fetch failed ${res.status} for path: ${path}` };
	}

	const body = (await res.json()) as ContentFragmentListResponse | ContentFragmentItem;
	const item = Array.isArray((body as ContentFragmentListResponse).items)
		? (body as ContentFragmentListResponse).items![0]
		: ((body as ContentFragmentListResponse).data?.[0] ??
			(!(body as ContentFragmentListResponse).items && !(body as ContentFragmentListResponse).data
				? (body as ContentFragmentItem)
				: undefined));

	if (!item) {
		return { error: `No CF found at path: ${path}` };
	}
	return { data: contentFragmentToCFFragment(item) };
}

// Normalize a raw CF response into a consistent internal shape.
export function normalizeCF(fragment: CFFragment): ResolvedCFData {
	const { _path, _model, _metadata, ...fields } = fragment;

	const version =
		_metadata?.stringMetadata?.find((m) => m.name === 'cq:lastModified')?.value ?? 'unknown';

	const cleanFields: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(fields)) {
		if (!key.startsWith('_') && key !== 'title' && key !== 'id') {
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

/** Convert a delivery API item into the internal CFFragment shape. */
export function contentFragmentToCFFragment(item: ContentFragmentItem): CFFragment {
	const path = item.path ?? item._path ?? '';
	const flatFields = flattenFragmentFields(item.fields);

	return {
		_path: path,
		_model: item._model ?? {
			_path: '/conf/global/settings/dam/cfm/models/email-campaign',
			title: 'Email Campaign'
		},
		_variation: item._variation ?? 'master',
		_metadata: item._metadata ?? { stringMetadata: [] },
		title: item.title,
		id: item.id,
		...flatFields,
		// Preserve nested hydrated references (e.g. featuredOffer)
		...extractNestedReferences(item)
	};
}

function flattenFragmentFields(
	fields: Record<string, unknown> | ContentFragmentField[] | undefined
): Record<string, unknown> {
	if (!fields) return {};
	if (Array.isArray(fields)) {
		const out: Record<string, unknown> = {};
		for (const field of fields) {
			const val = field.values?.[0] ?? field.value;
			if (val !== undefined) out[field.name] = val;
		}
		return out;
	}
	return { ...fields };
}

/** Pull nested reference objects off the top-level item (hydrated refs). */
function extractNestedReferences(item: ContentFragmentItem): Record<string, unknown> {
	const skip = new Set([
		'id',
		'path',
		'title',
		'modified',
		'fields',
		'_path',
		'_model',
		'_variation',
		'_metadata'
	]);
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(item)) {
		if (!skip.has(key) && typeof value === 'object' && value !== null && !Array.isArray(value)) {
			out[key] = value;
		}
	}
	return out;
}

// --- Mock support ---

async function listMockContentFragments(): Promise<Result<ContentFragmentItem[]>> {
	try {
		const mod = await import('../../../tests/fixtures/sample-campaigns.json', {
			with: { type: 'json' }
		});
		const campaigns = Object.values(
			mod.default as Record<
				string,
				{
					id: string;
					name: string;
					cfPath: string;
					updatedAt: string;
				}
			>
		);
		return {
			data: campaigns.map((c) => ({
				id: c.id,
				path: c.cfPath,
				title: c.name,
				modified: c.updatedAt
			}))
		};
	} catch {
		return { error: 'Mock campaigns not found. Ensure tests/fixtures/sample-campaigns.json exists.' };
	}
}

async function fetchMockCFById(id: string): Promise<Result<CFFragment>> {
	try {
		const mod = await import('../../../tests/fixtures/sample-campaigns.json', {
			with: { type: 'json' }
		});
		const campaigns = mod.default as Record<string, { id: string; cfPath: string }>;
		const entry = Object.values(campaigns).find((c) => c.id === id) ?? campaigns[id];
		if (!entry) return { error: `No mock campaign for id: ${id}` };
		return fetchMockCF(entry.cfPath);
	} catch {
		return { error: 'Mock campaigns not found.' };
	}
}

async function fetchMockCF(path: string): Promise<Result<CFFragment>> {
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
