import { describe, it, expect } from 'vitest';
import {
	parseLoadTags,
	replaceLoadTags,
	buildLetFragmentTag,
	hasUnresolvedLoadTags
} from '../src/lib/render/ajo-load-tags.js';

describe('parseLoadTags', () => {
	it('parses load tags with single-quoted ref', () => {
		const template = `
{% load cf as fragment ref='this' %}
{% load offer as fragment ref='this.featuredOffer' %}
<mj-text>{{ cf.heroHeadline }}</mj-text>`;

		const tags = parseLoadTags(template);
		expect(tags).toHaveLength(2);
		expect(tags[0].varName).toBe('cf');
		expect(tags[0].refExpression).toBe('this');
		expect(tags[1].varName).toBe('offer');
		expect(tags[1].refExpression).toBe('this.featuredOffer');
	});

	it('parses indexed and nested refs', () => {
		const template = `{% load item as fragment ref='this.offers[0]' %}`;
		const tags = parseLoadTags(template);
		expect(tags[0].refExpression).toBe('this.offers[0]');
	});
});

describe('replaceLoadTags', () => {
	it('replaces load tags with let fragment bindings', () => {
		const raw = "{% load cf as fragment ref='this' %}";
		const letTag = buildLetFragmentTag('cf', 'uuid-123', 'publish.example.com');
		const out = replaceLoadTags(raw, [{ raw, letTag }]);
		expect(out).toContain("{% let cf = fragment(id='aem:uuid-123?repoId=publish.example.com') %}");
		expect(hasUnresolvedLoadTags(out)).toBe(false);
	});
});
