import { describe, it, expect, beforeEach } from 'vitest';
import {
	clearCampaignTemplatePrefsMemoryStore,
	getCampaignTemplatePref,
	setCampaignTemplatePref
} from '../src/lib/db/campaign-template-prefs.js';
import { resolveCampaignTemplateId, saveCampaignTemplatePreference } from '../src/lib/campaigns/template-preference.js';
import {
	createTemplate,
	deleteTemplateFamily,
	listTemplatePickerItems,
	renameTemplateFamily,
	resetTemplateStoreForTests
} from '../src/lib/templates/service.js';

const scope = { imsOrgId: '', ajoSandbox: 'prod' };

describe('campaign template preference', () => {
	beforeEach(() => {
		clearCampaignTemplatePrefsMemoryStore();
	});

	it('persists and resolves stored template id', async () => {
		await setCampaignTemplatePref(undefined, scope, 'spring-promo', 'gift-offer@1.0.0');
		const stored = await getCampaignTemplatePref(undefined, scope, 'spring-promo');
		expect(stored).toBe('gift-offer@1.0.0');

		const resolved = await resolveCampaignTemplateId(undefined, 'spring-promo', 'promo');
		expect(resolved).toBe('gift-offer@1.0.0');
	});

	it('prefers query param over stored preference', async () => {
		await setCampaignTemplatePref(undefined, scope, 'spring-promo', 'gift-offer@1.0.0');
		const resolved = await resolveCampaignTemplateId(undefined, 'spring-promo', 'promo', {
			queryTemplateId: 'offer'
		});
		expect(resolved).toBe('offer');
	});

	it('falls back to inferred template', async () => {
		const resolved = await resolveCampaignTemplateId(undefined, 'spring-promo', 'offer');
		expect(resolved).toBe('offer');
	});

	it('saves via helper', async () => {
		await listTemplatePickerItems(undefined);
		await createTemplate(undefined, {
			id: 'ajo-test',
			name: 'Test',
			mjml: '<mjml><mj-body></mj-body></mjml>'
		});
		await saveCampaignTemplatePreference(undefined, 'spring-promo', 'ajo-test');
		const stored = await getCampaignTemplatePref(undefined, scope, 'spring-promo');
		expect(stored).toBe('ajo-test');
	});
});

describe('template family management', () => {
	beforeEach(() => {
		resetTemplateStoreForTests();
	});

	it('renames all versions in a family', async () => {
		await createTemplate(undefined, {
			id: 'ajo-news',
			name: 'Newsletter',
			mjml: '<mjml><mj-body></mj-body></mjml>'
		});
		const renamed = await renameTemplateFamily(undefined, 'ajo-news', 'Spring Newsletter');
		expect(renamed.error).toBeUndefined();

		const items = await listTemplatePickerItems(undefined);
		expect(items.find((t) => t.familyId === 'ajo-news')?.name).toBe('Spring Newsletter');
	});

	it('renames seeded templates', async () => {
		await listTemplatePickerItems(undefined);
		const renamed = await renameTemplateFamily(undefined, 'promo', 'Promo Email');
		expect(renamed.error).toBeUndefined();
		const items = await listTemplatePickerItems(undefined);
		expect(items.find((t) => t.familyId === 'promo')?.name).toBe('Promo Email');
	});

	it('deletes a seeded template family', async () => {
		await listTemplatePickerItems(undefined);
		const deleted = await deleteTemplateFamily(undefined, 'promo');
		expect(deleted.error).toBeUndefined();
		const items = await listTemplatePickerItems(undefined);
		expect(items.some((t) => t.familyId === 'promo')).toBe(false);
	});

	it('deletes a custom template family', async () => {
		await createTemplate(undefined, {
			id: 'ajo-temp',
			name: 'Temp',
			mjml: '<mjml><mj-body></mj-body></mjml>'
		});
		const deleted = await deleteTemplateFamily(undefined, 'ajo-temp');
		expect(deleted.error).toBeUndefined();
		const items = await listTemplatePickerItems(undefined);
		expect(items.some((t) => t.familyId === 'ajo-temp')).toBe(false);
	});
});
