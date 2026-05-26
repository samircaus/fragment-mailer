import { describe, it, expect } from 'vitest';
import {
	validateCFFields,
	validateRenderedHTML,
	validate
} from '../src/lib/render/validate.js';

describe('validateCFFields — Rule 1: escaped HTML as text', () => {
	it('flags a field containing &lt;sub&gt;', () => {
		const { warnings } = validateCFFields(
			{ heroHeadline: 'Save 50% on H&lt;sub&gt;2&lt;/sub&gt;O filters' },
			{ heroHeadline: 'text' }
		);
		expect(warnings).toHaveLength(1);
		expect(warnings[0].severity).toBe('error');
		expect(warnings[0].fieldPath).toBe('cf.heroHeadline');
	});

	it('flags a field containing &lt;br&gt;', () => {
		const { warnings } = validateCFFields(
			{ bodyCopy: 'Line 1&lt;br&gt;Line 2' },
			{ bodyCopy: 'text' }
		);
		expect(warnings.some((w) => w.severity === 'error')).toBe(true);
	});

	it('does not flag clean text', () => {
		const { warnings } = validateCFFields(
			{ heroHeadline: 'Spring into Savings' },
			{ heroHeadline: 'text' }
		);
		expect(warnings).toHaveLength(0);
	});

	it('does not flag a richtext field with legitimate HTML', () => {
		const { warnings } = validateCFFields(
			{ bodyCopy: '<p>Hello <strong>world</strong></p>' },
			{ bodyCopy: 'richtext' }
		);
		// Rule 1 checks for escaped entities, not raw HTML in richtext — should be clean
		expect(warnings.filter((w) => w.severity === 'error')).toHaveLength(0);
	});
});

describe('validateCFFields — Rule 5: raw HTML in plain-text field', () => {
	it('flags a plain-text field with raw HTML markup', () => {
		const { warnings } = validateCFFields(
			{ heroHeadline: '<strong>Big Sale</strong>' },
			{ heroHeadline: 'text' }
		);
		expect(warnings.some((w) => w.severity === 'warning')).toBe(true);
	});

	it('does not flag raw HTML in a richtext field', () => {
		const { warnings } = validateCFFields(
			{ bodyCopy: '<p>Hello</p>' },
			{ bodyCopy: 'richtext' }
		);
		expect(warnings.filter((w) => w.fieldPath === 'cf.bodyCopy' && w.severity === 'warning')).toHaveLength(0);
	});
});

describe('validateRenderedHTML — Rule 2: unresolved CF tokens', () => {
	it('flags an unresolved {{cf.field}} token in the output', () => {
		const { warnings } = validateRenderedHTML('<h1>{{cf.heroHeadline}}</h1>');
		expect(warnings).toHaveLength(1);
		expect(warnings[0].severity).toBe('error');
	});

	it('does not flag clean HTML', () => {
		const { warnings } = validateRenderedHTML('<h1>Spring into Savings</h1>');
		expect(warnings).toHaveLength(0);
	});
});

describe('validateRenderedHTML — Rule 3: AJO comment tokens', () => {
	it('flags AJO comment tokens leaking into the output', () => {
		const { warnings } = validateRenderedHTML('<p>{{!-- AJO internal --}}</p>');
		expect(warnings.some((w) => w.severity === 'warning')).toBe(true);
	});
});

describe('validateRenderedHTML — Rule 4: empty structural tags', () => {
	it('flags an empty <h1>', () => {
		const { warnings } = validateRenderedHTML('<h1></h1>');
		expect(warnings.some((w) => w.severity === 'warning')).toBe(true);
	});

	it('does not flag a populated <h1>', () => {
		const { warnings } = validateRenderedHTML('<h1>Spring Sale</h1>');
		expect(warnings).toHaveLength(0);
	});
});

describe('validate — combined', () => {
	it('aggregates field-level and HTML-level warnings', () => {
		const warnings = validate(
			{ heroHeadline: 'Text with &lt;sub&gt;' },
			{ heroHeadline: 'text' },
			'<h1>{{cf.missingField}}</h1>'
		);
		expect(warnings.length).toBeGreaterThanOrEqual(2);
	});
});
