// Infer and inject {% load varName as fragment ref='...' %} from template + campaign context.
// Authors normally use {{ cf.field }} / {{ cf.offer.headline }}; export adds load tags automatically.

import { isCfReferencePath } from '$lib/aem/hydrate-references.js';
import type { TemplateDefinition, TemplateFieldDefinition } from '$lib/templates/registry.js';
import type { AuthorField, AuthorFragment } from '$lib/types/aem.js';
import { parseLoadTags, type ParsedLoadTag } from './ajo-load-tags.js';

export interface LoadTagSpec {
	varName: string;
	refExpression: string;
}

const CF_ROOT_RE = /\bcf\.([A-Za-z_]\w*)/g;

/** Template `reference` fields that point at another CF (not DAM assets like bannerImage). */
export function isFragmentReferenceField(
	field: Pick<TemplateFieldDefinition, 'type' | 'model'>,
	fieldName?: string
): boolean {
	if (field.type !== 'reference') return false;
	const model = field.model?.trim();
	if (model && /^(image|asset|dam|media)$/i.test(model)) return false;
	if (!model && fieldName && isImageLikeFieldName(fieldName)) return false;
	return true;
}

function isImageLikeFieldName(name: string): boolean {
	return /(?:^|_)(?:image|banner|photo|thumbnail)(?:$|_)/i.test(name);
}

function isAuthorFragmentReferenceField(field: AuthorField): boolean {
	const type = field.type.toLowerCase();
	if (type.includes('asset')) return false;
	return type.includes('fragment') || type.includes('content-fragment');
}

/** Collect CF fragment-reference field names (excludes asset-reference / DAM image paths). */
export function collectReferenceFieldNames(
	definition?: TemplateDefinition,
	campaign?: AuthorFragment
): Set<string> {
	const names = new Set<string>();

	if (definition) {
		for (const [name, field] of Object.entries(definition.fields)) {
			if (isFragmentReferenceField(field, name)) names.add(name);
		}
	}

	for (const ref of campaign?.references ?? []) {
		if (!ref.fieldName) continue;
		const field = campaign.fields?.find((f) => f.name === ref.fieldName);
		if (field && !isAuthorFragmentReferenceField(field)) continue;
		const hasFragmentItem = ref.items?.some((i) => i.type === 'fragment' && i.fragment);
		if (hasFragmentItem) names.add(ref.fieldName);
	}

	for (const field of campaign?.fields ?? []) {
		if (isAuthorFragmentReferenceField(field)) names.add(field.name);
	}

	return names;
}

/** First path segment after `cf.` used in the template. */
export function collectCfRootsUsedInTemplate(mjml: string): Set<string> {
	const roots = new Set<string>();
	const re = new RegExp(CF_ROOT_RE.source, 'g');
	let match: RegExpExecArray | null;
	while ((match = re.exec(mjml)) !== null) {
		roots.add(match[1]);
	}
	return roots;
}

export function inferLoadTagSpecs(
	mjml: string,
	definition?: TemplateDefinition,
	campaign?: AuthorFragment
): LoadTagSpec[] {
	const referenceFields = collectReferenceFieldNames(definition, campaign);
	const usedRoots = collectCfRootsUsedInTemplate(mjml);
	const specs: LoadTagSpec[] = [];

	const needsCampaignRoot = [...usedRoots].some((root) => !referenceFields.has(root));
	if (needsCampaignRoot) {
		specs.push({ varName: 'cf', refExpression: 'this' });
	}

	for (const refName of referenceFields) {
		const usedInTemplate =
			usedRoots.has(refName) ||
			mjml.includes(`cf.${refName}.`) ||
			new RegExp(`\\bcf\\.${refName}\\b`).test(mjml);
		const onCampaign = campaign?.references?.some((r) => r.fieldName === refName);
		if (!usedInTemplate && !onCampaign) continue;

		const campaignField = campaign?.fields?.find((f) => f.name === refName);
		if (campaignField && !isAuthorFragmentReferenceField(campaignField)) continue;
		if (campaignField && fieldValueLooksLikeDamAsset(campaignField)) continue;

		specs.push({ varName: refName, refExpression: `this.${refName}` });
	}

	// Any cf.* usage at all → at least bind the campaign CF.
	if (specs.length === 0 && usedRoots.size > 0) {
		specs.push({ varName: 'cf', refExpression: 'this' });
	}

	return specs;
}

function fieldValueLooksLikeDamAsset(field: AuthorField): boolean {
	const pick = field.values?.[0];
	if (typeof pick === 'string') return !isCfReferencePath(pick);
	return false;
}

/** Rewrite cf.featuredOffer.headline → featuredOffer.headline for loaded reference vars. */
export function rewriteLegacyCfReferencePaths(mjml: string, referenceFields: Iterable<string>): string {
	let output = mjml;
	for (const field of referenceFields) {
		output = output.replace(new RegExp(`\\bcf\\.${field}(?=\\.)`, 'g'), field);
	}
	return output;
}

export function buildLoadTagLine(spec: LoadTagSpec): string {
	return `{% load ${spec.varName} as fragment ref='${spec.refExpression}' %}`;
}

function injectLoadTagsAfterBody(mjml: string, lines: string[]): string {
	if (lines.length === 0) return mjml;
	const block = '\n    ' + lines.join('\n    ') + '\n';
	const bodyRe = /(<mj-body\b[^>]*>)/i;
	const match = mjml.match(bodyRe);
	if (!match || match.index === undefined) {
		return block + mjml;
	}
	const insertAt = match.index + match[0].length;
	return mjml.slice(0, insertAt) + block + mjml.slice(insertAt);
}

export interface EnsureLoadTagsResult {
	mjml: string;
	injected: LoadTagSpec[];
	existing: ParsedLoadTag[];
}

/**
 * Add missing {% load %} tags and rewrite legacy cf.<ref>. paths.
 * Skips varNames that already have an explicit load tag.
 */
export function ensureLoadTagsInTemplate(
	mjml: string,
	definition?: TemplateDefinition,
	campaign?: AuthorFragment
): EnsureLoadTagsResult {
	const existing = parseLoadTags(mjml);
	const existingVars = new Set(existing.map((t) => t.varName));
	const referenceFields = collectReferenceFieldNames(definition, campaign);

	const inferred = inferLoadTagSpecs(mjml, definition, campaign).filter(
		(spec) => !existingVars.has(spec.varName)
	);

	let output = mjml;
	if (inferred.length > 0) {
		output = injectLoadTagsAfterBody(
			output,
			inferred.map(buildLoadTagLine)
		);
	}

	const refNamesToRewrite = [...referenceFields].filter((name) =>
		inferred.some((s) => s.varName === name)
	);
	if (refNamesToRewrite.length > 0) {
		output = rewriteLegacyCfReferencePaths(output, refNamesToRewrite);
	}

	return { mjml: output, injected: inferred, existing };
}
