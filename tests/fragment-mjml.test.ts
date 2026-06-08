import { describe, expect, it } from 'vitest';
import {
	isMjmlFragmentSource,
	unwrapFragmentMjmlForEdit,
	wrapFragmentMjmlForCompile
} from '../src/lib/mjml/fragment-mjml.js';

describe('wrapFragmentMjmlForCompile', () => {
	it('wraps a partial section snippet', () => {
		const input = '<mj-section><mj-column><mj-text>Hi</mj-text></mj-column></mj-section>';
		expect(wrapFragmentMjmlForCompile(input)).toBe(
			`<mjml><mj-body>${input}</mj-body></mjml>`
		);
	});

	it('leaves a full mjml document unchanged', () => {
		const input = '<mjml><mj-body><mj-text>Hi</mj-text></mj-body></mjml>';
		expect(wrapFragmentMjmlForCompile(input)).toBe(input);
	});

	it('inserts mj-body when mjml root exists without body', () => {
		const input = '<mjml><mj-section><mj-column><mj-text>Hi</mj-text></mj-column></mj-section></mjml>';
		expect(wrapFragmentMjmlForCompile(input)).toBe(
			'<mjml><mj-body><mj-section><mj-column><mj-text>Hi</mj-text></mj-column></mj-section></mj-body></mjml>'
		);
	});
});

describe('unwrapFragmentMjmlForEdit', () => {
	it('extracts inner body content', () => {
		const input = '<mjml><mj-body><mj-text>Hi</mj-text></mj-body></mjml>';
		expect(unwrapFragmentMjmlForEdit(input)).toBe('<mj-text>Hi</mj-text>');
	});

	it('returns partial snippets unchanged', () => {
		const input = '<mj-section><mj-column></mj-column></mj-section>';
		expect(unwrapFragmentMjmlForEdit(input)).toBe(input);
	});
});

describe('isMjmlFragmentSource', () => {
	it('detects mjml tags', () => {
		expect(isMjmlFragmentSource('<mj-section></mj-section>')).toBe(true);
	});

	it('treats html expressions as non-mjml', () => {
		expect(isMjmlFragmentSource('© {{profile.system.year}} Acme Corp.')).toBe(false);
		expect(isMjmlFragmentSource('<p>Hello</p>')).toBe(false);
	});
});
