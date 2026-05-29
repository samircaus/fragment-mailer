import { describe, it, expect, beforeEach } from 'vitest';
import { bumpPatchVersion, versionIdForFamily } from '../src/lib/templates/version.js';
import {
	createTemplate,
	deleteTemplateVersion,
	listTemplatePickerItems,
	resetTemplateStoreForTests,
	saveTemplateAsNewVersion,
	saveTemplateMJML
} from '../src/lib/templates/service.js';

describe('template version helpers', () => {
	it('bumps patch segment', () => {
		expect(bumpPatchVersion('1.0.0')).toBe('1.0.1');
		expect(bumpPatchVersion('2.3.9')).toBe('2.3.10');
	});

	it('builds versioned ids', () => {
		expect(versionIdForFamily('promo', '1.0.1')).toBe('promo@1.0.1');
	});
});

describe('saveTemplateAsNewVersion', () => {
	beforeEach(() => {
		resetTemplateStoreForTests();
	});

	it('creates a new row with bumped version', async () => {
		await listTemplatePickerItems(undefined);
		const updated = '<mjml><mj-body><mj-section><mj-column><mj-text>v2</mj-text></mj-column></mj-section></mj-body></mjml>';
		const result = await saveTemplateAsNewVersion(undefined, 'promo', updated);
		expect(result.error).toBeUndefined();
		expect(result.data?.version).toBe('1.0.1');
		expect(result.data?.id).toBe('promo@1.0.1');

		const items = await listTemplatePickerItems(undefined);
		const promoVersions = items.filter((t) => t.familyId === 'promo');
		expect(promoVersions.map((t) => t.version).sort()).toEqual(['1.0.0', '1.0.1']);

		await saveTemplateMJML(undefined, 'promo', '<mjml><mj-body></mj-body></mjml>');
		const third = await saveTemplateAsNewVersion(undefined, 'promo@1.0.1', updated);
		expect(third.data?.version).toBe('1.0.2');
	});

	it('refuses to delete built-in or sole version', async () => {
		await listTemplatePickerItems(undefined);
		expect((await deleteTemplateVersion(undefined, 'promo')).error).toContain('Built-in');

		await createTemplate(undefined, {
			id: 'solo',
			name: 'Solo',
			mjml: '<mjml><mj-body></mj-body></mjml>'
		});
		expect((await deleteTemplateVersion(undefined, 'solo')).error).toContain('only version');
	});

	it('deletes a non-builtin extra version', async () => {
		await listTemplatePickerItems(undefined);
		await saveTemplateAsNewVersion(undefined, 'promo', '<mjml><mj-body></mj-body></mjml>');
		const del = await deleteTemplateVersion(undefined, 'promo@1.0.1');
		expect(del.error).toBeUndefined();
		const items = await listTemplatePickerItems(undefined);
		expect(items.some((t) => t.id === 'promo@1.0.1')).toBe(false);
	});
});
