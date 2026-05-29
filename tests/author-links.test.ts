import { describe, it, expect } from 'vitest';
import {
	authorRepoHost,
	appCanvasHost,
	cfExperienceCloudEditorUrl,
	cfAuthorEditorUrl,
	cfAuthorAssetsUrl,
	universalEditorCanvasUrl
} from '../src/lib/aem/author-links.js';

const UUID = '3027e723-a493-4b18-815d-d7c379847f5b';
const AUTHOR = 'https://author-p125048-e1847106.adobeaemcloud.com';

describe('cfExperienceCloudEditorUrl', () => {
	it('builds Experience Cloud CF editor link', () => {
		expect(cfExperienceCloudEditorUrl(UUID, AUTHOR, 'psc')).toBe(
			'https://experience.adobe.com/?repo=author-p125048-e1847106.adobeaemcloud.com#/@psc/aem/cf/editor/editor/3027e723-a493-4b18-815d-d7c379847f5b'
		);
	});

	it('returns null without uuid or author host', () => {
		expect(cfExperienceCloudEditorUrl('', AUTHOR)).toBeNull();
		expect(cfExperienceCloudEditorUrl(UUID, '')).toBeNull();
		expect(cfExperienceCloudEditorUrl('not-a-uuid', AUTHOR)).toBeNull();
	});
});

describe('authorRepoHost', () => {
	it('strips protocol and trailing slash', () => {
		expect(authorRepoHost('https://author-p125048-e1847106.adobeaemcloud.com/')).toBe(
			'author-p125048-e1847106.adobeaemcloud.com'
		);
	});
});

describe('appCanvasHost', () => {
	it('extracts host from origin', () => {
		expect(appCanvasHost('https://fragment-mailer.example.workers.dev')).toBe(
			'fragment-mailer.example.workers.dev'
		);
		expect(appCanvasHost('http://localhost:5173')).toBe('localhost:5173');
	});
});

describe('universalEditorCanvasUrl', () => {
	it('builds UE canvas link from current app origin', () => {
		expect(
			universalEditorCanvasUrl(
				'test-email',
				'https://fragment-mailer.samircaus.workers.dev',
				AUTHOR,
				'psc'
			)
		).toBe(
			'https://experience.adobe.com/?repo=author-p125048-e1847106.adobeaemcloud.com#/@psc/aem/editor/canvas/fragment-mailer.samircaus.workers.dev/preview/test-email'
		);
	});

	it('returns null without campaign id or author host', () => {
		expect(universalEditorCanvasUrl('', 'https://app.example.com', AUTHOR)).toBeNull();
		expect(universalEditorCanvasUrl('test-email', 'https://app.example.com', '')).toBeNull();
	});
});

describe('cfAuthorEditorUrl', () => {
	it('builds editor.html link from cf path and author host', () => {
		expect(
			cfAuthorEditorUrl('/content/dam/email/en/campaigns/spring-promo', AUTHOR)
		).toBe(
			'https://author-p125048-e1847106.adobeaemcloud.com/editor.html/content/dam/email/en/campaigns/spring-promo.html'
		);
	});
});

describe('cfAuthorAssetsUrl', () => {
	it('builds assets.html link', () => {
		expect(cfAuthorAssetsUrl('/content/dam/campaigns/foo', 'https://author.example.com/')).toBe(
			'https://author.example.com/assets.html/content/dam/campaigns/foo'
		);
	});
});
