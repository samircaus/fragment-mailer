import { describe, it, expect } from 'vitest';
import {
	convertLiquidDefaultFilters,
	normalizeAjoPersonalizationSyntax,
	rewriteCfRefsForAjo,
	stripMjRawPersonalizationWrappers
} from '../src/lib/render/ajo-export.js';

describe('rewriteCfRefsForAjo', () => {
	it('rewrites primary and referenced cf paths to fragment vars', () => {
		const template = `
<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>{{ cf.heroHeadline }}</mj-text>
        {% if cf.featuredOffer.headline %}
          <mj-text>{{ cf.featuredOffer.headline }}</mj-text>
        {% endif %}
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

		const result = rewriteCfRefsForAjo(template, {
			primaryFragmentId: '/content/dam/campaigns/welcome-series-1',
			referenceFragmentIds: {
				featuredOffer: '/content/dam/offers/spring-sale'
			}
		});

		expect(result.mjml).toContain("{{fragment id='/content/dam/campaigns/welcome-series-1' result='cf0'}}");
		expect(result.mjml).toContain("{{fragment id='/content/dam/offers/spring-sale' result='cf1'}}");
		expect(result.mjml).toContain('{{ cf0.heroHeadline }}');
		expect(result.mjml).toContain('{% if cf1.headline %}');
		expect(result.mjml).toContain('{{ cf1.headline }}');
	});
});

describe('convertLiquidDefaultFilters', () => {
	it('rewrites default filter to AJO if blocks', () => {
		expect(convertLiquidDefaultFilters(`href="{{offer0.ctaLink | default: '#'}}"`)).toBe(
			'href="{%#if offer0.ctaLink %}{{offer0.ctaLink}}{%else%}#{%/if%}"'
		);
	});
});

describe('stripMjRawPersonalizationWrappers', () => {
	it('unwraps control tags from mj-raw', () => {
		const html = '<div><mj-raw>{% if x %}</mj-raw>y<mj-raw>{% endif %}</mj-raw></div>';
		expect(stripMjRawPersonalizationWrappers(html)).toBe('<div>{% if x %}y{% endif %}</div>');
	});
});

describe('normalizeAjoPersonalizationSyntax', () => {
	it('converts liquid if/endif to AJO handlebars control tags', () => {
		const html = '{% if cf.bannerImage %}<img/>{% else %}<p/>{% endif %}';
		expect(normalizeAjoPersonalizationSyntax(html)).toBe(
			'{%#if cf.bannerImage %}<img/>{%else%}<p/>{%/if%}'
		);
	});
});
