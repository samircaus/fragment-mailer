// MJML compilation wrapper.
//
// Spike result: mjml-browser v5.2.2 returns empty objects (broken release).
// Using the standard mjml package (v5) instead.
//
// Workers compatibility: mjml v5 is async and no longer uses fs at compile time.
// It should work with the nodejs_compat compatibility flag on Cloudflare Workers.
// Needs a Workers-env smoke test before production — tracked in README § Open spikes.
//
// mjml v5 API is async (compile returns a Promise), which is why this function is async.

import mjml2html from 'mjml';

export interface CompileOptions {
	beautify?: boolean;
	minify?: boolean;
}

export type CompileResult =
	| { html: string; errors: never[] }
	| { html: null; errors: Array<{ message: string; line?: number }> };

export async function compileMJML(
	mjmlSource: string,
	opts: CompileOptions = {}
): Promise<CompileResult> {
	try {
		// mjml v5 is async
		const result = await (mjml2html as unknown as (src: string, opts: object) => Promise<{
			html: string;
			errors: Array<{ message: string; severity?: string; formattedMessage?: string }>;
		}>)(mjmlSource, {
			beautify: opts.beautify ?? false,
			minify: opts.minify ?? false,
			validationLevel: 'soft'
		});

		if (result.errors && result.errors.length > 0) {
			const fatalErrors = result.errors.filter((e) => e.severity === 'error');
			if (fatalErrors.length > 0) {
				return {
					html: null,
					errors: fatalErrors.map((e) => ({
						message: e.formattedMessage ?? e.message
					}))
				};
			}
		}

		return { html: result.html, errors: [] };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { html: null, errors: [{ message }] };
	}
}
