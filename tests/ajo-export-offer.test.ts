import { describe, it, expect, vi } from 'vitest';
import offerDefinition from '../src/lib/templates/files/offer.template.json';
import offerMJML from '../src/lib/templates/files/offer.mjml?raw';
import { transformTemplateForAjo } from '../src/lib/ajo/export-pipeline.js';
import type { TemplateDefinition } from '../src/lib/templates/registry.js';
import type { AuthorFragment } from '../src/lib/types/aem.js';

vi.mock('$lib/ajo/validate.js', () => ({
	validateAjoExport: vi.fn().mockResolvedValue([])
}));

const offerDef = offerDefinition as TemplateDefinition;

const mockOfferCampaign: AuthorFragment = {
	id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
	path: '/content/dam/offers/test-offer',
	title: 'Test Offer',
	etag: '1',
	created: { at: '', by: '' },
	modified: { at: '', by: '' },
	model: { id: 'offer-model', title: 'Offer' },
	status: 'published',
	published: { at: '2025-01-01', by: 'admin' },
	fields: []
};

describe('transformTemplateForAjo — offer template without manual load tags', () => {
	it('auto-injects cf load and compiles', async () => {
		const result = await transformTemplateForAjo({
			mjml: offerMJML,
			campaignId: 'test-offer',
			campaignFragment: mockOfferCampaign,
			templateDefinition: offerDef,
			env: {
				IMS_ORG_ID: 'org@AdobeOrg',
				AJO_SANDBOX: 'prod',
				AEM_PUBLISH_HOST: 'https://publish.example.com'
			},
			imsOrgId: 'org@AdobeOrg',
			ajoSandboxName: 'prod'
		});

		expect(result.injectedLoadTags).toContainEqual({ varName: 'cf', refExpression: 'this' });
		expect(result.validationErrors).toHaveLength(0);
		expect(result.repoId).toBe('publish.example.com');
		expect(result.html).toContain(
			'{{fragment id="aem:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee?repoId=publish.example.com" result="cf"}}'
		);
		expect(result.html).not.toContain('{% let cf = fragment');
		expect(result.html).toContain('{%#if cf.bannerImage != "" %}');
		expect(result.html).toContain('{%/if%}');
		expect(result.html).not.toMatch(/\{%\s*endif\s*%\}/);

		const letIdx = result.html.indexOf('{{fragment id="aem:');
		const preheaderIdx = result.html.indexOf('{{cf.title}}');
		expect(letIdx).toBeGreaterThan(-1);
		expect(preheaderIdx).toBeGreaterThan(-1);
		expect(letIdx).toBeLessThan(preheaderIdx);
	});
});
