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
		expect(templates.map((t) => t.id).sort()).toEqual(['offer', 'promo']);
	});

	it('loads bundled template with UE assets', async () => {
		const result = await loadTemplate(undefined, 'promo');
		expect(result.data?.definition.id).toBe('promo');
		expect(result.data?.componentDefinition?.groups[0]?.id).toBe('email-campaign');
		expect(result.data?.componentModels?.length).toBeGreaterThan(0);
	});

	it('persists MJML edits in memory store', async () => {
		await listTemplates(undefined);
		const updated = '<mjml><mj-body><mj-section><mj-column><mj-text>Edited</mj-text></mj-column></mj-section></mj-body></mjml>';
		const saveResult = await saveTemplateMJML(undefined, 'promo', updated);
		expect(saveResult.error).toBeUndefined();

		const loaded = await loadTemplate(undefined, 'promo');
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
