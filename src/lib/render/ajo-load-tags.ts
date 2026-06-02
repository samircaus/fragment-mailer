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
	const id = `aem:${uuid}?repoId=${repoId}`;
	return `{{fragment id="${id}" result="${varName}"}}`;
}

const PREHEADER_DIV_RE =
	/<div\b[^>]*style="[^"]*display:\s*none[^"]*"[^>]*>/i;

/** Insert AEM fragment bindings inside the preheader hidden div (AJO editor block order). */
export function hoistLetFragmentTagsInHtml(html: string, letTags: string[]): string {
	if (letTags.length === 0) return html;

	const block = `${letTags.join('\n')}\n`;
	const preheader = html.match(PREHEADER_DIV_RE);
	if (preheader?.index !== undefined) {
		const insertAt = preheader.index + preheader[0].length;
		return `${html.slice(0, insertAt)}\n${block}${html.slice(insertAt)}`;
	}

	const bodyOpen = html.match(/<body\b[^>]*>/i);
	if (!bodyOpen || bodyOpen.index === undefined) {
		return `${block}${html}`;
	}

	const insertAt = bodyOpen.index + bodyOpen[0].length;
	const wrapper =
		'<div aria-hidden="true" style="display:none;max-height:0;overflow:hidden;line-height:0;mso-hide:all;font-size:0;">\n' +
		block +
		'</div>\n';
	return `${html.slice(0, insertAt)}\n${wrapper}${html.slice(insertAt)}`;
}
