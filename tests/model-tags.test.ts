import { describe, it, expect } from 'vitest';
import {
	extractModelTags,
	modelHasAjoEnabledTag,
	tagMatchesAjoEnabled,
	ajoEnabledTagFixHint
} from '../src/lib/aem/model-tags.js';

const ORG = 'CDA11DC661266AB70A495F8B@AdobeOrg';
const required = `ajo-enabled:${ORG}/prod`;

describe('extractModelTags', () => {
	it('reads TagList items from /cf/models/{id}/tags API', () => {
		expect(
			extractModelTags({
				items: [
					{
						id: `ajo-enabled:${ORG}/prod`,
						title: 'AJO prod',
						path: `/content/cq:tags/ajo-enabled/${ORG}/prod`
					}
				]
			})
		).toContain(`ajo-enabled:${ORG}/prod`);
	});

	it('reads string tags array on inline model JSON', () => {
		expect(extractModelTags({ tags: [required, 'email'] })).toEqual([required, 'email']);
	});
});

describe('tagMatchesAjoEnabled', () => {
	it('matches exact tag', () => {
		expect(tagMatchesAjoEnabled(required, required)).toBe(true);
	});

	it('matches cq:tag path form', () => {
		expect(
			tagMatchesAjoEnabled(`/content/cq:tags/ajo-enabled/${ORG}/prod`, required)
		).toBe(true);
	});

	it('matches namespace id without full prefix duplication', () => {
		expect(tagMatchesAjoEnabled(`ajo-enabled:${ORG}/prod`, required)).toBe(true);
	});
});

describe('modelHasAjoEnabledTag', () => {
	it('matches when any collected tag qualifies', () => {
		expect(modelHasAjoEnabledTag([`/content/cq:tags/ajo-enabled/${ORG}/prod`], required)).toBe(
			true
		);
	});

	it('does not match when tag absent', () => {
		expect(modelHasAjoEnabledTag(['wknd:season/summer'], required)).toBe(false);
	});
});

describe('ajoEnabledTagFixHint', () => {
	it('mentions model or fragment', () => {
		expect(ajoEnabledTagFixHint(required, 'Email Campaign', 'model-1')).toContain('fragment');
	});
});
