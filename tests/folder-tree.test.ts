import { describe, expect, it } from 'vitest';
import {
	buildBreadcrumbSegments,
	campaignsInFolder,
	childFolderPaths,
	collectAllFolderPaths,
	displayBreadcrumbParts,
	folderForCampaign,
	parseFolderFromSearchParam
} from '../src/lib/campaigns/folder-tree.js';

const base = '/content/dam/email/en/campaigns';

describe('folder-tree', () => {
	it('groups campaigns by relative folder', () => {
		const campaigns = [
			{ cfPath: `${base}/spring-offer` },
			{ cfPath: `${base}/q1/winter-offer` }
		];
		expect(folderForCampaign(campaigns[0]!.cfPath, base)).toBe('/');
		expect(folderForCampaign(campaigns[1]!.cfPath, base)).toBe('/q1');
		expect(campaignsInFolder(campaigns, '/q1', base)).toHaveLength(1);
	});

	it('builds breadcrumb segments', () => {
		const segments = buildBreadcrumbSegments('/q1/promo', base);
		expect(segments.map((s) => s.label)).toEqual(['Campaigns', 'Q1', 'Promo']);
	});

	it('collapses long breadcrumb trails', () => {
		const segments = buildBreadcrumbSegments('/a/b/c/d', base);
		const parts = displayBreadcrumbParts(segments);
		expect(parts.some((p) => p.type === 'ellipsis')).toBe(true);
	});

	it('collects child folders', () => {
		const paths = collectAllFolderPaths(
			[{ cfPath: `${base}/q1/a` }, { cfPath: `${base}/q2/b` }],
			base
		);
		expect(childFolderPaths('/', paths)).toEqual(['/q1', '/q2']);
	});

	it('includes explicit empty folder paths', () => {
		const paths = collectAllFolderPaths([], base, ['/q3/empty']);
		expect(paths.has('/q3')).toBe(true);
		expect(paths.has('/q3/empty')).toBe(true);
	});

	it('parses folder search param safely', () => {
		expect(parseFolderFromSearchParam('q1/promo')).toBe('/q1/promo');
		expect(parseFolderFromSearchParam('../etc')).toBe('/');
	});
});
