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

/** Replace load tags with AJO {% let %} fragment bindings. */
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

export function buildLetFragmentTag(varName: string, uuid: string, repoId: string): string {
	return `{% let ${varName} = fragment(id='aem:${uuid}?repoId=${repoId}') %}`;
}
