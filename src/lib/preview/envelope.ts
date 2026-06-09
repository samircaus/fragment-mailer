import { resolve, type RenderContext } from '$lib/render/resolve.js';
import type { TemplateSourceFormat } from '$lib/templates/source-format.js';
import { getTemplateSourceFormat } from '$lib/templates/source-format.js';
import type { TemplateDefinition } from '$lib/templates/types.js';

export interface EmailEnvelope {
	subject: string;
	preheader: string;
	from: string;
	/** Binding paths still present after resolution (e.g. cf.missingField). */
	unresolved: string[];
}

export interface ResolveEnvelopeInput {
	mjml: string;
	context: RenderContext;
	templateName?: string;
	definition?: TemplateDefinition;
	sourceFormat?: TemplateSourceFormat;
}

/** Extract inner text from the first matching MJML head tag (mj-title, mj-preview). */
export function extractMjHeadTag(mjml: string, tag: 'mj-title' | 'mj-preview'): string | null {
	const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
	const match = mjml.match(re);
	if (!match?.[1]) return null;
	return match[1].trim();
}

function extractHtmlTitle(source: string): string | null {
	const match = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	return match?.[1]?.trim() ?? null;
}

function resolveTemplateSnippet(snippet: string, context: RenderContext): { text: string; warnings: string[] } {
	const { html, warnings } = resolve(snippet, context);
	return { text: html.trim(), warnings };
}

function fallbackSubject(cf: Record<string, unknown>, templateName?: string): string {
	const subject = cf['subject'] ?? cf['emailSubject'] ?? templateName ?? '';
	return String(subject);
}

function fallbackPreheader(cf: Record<string, unknown>): string {
	const preheader = cf['preheader'] ?? cf['heroHeadline'] ?? '';
	return String(preheader);
}

function collectUnresolved(...values: string[]): string[] {
	const paths = new Set<string>();
	for (const value of values) {
		for (const match of value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
			paths.add(match[1]!.trim());
		}
	}
	return [...paths];
}

/** Resolve subject, preheader, and from line for inbox-style preview chrome. */
export function resolveEmailEnvelope(input: ResolveEnvelopeInput): EmailEnvelope {
	const { mjml, context, templateName } = input;
	const cf = context.cf;
	const sourceFormat =
		input.sourceFormat ??
		(input.definition ? getTemplateSourceFormat(input.definition) : 'mjml');

	const titleTemplate =
		sourceFormat === 'html'
			? extractHtmlTitle(mjml)
			: extractMjHeadTag(mjml, 'mj-title');
	const previewTemplate = sourceFormat === 'html' ? null : extractMjHeadTag(mjml, 'mj-preview');

	const resolvedTitle = titleTemplate
		? resolveTemplateSnippet(titleTemplate, context)
		: null;
	const resolvedPreview = previewTemplate
		? resolveTemplateSnippet(previewTemplate, context)
		: null;

	const subject = resolvedTitle?.text || fallbackSubject(cf, templateName);
	const preheader = resolvedPreview?.text || fallbackPreheader(cf);
	const from = String(context.static.companyName ?? context.static.company ?? '').trim();

	const unresolved = collectUnresolved(subject, preheader, from);

	return {
		subject,
		preheader,
		from,
		unresolved
	};
}

export const ENVELOPE_HTML_COMMENT_PREFIX = 'FRAGMENT_MAILER_ENVELOPE:';

export function formatEnvelopeHtmlComment(envelope: EmailEnvelope): string {
	return `<!-- ${ENVELOPE_HTML_COMMENT_PREFIX} ${JSON.stringify(envelope)} -->`;
}

export function parseEnvelopeHtmlComment(text: string): EmailEnvelope | null {
	const marker = ENVELOPE_HTML_COMMENT_PREFIX;
	const idx = text.indexOf(marker);
	if (idx < 0) return null;
	const jsonStart = text.indexOf('{', idx);
	if (jsonStart < 0) return null;
	const jsonEnd = text.indexOf('-->', jsonStart);
	const raw = jsonEnd >= 0 ? text.slice(jsonStart, jsonEnd).trim() : text.slice(jsonStart).trim();
	try {
		const parsed = JSON.parse(raw) as EmailEnvelope;
		if (typeof parsed.subject !== 'string') return null;
		if (typeof parsed.preheader !== 'string') return null;
		if (typeof parsed.from !== 'string') return null;
		if (!Array.isArray(parsed.unresolved)) return null;
		return parsed;
	} catch {
		return null;
	}
}
