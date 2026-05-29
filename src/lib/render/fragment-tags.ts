// Resolve AJO expression fragment references for local preview.

const FRAGMENT_REF_RE =
	/\{%#fragment\s+id=["']([^"']+)["']\s*%\}\s*\{%\/fragment%\}/g;

export function collectFragmentIds(template: string): string[] {
	const ids = new Set<string>();
	for (const match of template.matchAll(FRAGMENT_REF_RE)) {
		const id = match[1]?.trim();
		if (id) ids.add(id);
	}
	return [...ids];
}

/** Inline fragment expression content in place of {%#fragment id="…"%}{%/fragment%} tags. */
export function inlineFragmentTags(
	template: string,
	fragments: Record<string, string>
): string {
	return template.replace(FRAGMENT_REF_RE, (_full, id: string) => {
		const key = id.trim();
		return fragments[key] ?? '';
	});
}
