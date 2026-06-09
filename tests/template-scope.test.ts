import { describe, it, expect } from 'vitest';
import {
	isStandaloneTemplateFamilyId,
	isStandaloneTemplateId,
	templateFamilyIdFromTemplateId
} from '../src/lib/templates/template-scope.js';

describe('template-scope', () => {
	it('extracts family id from versioned template id', () => {
		expect(templateFamilyIdFromTemplateId('ajo-news@1.0.0')).toBe('ajo-news');
		expect(templateFamilyIdFromTemplateId('default')).toBe('default');
	});

	it('detects standalone template families', () => {
		expect(isStandaloneTemplateFamilyId('ajo-news')).toBe(true);
		expect(isStandaloneTemplateFamilyId('spring-promo')).toBe(false);
	});

	it('detects standalone template ids', () => {
		expect(isStandaloneTemplateId('ajo-news@1.0.0')).toBe(true);
		expect(isStandaloneTemplateId('default@1.0.0')).toBe(false);
	});
});
