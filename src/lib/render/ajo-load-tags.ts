// Parse and rewrite {% load varName as fragment ref='...' %} tags for AJO export.

export interface ParsedLoadTag {
	/** Full matched tag text */
	raw: string;
	/** Variable name bound by the load tag */
	varName: string;
	/** Reference expression inside ref='...' */
	refExpression: string;
	/** Start index in source */
	index: number;
}

const LOAD_TAG_RE =
	/\{%\s*load\s+([A-Za-z_]\w*)\s+as\s+fragment\s+ref=['"]([^'"]+)['"]\s*%\}/g;

export function parseLoadTags(template: string): ParsedLoadTag[] {
	const tags: ParsedLoadTag[] = [];
	let match: RegExpExecArray | null;
	const re = new RegExp(LOAD_TAG_RE.source, 'g');
	while ((match = re.exec(template)) !== null) {
		tags.push({
			raw: match[0],
			varName: match[1],
			refExpression: match[2],
			index: match.index
		});
	}
	return tags;
}

export function hasUnresolvedLoadTags(template: string): boolean {
	return LOAD_TAG_RE.test(template);
}

/** @deprecated Inline replacement leaves {% let %} after mj-preview; use stripLoadTags + hoistLetFragmentTagsInHtml. */
export function replaceLoadTags(
	template: string,
	replacements: Array<{ raw: string; letTag: string }>
): string {
	let output = template;
	for (const { raw, letTag } of replacements) {
		output = output.replace(raw, letTag);
	}
	return output;
}

/** Remove {% load %} tags from the template after bindings are resolved. */
export function stripLoadTags(template: string, loadTagRaws: string[]): string {
	let output = template;
	for (const raw of loadTagRaws) {
		output = output.replace(raw, '');
	}
	return output;
}

export function buildLetFragmentTag(varName: string, uuid: string, repoId: string): string {
	return `{% let ${varName} = fragment(id="aem:${uuid}?repoId=${repoId}") %}`;
}

/** Insert all {% let %} fragment bindings immediately after <body> so preheader tokens are in scope. */
export function hoistLetFragmentTagsInHtml(html: string, letTags: string[]): string {
	if (letTags.length === 0) return html;

	const block = `${letTags.join('\n')}\n`;
	const bodyOpen = html.match(/<body\b[^>]*>/i);
	if (!bodyOpen || bodyOpen.index === undefined) {
		return `${block}${html}`;
	}

	const insertAt = bodyOpen.index + bodyOpen[0].length;
	return `${html.slice(0, insertAt)}\n${block}${html.slice(insertAt)}`;
}
