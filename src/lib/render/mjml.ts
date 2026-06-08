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

const COMPILE_CACHE_MAX = 50;
const compileCache = new Map<string, CompileResult>();

async function compileCacheKey(mjmlSource: string, opts: CompileOptions): Promise<string> {
	const flags = `${opts.beautify ? '1' : '0'}:${opts.minify ? '1' : '0'}`;
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(mjmlSource));
	const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
	return `${flags}:${hash}`;
}

function touchCompileCacheEntry(key: string, value: CompileResult): void {
	if (compileCache.has(key)) compileCache.delete(key);
	compileCache.set(key, value);
	while (compileCache.size > COMPILE_CACHE_MAX) {
		const oldest = compileCache.keys().next().value;
		if (!oldest) break;
		compileCache.delete(oldest);
	}
}

/** Clear compile cache (tests). */
export function resetMjmlCompileCache(): void {
	compileCache.clear();
}

export async function compileMJML(
	mjmlSource: string,
	opts: CompileOptions = {}
): Promise<CompileResult> {
	const key = await compileCacheKey(mjmlSource, opts);
	const cached = compileCache.get(key);
	if (cached) {
		touchCompileCacheEntry(key, cached);
		return cached;
	}

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

		const compiled: CompileResult = { html: result.html, errors: [] };
		touchCompileCacheEntry(key, compiled);
		return compiled;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { html: null, errors: [{ message }] };
	}
}
