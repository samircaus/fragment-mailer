// Resolve {% load ... ref='...' %} expressions against a campaign AuthorFragment.

import {
	fetchAuthorFragmentRawById,
	fetchAuthorFragmentRawByPath
} from '$lib/aem/author.js';
import type { AEMClientOptions } from '$lib/aem/client.js';
import type { AppEnv } from '$lib/aem/env.js';
import { isCfReferencePath } from '$lib/aem/hydrate-references.js';
import type { AuthorFragment, AuthorField } from '$lib/types/aem.js';

export interface ResolvedFragmentRef {
	varName: string;
	refExpression: string;
	uuid: string;
	modelId: string;
	fragmentPath: string;
}

export interface RefResolutionError {
	varName: string;
	refExpression: string;
	message: string;
}

type Result<T> = { data: T; error?: never } | { error: string; data?: never };

/** Parsed ref: this | this.field | this.field[N] | this.field.subField */
interface ParsedRef {
	kind: 'this' | 'field' | 'indexed' | 'nested';
	field?: string;
	index?: number;
	subField?: string;
}

export function parseRefExpression(expr: string): ParsedRef | null {
	const trimmed = expr.trim();
	if (trimmed === 'this') return { kind: 'this' };

	const match = trimmed.match(
		/^this\.([A-Za-z_]\w*)(?:\[(\d+)\])?(?:\.([A-Za-z_]\w*))?$/
	);
	if (!match) return null;

	const [, field, indexStr, subField] = match;
	if (indexStr !== undefined) {
		return { kind: 'indexed', field, index: Number(indexStr) };
	}
	if (subField) {
		return { kind: 'nested', field, subField };
	}
	return { kind: 'field', field };
}

export async function resolveLoadTagRefs(
	tags: Array<{ varName: string; refExpression: string }>,
	campaign: AuthorFragment,
	opts: AEMClientOptions,
	env?: AppEnv
): Promise<{ resolved: ResolvedFragmentRef[]; errors: RefResolutionError[] }> {
	const resolved: ResolvedFragmentRef[] = [];
	const errors: RefResolutionError[] = [];

	for (const tag of tags) {
		const result = await resolveSingleRef(tag.refExpression, campaign, opts, env);
		if (result.error || !result.data) {
			errors.push({
				varName: tag.varName,
				refExpression: tag.refExpression,
				message: result.error ?? 'Reference resolved to empty fragment'
			});
			continue;
		}
		resolved.push({
			varName: tag.varName,
			refExpression: tag.refExpression,
			uuid: result.data.uuid,
			modelId: result.data.modelId,
			fragmentPath: result.data.fragmentPath
		});
	}

	return { resolved, errors };
}

async function resolveSingleRef(
	refExpression: string,
	campaign: AuthorFragment,
	opts: AEMClientOptions,
	env?: AppEnv
): Promise<Result<{ uuid: string; modelId: string; fragmentPath: string }>> {
	const parsed = parseRefExpression(refExpression);
	if (!parsed) {
		return { error: `Unrecognized ref expression: ${refExpression}` };
	}

	if (parsed.kind === 'this') {
		if (!campaign.id) return { error: 'Campaign fragment has no id' };
		return {
			data: {
				uuid: campaign.id,
				modelId: campaign.model?.id ?? '',
				fragmentPath: campaign.path
			}
		};
	}

	let current: AuthorFragment = campaign;

	if (parsed.kind === 'field' || parsed.kind === 'indexed') {
		const step = await resolveFieldStep(
			current,
			parsed.field!,
			parsed.kind === 'indexed' ? parsed.index : undefined,
			opts,
			env
		);
		if (step.error || !step.data) return step.error ? step : { error: 'Reference resolved to empty fragment' };
		current = step.data;
	}

	if (parsed.kind === 'nested') {
		const step1 = await resolveFieldStep(current, parsed.field!, undefined, opts, env);
		if (step1.error || !step1.data) return step1.error ? step1 : { error: 'Nested reference resolved to empty fragment' };
		const step2 = await resolveFieldStep(step1.data!, parsed.subField!, undefined, opts, env);
		if (step2.error || !step2.data) return step2.error ? step2 : { error: 'Nested reference resolved to empty fragment' };
		current = step2.data;
	}

	if (!current.id) return { error: `Resolved fragment has no id for ref: ${refExpression}` };
	return {
		data: {
			uuid: current.id,
			modelId: current.model?.id ?? '',
			fragmentPath: current.path
		}
	};
}

async function resolveFieldStep(
	fragment: AuthorFragment,
	fieldName: string,
	index: number | undefined,
	opts: AEMClientOptions,
	env?: AppEnv
): Promise<Result<AuthorFragment>> {
	const hydrated = findHydratedReference(fragment, fieldName, index);
	if (hydrated) return { data: hydrated };

	const field = fragment.fields?.find((f) => f.name === fieldName);
	if (!field) {
		return { error: `Field "${fieldName}" not found on ${fragment.path}` };
	}

	const refId = extractFragmentReferenceId(field, index);
	if (!refId) {
		return { error: `No fragment reference in field "${fieldName}"` };
	}

	if (typeof refId === 'string' && !looksLikeUuid(refId) && !isCfReferencePath(refId)) {
		return {
			error: `Field "${fieldName}" points to a DAM asset, not a content fragment (${refId})`
		};
	}

	if (looksLikeUuid(refId)) {
		const fetched = await fetchAuthorFragmentRawById(refId, opts, env);
		if (fetched.error || !fetched.data) {
			return { error: fetched.error ?? `Failed to fetch fragment ${refId}` };
		}
		return { data: fetched.data };
	}

	const byPath = await fetchAuthorFragmentRawByPath(refId, opts, env);
	if (byPath.error || !byPath.data) {
		return { error: byPath.error ?? `Failed to fetch fragment at path ${refId}` };
	}
	return { data: byPath.data };
}

function findHydratedReference(
	fragment: AuthorFragment,
	fieldName: string,
	index?: number
): AuthorFragment | null {
	const ref = fragment.references?.find((r) => r.fieldName === fieldName);
	if (!ref?.items?.length) return null;

	const items = ref.items.filter((i) => i.type === 'fragment' && i.fragment);
	if (items.length === 0) return null;

	const idx = index ?? 0;
	const item = items[idx];
	if (!item?.fragment) return null;
	return item.fragment;
}

function extractFragmentReferenceId(field: AuthorField, index?: number): string | null {
	const values = field.values ?? [];
	if (values.length === 0) return null;

	const pick = index !== undefined ? values[index] : values[0];
	if (pick == null) return null;

	if (typeof pick === 'string') return pick;
	if (typeof pick === 'object') {
		const obj = pick as Record<string, unknown>;
		if (typeof obj.id === 'string') return obj.id;
		if (typeof obj.path === 'string') return obj.path;
		if (typeof obj._path === 'string') return obj._path;
	}
	return null;
}

function looksLikeUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
