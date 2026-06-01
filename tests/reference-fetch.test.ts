import { describe, expect, it } from 'vitest';
import {
	authorFragmentQueryParams,
	cfReferenceDepth,
	DELIVERY_CF_REFERENCES
} from '../src/lib/aem/reference-fetch.js';

describe('reference-fetch', () => {
	it('uses all-hydrated for delivery', () => {
		expect(DELIVERY_CF_REFERENCES).toBe('all-hydrated');
	});

	it('includes depth on author fragment queries', () => {
		const qs = authorFragmentQueryParams();
		expect(qs.get('references')).toBe('all-hydrated');
		expect(qs.get('depth')).toBe('3');
	});

	it('respects AEM_CF_REFERENCE_DEPTH', () => {
		expect(cfReferenceDepth({ AEM_CF_REFERENCE_DEPTH: '5' })).toBe(5);
	});
});
