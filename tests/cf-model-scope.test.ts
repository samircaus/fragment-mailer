import { describe, expect, it } from 'vitest';
import {
	cfExperienceCloudModelEditorUrl,
	cfModelsConsoleUrl
} from '../src/lib/aem/author-links.js';
import {
	confRootFromDamFolder,
	filterModelsForCampaignsFolder,
	modelDisplayLabel,
	normalizeCfModelPath
} from '../src/lib/aem/cf-model-scope.js';

describe('cf-model-scope', () => {
	it('maps campaigns DAM folder to conf root', () => {
		expect(confRootFromDamFolder('/content/dam/email/en/campaigns')).toBe('/conf/email');
		expect(confRootFromDamFolder('/content/dam/wknd-shared/en')).toBe('/conf/wknd-shared');
	});

	it('filters models to conf scope', () => {
		const models = [
			{ id: 'a', path: '/conf/email/settings/dam/cfm/models/offer', title: 'Offer' },
			{ id: 'b', path: '/conf/global/settings/dam/cfm/models/other', title: 'Other' }
		];
		const filtered = filterModelsForCampaignsFolder(models, '/content/dam/email/en/campaigns');
		expect(filtered).toHaveLength(1);
		expect(filtered[0]?.title).toBe('Offer');
	});

	it('falls back to all models when conf scope is empty', () => {
		const models = [{ id: 'x', path: '/conf/global/settings/dam/cfm/models/x', title: 'X' }];
		expect(filterModelsForCampaignsFolder(models, '/content/dam/email/en/campaigns')).toEqual(models);
	});

	it('modelDisplayLabel prefers title', () => {
		expect(modelDisplayLabel({ id: 'id', title: 'Offer', name: 'offer' })).toBe('Offer');
	});

	it('normalizeCfModelPath decodes AEM base64 model ids', () => {
		expect(normalizeCfModelPath('L2NvbmYvZW1haWwvc2V0dGluZ3MvZGFtL2NmbS9tb2RlbHMvb2ZmZXI')).toBe(
			'/conf/email/settings/dam/cfm/models/offer'
		);
	});

	it('normalizeCfModelPath leaves JCR paths unchanged', () => {
		expect(normalizeCfModelPath('/conf/email/settings/dam/cfm/models/offer')).toBe(
			'/conf/email/settings/dam/cfm/models/offer'
		);
	});
});

describe('cfExperienceCloudModelEditorUrl', () => {
	it('builds model editor deep link', () => {
		const url = cfExperienceCloudModelEditorUrl(
			'L2NvbmYvZW1haWwvc2V0dGluZ3MvZGFtL2NmbS9tb2RlbHMvZW1haWw=',
			'https://author-p125048-e1847106.adobeaemcloud.com',
			'psc'
		);
		expect(url).toContain('experience.adobe.com/?repo=author-p125048-e1847106.adobeaemcloud.com');
		expect(url).toContain('/aem/cf/model-editor/id/');
		expect(url).toContain('L2NvbmYvZW1haWwvc2V0dGluZ3MvZGFtL2NmbS9tb2RlbHMvZW1haWw%3D');
	});

	it('returns null without model id', () => {
		expect(cfExperienceCloudModelEditorUrl('', 'https://author.example.com')).toBeNull();
	});
});

describe('cfModelsConsoleUrl', () => {
	it('returns classic console path', () => {
		expect(cfModelsConsoleUrl('https://author.example.com')).toBe(
			'https://author.example.com/mnt/overlay/dam/cfm/models/console/content/models.html'
		);
	});
});
