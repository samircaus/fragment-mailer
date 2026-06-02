import { describe, it, expect, vi } from 'vitest';
import summerMJML from '../src/lib/templates/files/summer-campaign.mjml?raw';
import { transformTemplateForAjo } from '../src/lib/ajo/export-pipeline.js';
import type { AuthorFragment } from '../src/lib/types/aem.js';

vi.mock('$lib/ajo/validate.js', () => ({
	validateAjoExport: vi.fn().mockResolvedValue([])
}));

const offerUuid = '11111111-2222-3333-4444-555555555555';
const campaignUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function offerFragment(id: string) {
	return {
		id,
		path: `/content/dam/offers/${id}`,
		title: 'Offer',
		etag: '1',
		created: { at: '', by: '' },
		modified: { at: '', by: '' },
		model: { id: 'offer-model', title: 'Offer' },
		status: 'published' as const,
		published: { at: '2025-01-01', by: 'admin' },
		fields: []
	};
}

const mockCampaign: AuthorFragment = {
	id: campaignUuid,
	path: '/content/dam/campaigns/summer',
	title: 'Summer',
	etag: '1',
	created: { at: '', by: '' },
	modified: { at: '', by: '' },
	model: { id: 'campaign-model', title: 'Email Campaign' },
	status: 'published',
	published: { at: '2025-01-01', by: 'admin' },
	fields: [],
	references: [
		{
			fieldName: 'offers',
			items: [
				{
					id: offerUuid,
					path: '/content/dam/offers/o0',
					type: 'fragment',
					fragment: offerFragment(offerUuid)
				},
				{
					id: '22222222-3333-4444-5555-666666666666',
					path: '/content/dam/offers/o1',
					type: 'fragment',
					fragment: offerFragment('22222222-3333-4444-5555-666666666666')
				},
				{
					id: '33333333-4444-5555-6666-777777777777',
					path: '/content/dam/offers/o2',
					type: 'fragment',
					fragment: offerFragment('33333333-4444-5555-6666-777777777777')
				}
			]
		},
		{
			fieldName: 'heroOffer',
			items: [
				{
					id: offerUuid,
					path: '/content/dam/offers/hero',
					type: 'fragment',
					fragment: offerFragment(offerUuid)
				}
			]
		}
	]
};

describe('summer campaign AJO transform', () => {
	it('surfaces suspicious personalization tokens', async () => {
		const result = await transformTemplateForAjo({
			mjml: summerMJML,
			campaignId: 'summer',
			campaignFragment: mockCampaign,
			env: {
				IMS_ORG_ID: 'org@AdobeOrg',
				AJO_SANDBOX: 'prod',
				AEM_PUBLISH_HOST: 'https://publish.example.com'
			},
			imsOrgId: 'org@AdobeOrg',
			ajoSandboxName: 'prod'
		});

		expect(result.validationErrors).toHaveLength(0);

		expect(result.html).toContain('{%#if');
		expect(result.html).not.toMatch(/\|\s*default:/);
		expect(result.html).not.toMatch(/\{\{\{/);
		expect(result.html).not.toMatch(/\{%\s*if\s+/);
	});
});
