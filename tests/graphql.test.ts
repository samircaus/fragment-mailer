import { describe, expect, it } from 'vitest';
import { extractGraphqlCampaignRecords } from '../src/lib/aem/graphql.js';

describe('extractGraphqlCampaignRecords', () => {
	it('extracts items from nested emailCampaignList', () => {
		const body = {
			data: {
				emailCampaignList: {
					items: [
						{ _path: '/content/dam/email/en/campaigns/a', heroHeadline: 'A' },
						{ _path: '/content/dam/email/en/campaigns/b', heroHeadline: 'B' }
					]
				}
			}
		};
		const records = extractGraphqlCampaignRecords(body);
		expect(records).toHaveLength(2);
		expect(records[0]._path).toContain('/campaigns/a');
	});

	it('extracts single campaign from by-path response', () => {
		const body = {
			data: {
				emailCampaignByPath: {
					item: {
						_path: '/content/dam/email/en/campaigns/welcome-series-1',
						heroHeadline: 'Welcome'
					}
				}
			}
		};
		const records = extractGraphqlCampaignRecords(body);
		expect(records).toHaveLength(1);
		expect(records[0].heroHeadline).toBe('Welcome');
	});
});
