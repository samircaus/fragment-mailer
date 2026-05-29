import { describe, it, expect } from 'vitest';
import {
	deriveSyncStatus,
	rowToEmailStatusInfo,
	hashContent,
	type EmailStatusRow
} from '../src/lib/db/email-status-types.js';

const baseRow: EmailStatusRow = {
	cfUuid: 'uuid-1',
	campaignId: 'campaign-1',
	imsOrgId: 'org@AdobeOrg',
	ajoSandbox: 'prod',
	remoteTemplateId: 'tmpl-123',
	lastPushedAt: '2025-03-01T10:00:00.000Z',
	aemModifiedAt: '2025-03-01T09:00:00.000Z',
	contentHash: 'abc',
	lastPushError: null,
	updatedAt: '2025-03-01T10:00:00.000Z'
};

describe('deriveSyncStatus', () => {
	it('returns never_pushed when no row', () => {
		expect(deriveSyncStatus(null, '2025-03-01T10:00:00.000Z')).toBe('never_pushed');
	});

	it('returns never_pushed when no remote template id', () => {
		expect(
			deriveSyncStatus({ ...baseRow, remoteTemplateId: null }, '2025-03-01T10:00:00.000Z')
		).toBe('never_pushed');
	});

	it('returns synced when AEM has not changed since push', () => {
		expect(deriveSyncStatus(baseRow, '2025-03-01T09:00:00.000Z')).toBe('synced');
		expect(deriveSyncStatus(baseRow, '2025-03-01T09:00:00.000Z')).toBe('synced');
	});

	it('returns stale when AEM updated after last push snapshot', () => {
		expect(deriveSyncStatus(baseRow, '2025-03-02T10:00:00.000Z')).toBe('stale');
	});

	it('includes push error in status info', () => {
		const info = rowToEmailStatusInfo(
			{ ...baseRow, lastPushError: 'AJO 502' },
			'2025-03-01T09:00:00.000Z'
		);
		expect(info.syncStatus).toBe('synced');
		expect(info.lastPushError).toBe('AJO 502');
	});
});

describe('hashContent', () => {
	it('returns stable sha256 hex', async () => {
		const a = await hashContent('<html>test</html>');
		const b = await hashContent('<html>test</html>');
		expect(a).toBe(b);
		expect(a).toHaveLength(64);
	});
});
