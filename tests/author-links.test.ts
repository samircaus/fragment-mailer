import { describe, it, expect } from 'vitest';
import {
	ajoExperienceCloudFragmentUrl,
	ajoExperienceCloudTemplateUrl,
	authorRepoHost,
	appCanvasHost,
	cfExperienceCloudBrowseUrl,
	cfExperienceCloudEditorUrl,
	cfAuthorEditorUrl,
	cfAuthorAssetsUrl,
	universalEditorCanvasUrl
} from '../src/lib/aem/author-links.js';

const UUID = '3027e723-a493-4b18-815d-d7c379847f5b';
const AUTHOR = 'https://author-p125048-e1847106.adobeaemcloud.com';

describe('cfExperienceCloudBrowseUrl', () => {
	it('builds CF console browse link for a DAM folder', () => {
		expect(
			cfExperienceCloudBrowseUrl(
				'/content/dam/email/en/campaigns',
				'https://author-p125048-e1847106.adobeaemcloud.com',
				'psc'
			)
		).toBe(
			'https://experience.adobe.com/?repo=author-p125048-e1847106.adobeaemcloud.com#/@psc/aem/cf/admin/content/dam/email/en/campaigns'
		);
	});

	it('returns null without folder path or author host', () => {
		expect(cfExperienceCloudBrowseUrl('', AUTHOR)).toBeNull();
		expect(cfExperienceCloudBrowseUrl('/content/dam/foo', '')).toBeNull();
	});
});

describe('ajoExperienceCloudTemplateUrl', () => {
	const TEMPLATE_ID = 'c30777cd-6e3c-496f-bbe1-79e781350b8d';

	it('builds Experience Cloud AJO content template link', () => {
		expect(ajoExperienceCloudTemplateUrl(TEMPLATE_ID, AUTHOR, 'psc', 'prod')).toBe(
			'https://experience.adobe.com/?repo=author-p125048-e1847106.adobeaemcloud.com#/@psc/sname:prod/journey-optimizer/content-templates/details/c30777cd-6e3c-496f-bbe1-79e781350b8d/email'
		);
	});

	it('returns null without template id or author host', () => {
		expect(ajoExperienceCloudTemplateUrl('', AUTHOR)).toBeNull();
		expect(ajoExperienceCloudTemplateUrl(TEMPLATE_ID, '')).toBeNull();
		expect(ajoExperienceCloudTemplateUrl('bad/id', AUTHOR)).toBeNull();
	});
});

describe('ajoExperienceCloudFragmentUrl', () => {
	const FRAGMENT_ID = '9a7e48d5-41d9-48b6-b0de-2037370cfc65';
	const PUBLICATION_ID = 'd62b9928-ae6a-4481-8e17-b7f44f5af977';

	it('builds Experience Cloud AJO fragment publication link', () => {
		expect(ajoExperienceCloudFragmentUrl(FRAGMENT_ID, PUBLICATION_ID, AUTHOR, 'psc', 'prod')).toBe(
			'https://experience.adobe.com/?repo=author-p125048-e1847106.adobeaemcloud.com#/@psc/sname:prod/journey-optimizer/fragments/9a7e48d5-41d9-48b6-b0de-2037370cfc65/publications/d62b9928-ae6a-4481-8e17-b7f44f5af977'
		);
	});

	it('returns null without ids or author host', () => {
		expect(ajoExperienceCloudFragmentUrl('', PUBLICATION_ID, AUTHOR)).toBeNull();
		expect(ajoExperienceCloudFragmentUrl(FRAGMENT_ID, '', AUTHOR)).toBeNull();
		expect(ajoExperienceCloudFragmentUrl(FRAGMENT_ID, PUBLICATION_ID, '')).toBeNull();
	});
});

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
