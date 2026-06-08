import { describe, it, expect, beforeEach } from 'vitest';
import {
	createTemplate,
	listTemplates,
	loadTemplate,
	resetTemplateStoreForTests,
	saveTemplateMJML
} from '../src/lib/templates/service.js';

describe('template service (in-memory fallback)', () => {
	beforeEach(() => {
		resetTemplateStoreForTests();
	});

	it('seeds bundled templates on first list', async () => {
		const templates = await listTemplates(undefined);
		expect(templates.map((t) => t.id)).toEqual(['default']);
	});

	it('loads bundled default template', async () => {
		const result = await loadTemplate(undefined, 'default');
		expect(result.data?.definition.id).toBe('default');
		expect(result.data?.definition.name).toBe('Default Email');
		expect(result.data?.mjml).toContain('{{cf.title}}');
	});

	it('persists MJML edits in memory store', async () => {
		await listTemplates(undefined);
		const updated = '<mjml><mj-body><mj-section><mj-column><mj-text>Edited</mj-text></mj-column></mj-section></mj-body></mjml>';
		const saveResult = await saveTemplateMJML(undefined, 'default', updated);
		expect(saveResult.error).toBeUndefined();

		const loaded = await loadTemplate(undefined, 'default');
		expect(loaded.data?.mjml).toBe(updated);
	});

	it('creates a new managed template', async () => {
		await listTemplates(undefined);
		const createResult = await createTemplate(undefined, {
			id: 'newsletter',
			name: 'Newsletter',
			mjml: '<mjml><mj-body></mj-body></mjml>'
		});
		expect(createResult.error).toBeUndefined();

		const templates = await listTemplates(undefined);
		expect(templates.some((t) => t.id === 'newsletter')).toBe(true);
	});
});
