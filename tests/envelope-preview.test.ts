import { describe, expect, it } from 'vitest';
import {
	extractMjHeadTag,
	formatEnvelopeHtmlComment,
	parseEnvelopeHtmlComment,
	resolveEmailEnvelope
} from '../src/lib/preview/envelope.js';
import type { RenderContext } from '../src/lib/render/resolve.js';

const BASE_CONTEXT: RenderContext = {
	cf: {
		title: 'Persönliche Beratung',
		heroHeadline: 'Summer savings inside',
		subject: 'Ignored when mj-preview wins'
	},
	profile: {},
	static: { companyName: 'Acme International' },
	preserveProfile: false
};

describe('extractMjHeadTag', () => {
	it('reads mj-preview inner content', () => {
		const mjml = '<mjml><mj-head><mj-preview>{{cf.title}}</mj-preview></mj-head></mjml>';
		expect(extractMjHeadTag(mjml, 'mj-preview')).toBe('{{cf.title}}');
	});

	it('returns null when tag is absent', () => {
		expect(extractMjHeadTag('<mjml></mjml>', 'mj-title')).toBeNull();
	});
});

describe('resolveEmailEnvelope', () => {
	it('resolves mj-preview tokens for preheader', () => {
		const mjml = '<mj-preview>{{cf.title}}</mj-preview>';
		const envelope = resolveEmailEnvelope({ mjml, context: BASE_CONTEXT, templateName: 'Offer' });
		expect(envelope.preheader).toBe('Persönliche Beratung');
		expect(envelope.unresolved).toEqual([]);
	});

	it('uses CF fallbacks when mj-preview is missing', () => {
		const envelope = resolveEmailEnvelope({ mjml: '<mjml></mjml>', context: BASE_CONTEXT });
		expect(envelope.preheader).toBe('Summer savings inside');
	});

	it('prefers mj-title over CF subject fallbacks', () => {
		const mjml = '<mj-title>{{cf.title}}</mj-title>';
		const envelope = resolveEmailEnvelope({ mjml, context: BASE_CONTEXT });
		expect(envelope.subject).toBe('Persönliche Beratung');
	});

	it('falls back to cf.subject then template name', () => {
		const ctx: RenderContext = {
			...BASE_CONTEXT,
			cf: { subject: 'Direct subject', heroHeadline: 'Pre', title: 'Title only' }
		};
		const envelope = resolveEmailEnvelope({ mjml: '<mjml></mjml>', context: ctx, templateName: 'Promo' });
		expect(envelope.subject).toBe('Direct subject');
	});

	it('does not use cf.title as subject when mj-preview owns it', () => {
		const ctx: RenderContext = {
			...BASE_CONTEXT,
			cf: { title: 'Persönliche Beratung' }
		};
		const envelope = resolveEmailEnvelope({
			mjml: '<mj-preview>{{cf.title}}</mj-preview>',
			context: ctx,
			templateName: 'Offer Email'
		});
		expect(envelope.preheader).toBe('Persönliche Beratung');
		expect(envelope.subject).toBe('Offer Email');
	});

	it('flags unresolved envelope tokens', () => {
		const mjml = '<mj-preview>{{cf.missing}}</mj-preview>';
		const envelope = resolveEmailEnvelope({ mjml, context: BASE_CONTEXT });
		expect(envelope.preheader).toContain('{{cf.missing}}');
		expect(envelope.unresolved).toContain('cf.missing');
	});

	it('sets from from static.companyName', () => {
		const envelope = resolveEmailEnvelope({ mjml: '', context: BASE_CONTEXT });
		expect(envelope.from).toBe('Acme International');
	});
});

describe('envelope HTML comment', () => {
	it('round-trips through parseEnvelopeHtmlComment', () => {
		const envelope = {
			subject: 'Hi',
			preheader: 'Preview',
			from: 'Acme',
			unresolved: [] as string[]
		};
		const comment = formatEnvelopeHtmlComment(envelope);
		const parsed = parseEnvelopeHtmlComment(comment);
		expect(parsed).toEqual(envelope);
	});
});
