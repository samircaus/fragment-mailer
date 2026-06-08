import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('mjml', () => ({
	default: vi.fn(async (src: string) => ({
		html: `<html>${src.length}</html>`,
		errors: []
	}))
}));

import mjml2html from 'mjml';
import { compileMJML, resetMjmlCompileCache } from '../src/lib/render/mjml.js';

afterEach(() => {
	resetMjmlCompileCache();
	vi.mocked(mjml2html).mockClear();
});

describe('compileMJML cache', () => {
	it('returns cached HTML for identical resolved MJML', async () => {
		const mjml = '<mjml><mj-body><mj-text>Hi</mj-text></mj-body></mjml>';

		const first = await compileMJML(mjml);
		const second = await compileMJML(mjml);

		expect(first.html).toBe(second.html);
		expect(vi.mocked(mjml2html)).toHaveBeenCalledTimes(1);
	});

	it('recompiles when beautify option changes', async () => {
		const mjml = '<mjml><mj-body><mj-text>Hi</mj-text></mj-body></mjml>';

		await compileMJML(mjml);
		await compileMJML(mjml, { beautify: true });

		expect(vi.mocked(mjml2html)).toHaveBeenCalledTimes(2);
	});
});
