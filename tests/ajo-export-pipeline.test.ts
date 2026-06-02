import { describe, it, expect, vi } from 'vitest';
import { transformTemplateForAjo } from '../src/lib/ajo/export-pipeline.js';
import type { AuthorFragment } from '../src/lib/types/aem.js';

vi.mock('$lib/ajo/validate.js', () => ({
	validateAjoExport: vi.fn().mockResolvedValue([])
}));

const mockCampaign: AuthorFragment = {
	id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
	path: '/content/dam/campaigns/test',
	title: 'Test',
	etag: '1',
	created: { at: '', by: '' },
	modified: { at: '', by: '' },
	model: { id: 'model-1', title: 'Email Campaign' },
	status: 'published',
	published: { at: '2025-01-01', by: 'admin' },
	fields: [],
	references: [
		{
			fieldName: 'featuredOffer',
			items: [
				{
					id: '11111111-2222-3333-4444-555555555555',
					path: '/content/dam/offers/offer-1',
					type: 'fragment',
					fragment: {
						id: '11111111-2222-3333-4444-555555555555',
						path: '/content/dam/offers/offer-1',
						title: 'Offer',
						etag: '1',
						created: { at: '', by: '' },
						modified: { at: '', by: '' },
						model: { id: 'offer-model', title: 'Offer' },
						status: 'published',
						published: { at: '2025-01-01', by: 'admin' },
						fields: []
					}
				}
			]
		}
	]
};

describe('transformTemplateForAjo', () => {
	it('rewrites load tags and compiles HTML', async () => {
		const mjml = `<mjml><mj-body>
{% load cf as fragment ref='this' %}
{% load featuredOffer as fragment ref='this.featuredOffer' %}
<mj-section><mj-column>
<mj-text>{{ cf.heroHeadline }}</mj-text>
<mj-text>{{ featuredOffer.headline }}</mj-text>
</mj-column></mj-section>
</mj-body></mjml>`;

		const result = await transformTemplateForAjo({
			mjml,
			campaignId: 'test-campaign',
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
		expect(result.html).toContain('aem:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
		expect(result.html).toContain('aem:11111111-2222-3333-4444-555555555555');
		expect(result.html).not.toMatch(/\{%\s*load\b/);

		const firstLet = result.html.indexOf('{{fragment id="aem:');
		const firstCfToken = result.html.indexOf('{{ cf.heroHeadline }}');
		expect(firstLet).toBeGreaterThan(-1);
		expect(firstCfToken).toBeGreaterThan(-1);
		expect(firstLet).toBeLessThan(firstCfToken);
	});

	it('derives publish repoId from author AEM_BASE_URL', async () => {
		const mjml = `<mjml><mj-body>
{% load cf as fragment ref='this' %}
<mj-section><mj-column><mj-text>{{ cf.title }}</mj-text></mj-column></mj-section>
</mj-body></mjml>`;

		const result = await transformTemplateForAjo({
			mjml,
			campaignId: 'test-campaign',
			campaignFragment: mockCampaign,
			env: {
				IMS_ORG_ID: 'org@AdobeOrg',
				AJO_SANDBOX: 'prod',
				AEM_BASE_URL: 'https://author-p125048-e1847106.adobeaemcloud.com'
			},
			imsOrgId: 'org@AdobeOrg',
			ajoSandboxName: 'prod'
		});

		expect(result.repoId).toBe('publish-p125048-e1847106.adobeaemcloud.com');
		expect(result.html).toContain('repoId=publish-p125048-e1847106.adobeaemcloud.com');
		expect(result.html).not.toContain('repoId=author-');
	});
});
