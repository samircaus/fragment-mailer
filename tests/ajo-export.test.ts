import { describe, it, expect } from 'vitest';
import { rewriteCfRefsForAjo } from '../src/lib/render/ajo-export.js';

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

		expect(result.mjml).toContain("{% fragment id='/content/dam/campaigns/welcome-series-1' result='cf0' %}");
		expect(result.mjml).toContain("{% fragment id='/content/dam/offers/spring-sale' result='cf1' %}");
		expect(result.mjml).toContain('{{ cf0.heroHeadline }}');
		expect(result.mjml).toContain('{% if cf1.headline %}');
		expect(result.mjml).toContain('{{ cf1.headline }}');
	});
});
