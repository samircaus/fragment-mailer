export interface AjoFragmentBinding {
	id: string;
	resultVar: string;
}

export interface PreserveCfRefsOptions {
	primaryFragmentId: string;
	referenceFragmentIds: Record<string, string>;
}

interface RewriteResult {
	mjml: string;
	usedBindings: AjoFragmentBinding[];
}

export function rewriteCfRefsForAjo(template: string, opts: PreserveCfRefsOptions): RewriteResult {
	const used = new Map<string, AjoFragmentBinding>();
	used.set('__primary__', { id: opts.primaryFragmentId, resultVar: 'cf0' });

	const rewritten = template.replace(/\bcf\.([A-Za-z_][\w.]+)/g, (_full, path: string) => {
		const [root, ...rest] = path.split('.');
		const binding =
			opts.referenceFragmentIds[root] !== undefined
				? getOrCreateBinding(root, opts.referenceFragmentIds[root], used)
				: used.get('__primary__')!;
		const mappedPath =
			binding.resultVar +
			(binding.resultVar === 'cf0' ? `.${root}${rest.length ? `.${rest.join('.')}` : ''}` : rest.length ? `.${rest.join('.')}` : '');
		return mappedPath;
	});

	const usedBindings = [...used.values()];
	const withFragments = prependFragmentTags(rewritten, usedBindings);
	return { mjml: withFragments, usedBindings };
}

export function wrapAjoControlTagsForMjml(mjml: string): string {
	return mjml.replace(/\{%[#/]?\s*(if|else|endif|let|fragment|load)\b[\s\S]*?%\}/g, (tag) => {
		return `<mj-raw>${tag}</mj-raw>`;
	});
}

/** Convert Liquid-style control tags to AJO Handlebars personalization syntax. */
export function normalizeAjoPersonalizationSyntax(html: string): string {
	return html
		.replace(/\{%\s*if\s+/g, '{%#if ')
		.replace(/\{%\s*endif\s*%\}/g, '{%/if%}')
		.replace(/\{%\s*else\s*%\}/g, '{%else%}');
}

function getOrCreateBinding(
	key: string,
	id: string,
	used: Map<string, AjoFragmentBinding>
): AjoFragmentBinding {
	const existing = used.get(key);
	if (existing) return existing;
	const nextVar = `cf${used.size}`;
	const binding = { id, resultVar: nextVar };
	used.set(key, binding);
	return binding;
}

function prependFragmentTags(mjml: string, bindings: AjoFragmentBinding[]): string {
	if (bindings.length === 0) return mjml;
	const tags = bindings.map((b) => `{{fragment id='${b.id}' result='${b.resultVar}'}}`).join('\n');

	// Place declarations at the top of the document so subsequent usage can reference them.
	const mjmlStart = mjml.indexOf('<mjml');
	if (mjmlStart === -1) return `${tags}\n${mjml}`;
	return `${tags}\n${mjml}`;
}
