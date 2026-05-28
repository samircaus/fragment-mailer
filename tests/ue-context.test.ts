import { describe, expect, it } from 'vitest';
import {
	cfMasterVariationPath,
	cfUeResourceUrn,
	isUniversalEditorReferer
} from '../src/lib/ue/context.js';

describe('isUniversalEditorReferer', () => {
	it('matches Experience Cloud referer', () => {
		expect(
			isUniversalEditorReferer('https://experience.adobe.com/#/@tenant/universal-editor/...')
		).toBe(true);
	});

	it('rejects other origins', () => {
		expect(isUniversalEditorReferer('https://example.com/editor')).toBe(false);
		expect(isUniversalEditorReferer(null)).toBe(false);
	});
});

describe('cfUeResourceUrn', () => {
	it('appends master variation path for CF resources', () => {
		expect(cfUeResourceUrn('/content/dam/campaigns/spring-promo')).toBe(
			'urn:aemconnection:/content/dam/campaigns/spring-promo/jcr:content/data/master'
		);
	});

	it('does not duplicate master path', () => {
		const path = '/content/dam/campaigns/spring-promo/jcr:content/data/master';
		expect(cfMasterVariationPath(path)).toBe(path);
		expect(cfUeResourceUrn(path)).toBe(`urn:aemconnection:${path}`);
	});
});
