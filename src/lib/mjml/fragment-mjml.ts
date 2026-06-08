/** Detect MJML fragment source (vs AJO HTML expression stored after publish). */
export function isMjmlFragmentSource(source: string): boolean {
	return /<mj[\w-]/i.test(source);
}

/** Wrap partial fragment MJML in a minimal document for the MJML compiler. */
export function wrapFragmentMjmlForCompile(mjml: string): string {
	const trimmed = mjml.trim();
	if (!trimmed) return '<mjml><mj-body></mj-body></mjml>';

	if (/^<mjml[\s>]/i.test(trimmed)) {
		if (!/<mj-body[\s>]/i.test(trimmed)) {
			return trimmed
				.replace(/^<mjml([^>]*)>/i, '<mjml$1><mj-body>')
				.replace(/<\/mjml>\s*$/i, '</mj-body></mjml>');
		}
		return trimmed;
	}

	return `<mjml><mj-body>${trimmed}</mj-body></mjml>`;
}

/** Strip synthetic document wrapper so the editor shows only the fragment body. */
export function unwrapFragmentMjmlForEdit(mjml: string): string {
	const trimmed = mjml.trim();
	if (!/^<mjml[\s>]/i.test(trimmed)) return trimmed;

	const bodyMatch = trimmed.match(/<mj-body[^>]*>([\s\S]*)<\/mj-body>/i);
	if (!bodyMatch) return trimmed;

	const inner = bodyMatch[1]?.trim() ?? '';
	return inner || trimmed;
}

/** Wrap resolved HTML expression content for iframe preview. */
export function wrapFragmentHtmlForPreview(html: string): string {
	const trimmed = html.trim();
	if (!trimmed) return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>';
	if (/^<!doctype/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) return trimmed;
	return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${trimmed}</body></html>`;
}
