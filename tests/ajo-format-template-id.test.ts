import { describe, expect, it } from 'vitest';
import { formatAjoTemplateLabel, shortAjoTemplateId } from '../src/lib/ajo/format-template-id.js';

describe('shortAjoTemplateId', () => {
	it('shortens long UUIDs for display', () => {
		expect(shortAjoTemplateId('c62d888e-7124-4df7-8007-08470c21c9b0')).toBe('c62d888e…c9b0');
	});

	it('leaves short ids unchanged', () => {
		expect(shortAjoTemplateId('tpl-123')).toBe('tpl-123');
	});
});

describe('formatAjoTemplateLabel', () => {
	it('prefixes the shortened id', () => {
		expect(formatAjoTemplateLabel('c62d888e-7124-4df7-8007-08470c21c9b0')).toBe(
			'Template c62d888e…c9b0'
		);
	});
});
