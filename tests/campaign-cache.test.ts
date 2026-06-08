import { afterEach, describe, expect, it } from 'vitest';
import {
	getCachedHydratedFragment,
	resetCampaignCache,
	setCachedHydratedFragment
} from '../src/lib/aem/campaign-cache.js';
import type { CFFragment } from '../src/lib/aem/types.js';

function sampleFragment(version: string): CFFragment {
	return {
		_path: '/content/dam/email/en/campaigns/summer-campaign',
		_model: { _path: '/conf/email/settings/dam/cfm/models/offer', title: 'Offer' },
		_variation: 'master',
		_metadata: {
			stringMetadata: [{ name: 'cq:lastModified', value: version }]
		},
		id: 'cf-uuid-1',
		title: 'Summer Campaign'
	};
}

afterEach(() => {
	resetCampaignCache();
});

describe('campaign cache', () => {
	it('stores and retrieves by campaign id', () => {
		const fragment = sampleFragment('2026-06-01T10:00:00.000Z');
		setCachedHydratedFragment('summer-campaign', fragment);

		expect(getCachedHydratedFragment('summer-campaign')?.title).toBe('Summer Campaign');
		expect(getCachedHydratedFragment('cf-uuid-1')?.title).toBe('Summer Campaign');
	});

	it('invalidates when client cfVersion does not match', () => {
		const fragment = sampleFragment('v1');
		setCachedHydratedFragment('summer-campaign', fragment);

		expect(getCachedHydratedFragment('summer-campaign', 'v2')).toBeNull();
		expect(getCachedHydratedFragment('summer-campaign', 'v1')?.title).toBe('Summer Campaign');
	});
});
