import { describe, expect, it } from 'vitest';
import {
	campaignBasenameMatchesSlug,
	campaignSlugFromPath,
	resolveCampaignPathFromList
} from '../src/lib/campaigns/resolve-path.js';
import type { ContentFragmentItem } from '../src/lib/aem/types.js';

const FOLDER = '/content/dam/email/en/campaigns';

function item(path: string): ContentFragmentItem {
	return { path, _path: path, id: path, title: path };
}

describe('campaignSlugFromPath', () => {
	it('returns the last path segment', () => {
		expect(campaignSlugFromPath(`${FOLDER}/summer-campaign-26`)).toBe('summer-campaign-26');
	});
});

describe('campaignBasenameMatchesSlug', () => {
	it('matches exact and versioned suffixes', () => {
		expect(campaignBasenameMatchesSlug('summer-campaign', 'summer-campaign')).toBe(true);
		expect(campaignBasenameMatchesSlug('summer-campaign-26', 'summer-campaign')).toBe(true);
		expect(campaignBasenameMatchesSlug('summer', 'summer-campaign')).toBe(false);
	});
});

describe('resolveCampaignPathFromList', () => {
	it('resolves slug to a single versioned fragment', () => {
		const resolved = resolveCampaignPathFromList('summer-campaign', FOLDER, [
			item(`${FOLDER}/summer-campaign-26`),
			item(`${FOLDER}/winter-campaign`)
		]);
		expect(resolved).toBe(`${FOLDER}/summer-campaign-26`);
	});

	it('prefers an exact basename when present', () => {
		const resolved = resolveCampaignPathFromList('summer-campaign', FOLDER, [
			item(`${FOLDER}/summer-campaign`),
			item(`${FOLDER}/summer-campaign-26`)
		]);
		expect(resolved).toBe(`${FOLDER}/summer-campaign`);
	});

	it('returns null when ambiguous', () => {
		const resolved = resolveCampaignPathFromList('summer-campaign', FOLDER, [
			item(`${FOLDER}/summer-campaign-26`),
			item(`${FOLDER}/summer-campaign-27`)
		]);
		expect(resolved).toBeNull();
	});

	it('returns null when no match', () => {
		const resolved = resolveCampaignPathFromList('summer-campaign', FOLDER, [
			item(`${FOLDER}/winter-campaign`)
		]);
		expect(resolved).toBeNull();
	});
});
