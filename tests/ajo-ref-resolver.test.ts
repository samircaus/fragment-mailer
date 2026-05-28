import { describe, it, expect } from 'vitest';
import { parseRefExpression } from '../src/lib/render/ajo-ref-resolver.js';

describe('parseRefExpression', () => {
	it('parses this', () => {
		expect(parseRefExpression('this')).toEqual({ kind: 'this' });
	});

	it('parses this.field', () => {
		expect(parseRefExpression('this.featuredOffer')).toEqual({
			kind: 'field',
			field: 'featuredOffer'
		});
	});

	it('parses this.field[index]', () => {
		expect(parseRefExpression('this.secondaryOffers[0]')).toEqual({
			kind: 'indexed',
			field: 'secondaryOffers',
			index: 0
		});
	});

	it('parses this.field.subField', () => {
		expect(parseRefExpression('this.bundle.primaryOffer')).toEqual({
			kind: 'nested',
			field: 'bundle',
			subField: 'primaryOffer'
		});
	});

	it('returns null for invalid expressions', () => {
		expect(parseRefExpression('campaign.featured')).toBeNull();
	});
});
