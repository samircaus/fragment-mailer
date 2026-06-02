import { describe, expect, it } from 'vitest';
import {
	authConfigFromEnv,
	authenticateRequest,
	getRouteAuthLevel,
	isAllowedAuthorHost,
	isAllowedPublishHost,
	isAuthEnabled,
	secretsEqual
} from '../src/lib/server/auth.js';

describe('isAuthEnabled', () => {
	it('is off when no credentials configured', () => {
		expect(isAuthEnabled({})).toBe(false);
	});

	it('is on with APP_AUTH_SECRET', () => {
		expect(isAuthEnabled({ secret: 'test-secret' })).toBe(true);
	});

	it('is on with Cloudflare Access pair', () => {
		expect(
			isAuthEnabled({
				cfAccessTeamDomain: 'team.cloudflareaccess.com',
				cfAccessAudience: 'aud-123'
			})
		).toBe(true);
	});

	it('is off with only team domain (missing audience)', () => {
		expect(isAuthEnabled({ cfAccessTeamDomain: 'team.cloudflareaccess.com' })).toBe(false);
	});
});

describe('secretsEqual', () => {
	it('matches equal strings', () => {
		expect(secretsEqual('abc', 'abc')).toBe(true);
	});

	it('rejects different strings', () => {
		expect(secretsEqual('abc', 'abd')).toBe(false);
		expect(secretsEqual('abc', 'ab')).toBe(false);
	});
});

describe('getRouteAuthLevel', () => {
	it('allows UE bootstrap without auth', async () => {
		expect(
			await getRouteAuthLevel('/ue/fragment-id', 'GET', new URL('http://x/ue/fragment-id'), new Request('http://x'))
		).toBe('public');
	});

	it('protects API routes', async () => {
		expect(
			await getRouteAuthLevel('/api/campaigns', 'GET', new URL('http://x/api/campaigns'), new Request('http://x'))
		).toBe('protected');
	});

	it('strict for AJO push via query', async () => {
		expect(
			await getRouteAuthLevel(
				'/api/export/ajo',
				'POST',
				new URL('http://x/api/export/ajo?push=true'),
				new Request('http://x', { method: 'POST' })
			)
		).toBe('strict');
	});

	it('strict for AJO push via JSON body', async () => {
		const req = new Request('http://x/api/export/ajo', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ push: true, mjml: '<mjml/>' })
		});
		expect(await getRouteAuthLevel('/api/export/ajo', 'POST', new URL('http://x/api/export/ajo'), req)).toBe(
			'strict'
		);
	});

	it('protected for AJO export without push', async () => {
		const req = new Request('http://x/api/export/ajo', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ push: false, mjml: '<mjml/>' })
		});
		expect(await getRouteAuthLevel('/api/export/ajo', 'POST', new URL('http://x/api/export/ajo'), req)).toBe(
			'protected'
		);
	});

	it('strict for POST /api/session', async () => {
		expect(
			await getRouteAuthLevel('/api/session', 'POST', new URL('http://x/api/session'), new Request('http://x'))
		).toBe('strict');
	});
});

describe('authenticateRequest', () => {
	const config = { secret: 'top-secret' };

	it('allows all when auth disabled', async () => {
		const result = await authenticateRequest(new Request('http://x'), {}, {}, 'protected');
		expect(result).toEqual({ ok: true, method: 'disabled' });
	});

	it('accepts bearer secret on protected routes', async () => {
		const req = new Request('http://x', {
			headers: { Authorization: 'Bearer top-secret' }
		});
		const result = await authenticateRequest(req, {}, config, 'protected');
		expect(result).toEqual({ ok: true, method: 'bearer-secret' });
	});

	it('accepts UE session on protected routes', async () => {
		const result = await authenticateRequest(
			new Request('http://x'),
			{ aem: { token: 't', authorHost: 'https://author.example.com' } },
			config,
			'protected'
		);
		expect(result).toEqual({ ok: true, method: 'ue-session' });
	});

	it('rejects UE session alone on strict routes', async () => {
		const result = await authenticateRequest(
			new Request('http://x'),
			{ aem: { token: 't', authorHost: 'https://author.example.com' } },
			config,
			'strict'
		);
		expect(result).toEqual({ ok: false });
	});

	it('accepts bearer secret on strict routes', async () => {
		const req = new Request('http://x', {
			headers: { Authorization: 'Bearer top-secret' }
		});
		const result = await authenticateRequest(req, {}, config, 'strict');
		expect(result).toEqual({ ok: true, method: 'bearer-secret' });
	});

	it('rejects missing credentials when auth enabled', async () => {
		const result = await authenticateRequest(new Request('http://x'), {}, config, 'protected');
		expect(result).toEqual({ ok: false });
	});
});

describe('isAllowedPublishHost', () => {
	const author = 'https://author-p125048-e1847106.adobeaemcloud.com';
	const publish = 'https://publish-p125048-e1847106.adobeaemcloud.com';
	const env = { AEM_TIER: 'author', AEM_BASE_URL: author };

	it('allows publish host derived from author', () => {
		expect(isAllowedPublishHost(publish, author, env)).toBe(true);
	});

	it('rejects unrelated publish host when AEM is configured', () => {
		expect(isAllowedPublishHost('https://evil.example.com', author, env)).toBe(false);
	});
});

describe('isAllowedAuthorHost', () => {
	const env = {
		AEM_TIER: 'author',
		AEM_BASE_URL: 'https://author-p125048-e1847106.adobeaemcloud.com'
	};

	it('allows configured author host', () => {
		expect(isAllowedAuthorHost('https://author-p125048-e1847106.adobeaemcloud.com', env)).toBe(true);
	});

	it('rejects unknown host when AEM is configured', () => {
		expect(isAllowedAuthorHost('https://evil.example.com', env)).toBe(false);
	});

	it('allows any host when no AEM URL configured', () => {
		expect(isAllowedAuthorHost('https://anything.example.com', {})).toBe(true);
	});
});

describe('authConfigFromEnv', () => {
	it('normalizes Cloudflare Access team domain', () => {
		const config = authConfigFromEnv({
			CF_ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com/',
			CF_ACCESS_AUD: 'aud-tag'
		});
		expect(config.cfAccessTeamDomain).toBe('team.cloudflareaccess.com');
		expect(config.cfAccessAudience).toBe('aud-tag');
	});
});
