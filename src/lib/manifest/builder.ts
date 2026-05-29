// AJO handoff manifest builder.
// Produces the JSON artifact that the AJO team imports alongside the rendered HTML.
// The manifest encodes all the metadata needed to trace content back to source CFs
// and to attach CF references in the AJO email editor.

import type { ResolvedCFData } from '../aem/types.js';
import { resolveCfBinding } from '../templates/cf-fields.js';
import type { TemplateDefinition } from '../templates/registry.js';

export interface ManifestBinding {
	bindingId: string;
	selector: string; // CSS selector to identify the element in the HTML
	cfPath: string;
	cfField: string;
	valueType: 'text' | 'richtext' | 'url' | 'compound' | 'ajo-offer';
	renderedValue: string;
}

export interface AJOHandoffManifest {
	version: '1.0';
	campaignId: string;
	templateId: string;
	templateVersion: string;
	subject: string;
	preheader: string;
	renderedAt: string;
	previewProfileId: string;
	sourceFragments: Array<{ path: string; version: string }>;
	bindings: ManifestBinding[];
	profileTokens: string[];
	ajoHandoff: {
		// TODO(decision): Confirm preferred AJO import strategy with AJO team.
		// 'import-html-then-attach-cf-refs' assumes AJO supports post-import CF reference attachment.
		// 'baked-content-only' means the HTML is self-contained and AJO only handles profile tokens.
		preferredStrategy: 'import-html-then-attach-cf-refs' | 'baked-content-only';
		notes: string;
	};
}

export interface BuildManifestInput {
	campaignId: string;
	template: TemplateDefinition;
	primaryCF: ResolvedCFData;
	referencedCFs: ResolvedCFData[];
	personaId: string;
	renderedHtml: string;
}

export function buildManifest(input: BuildManifestInput): AJOHandoffManifest {
	const { campaignId, template, primaryCF, referencedCFs, personaId, renderedHtml } = input;

	const bindings = extractBindings(template, primaryCF, referencedCFs, renderedHtml);

	return {
		version: '1.0',
		campaignId,
		templateId: template.id,
		templateVersion: template.version,
		subject: resolveSubject(template, primaryCF),
		preheader: resolvePreheader(template, primaryCF),
		renderedAt: new Date().toISOString(),
		previewProfileId: personaId,
		sourceFragments: [
			{ path: primaryCF.path, version: primaryCF.version },
			...referencedCFs.map((cf) => ({ path: cf.path, version: cf.version }))
		],
		bindings,
		profileTokens: template.profileTokens,
		ajoHandoff: {
			preferredStrategy: 'import-html-then-attach-cf-refs',
			notes:
				'Profile tokens ({{profile.*}}) are preserved in the HTML for AJO to resolve at send time. ' +
				'CF reference syntax in the HTML: verify with AJO team before import. ' +
				'TODO(decision): Confirm AJO CF ref format — likely {{fragment id="aem:UUID" result="cfN"}}{{cfN.field}}.'
		}
	};
}

function extractBindings(
	template: TemplateDefinition,
	primaryCF: ResolvedCFData,
	referencedCFs: ResolvedCFData[],
	renderedHtml: string
): ManifestBinding[] {
	const bindings: ManifestBinding[] = [];

	for (const [fieldId, fieldDef] of Object.entries(template.fields)) {
		const binding = resolveCfBinding(fieldId, fieldDef);

		if (fieldDef.type === 'reference') {
			const refCF = referencedCFs.find((cf) => cf.path.includes(fieldId));
			if (!refCF) continue;

			bindings.push({
				bindingId: `${template.id}_${fieldId}`,
				selector: `[data-fm-binding="${binding}"]`,
				cfPath: refCF.path,
				cfField: fieldId,
				valueType: 'ajo-offer',
				renderedValue: 'compound-reference'
			});
		} else {
			const renderedValue = extractRenderedValue(renderedHtml, binding);
			bindings.push({
				bindingId: `${template.id}_${fieldId}`,
				selector: `[data-fm-binding="${binding}"]`,
				cfPath: primaryCF.path,
				cfField: fieldId,
				valueType: mapFieldType(fieldDef.type),
				renderedValue
			});
		}
	}

	return bindings;
}

function extractRenderedValue(html: string, binding: string): string {
	const re = new RegExp(`data-fm-binding="${escapeRegex(binding)}"[^>]*>([\\s\\S]*?)<\/span>`);
	const match = html.match(re);
	return match?.[1] ?? '';
}

function resolveSubject(template: TemplateDefinition, cf: ResolvedCFData): string {
	// Try to find a subject field in the CF; fall back to template name
	const subject = cf.fields['subject'] ?? cf.fields['emailSubject'] ?? template.name;
	return String(subject);
}

function resolvePreheader(template: TemplateDefinition, cf: ResolvedCFData): string {
	const preheader = cf.fields['preheader'] ?? cf.fields['heroHeadline'] ?? '';
	return String(preheader);
}

function mapFieldType(type: string): ManifestBinding['valueType'] {
	switch (type) {
		case 'richtext':
			return 'richtext';
		case 'url':
			return 'url';
		case 'reference':
			return 'compound';
		default:
			return 'text';
	}
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
