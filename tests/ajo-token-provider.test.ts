import { describe, expect, it } from 'vitest';
import {
	ajoCredentialsFromEnv,
	ajoImsScopesFromEnv,
	DEFAULT_AJO_IMS_SCOPES
} from '../src/lib/auth/ajo-token-provider.js';
import type { AppEnv } from '../src/lib/aem/env.js';

describe('ajoImsScopesFromEnv', () => {
	it('includes projectedProductContext by default', () => {
		expect(ajoImsScopesFromEnv()).toEqual([...DEFAULT_AJO_IMS_SCOPES]);
		expect(ajoImsScopesFromEnv()).toContain('additional_info.projectedProductContext');
	});

	it('allows comma-separated override', () => {
		expect(
			ajoImsScopesFromEnv({
				AJO_IMS_SCOPES: 'openid,AdobeID,custom.scope'
			} as AppEnv)
		).toEqual(['openid', 'AdobeID', 'custom.scope']);
	});
});

describe('ajoCredentialsFromEnv', () => {
	it('returns credentials when IMS client + org are set', () => {
		const creds = ajoCredentialsFromEnv({
			IMS_CLIENT_ID: 'client',
			IMS_CLIENT_SECRET: 'secret',
			IMS_ORG_ID: 'ORG@AdobeOrg'
		} as AppEnv);

		expect(creds).toMatchObject({
			clientId: 'client',
			clientSecret: 'secret',
			imsOrg: 'ORG@AdobeOrg'
		});
		expect(creds?.scopes).toContain('additional_info.projectedProductContext');
	});
});
