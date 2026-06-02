import { describe, expect, it } from 'vitest';
import {
	isUeBootstrapPath,
	tryUeBootstrapRedirect,
	ueSessionCookieOpts
} from '../src/lib/server/ue-bootstrap.js';

describe('isUeBootstrapPath', () => {
	it('matches preview, editor, and ue routes', () => {
		expect(isUeBootstrapPath('/preview/spring-promo')).toBe(true);
		expect(isUeBootstrapPath('/editor/spring-promo')).toBe(true);
		expect(isUeBootstrapPath('/ue/fragment-id')).toBe(true);
		expect(isUeBootstrapPath('/api/campaigns')).toBe(false);
	});
});

describe('tryUeBootstrapRedirect', () => {
	const author = 'https://author-p125048-e1847106.adobeaemcloud.com';
	const publish = 'https://publish-p125048-e1847106.adobeaemcloud.com';
	const env = { AEM_TIER: 'author', AEM_BASE_URL: author };

	it('stores session cookies and returns clean preview path', () => {
		const cookies = new Map<string, string>();
		const cookieApi = {
			set(name: string, value: string) {
				cookies.set(name, value);
			}
		} as Parameters<typeof tryUeBootstrapRedirect>[1];

		const url = new URL(
			`/preview/test-email?login-token=tok&author=${encodeURIComponent(author)}&publish=${encodeURIComponent(publish)}&templateId=promo`,
			'https://app.example.com'
		);
		const target = tryUeBootstrapRedirect(url, cookieApi, env);

		expect(target).toBe('/preview/test-email?templateId=promo');
		expect(cookies.get('aem_token')).toBe('tok');
		expect(cookies.get('aem_author_host')).toBe(author);
		expect(cookies.get('aem_publish_host')).toBe(publish);
	});

	it('derives publish host when publish param is omitted', () => {
		const cookies = new Map<string, string>();
		const cookieApi = {
			set(name: string, value: string) {
				cookies.set(name, value);
			}
		} as Parameters<typeof tryUeBootstrapRedirect>[1];

		const url = new URL(
			`/preview/test-email?login-token=tok&author=${encodeURIComponent(author)}`,
			'https://app.example.com'
		);
		tryUeBootstrapRedirect(url, cookieApi, env);

		expect(cookies.get('aem_publish_host')).toBe(publish);
	});

	it('ignores bootstrap on unrelated paths', () => {
		const cookieApi = { set: () => {} } as Parameters<typeof tryUeBootstrapRedirect>[1];
		const url = new URL(
			`/api/campaigns?login-token=tok&author=${encodeURIComponent(author)}`,
			'https://app.example.com'
		);
		expect(tryUeBootstrapRedirect(url, cookieApi, env)).toBeNull();
	});
});

describe('ueSessionCookieOpts', () => {
	it('uses SameSite=None on HTTPS', () => {
		expect(ueSessionCookieOpts(true).sameSite).toBe('none');
		expect(ueSessionCookieOpts(false).sameSite).toBe('lax');
	});
});
