export interface HtmlFlatNode {
	tag: string;
	depth: number;
	path: string;
	childCount: number;
	closingOccurrence: number;
}

const SKIP_TAGS = new Set(['html', 'head', 'meta', 'link', 'style', 'title', 'x-root']);

export function buildHtmlTree(source: string): HtmlFlatNode[] {
	if (!source.trim() || typeof DOMParser === 'undefined') return [];
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(source, 'text/html');
		const nodes: HtmlFlatNode[] = [];
		const tagCounts = new Map<string, number>();

		function walk(el: Element, depth: number, path: string) {
			const tag = el.tagName.toLowerCase();
			if (SKIP_TAGS.has(tag)) {
				[...el.children].forEach((child, i) => walk(child, depth, `${path}.${i}`));
				return;
			}

			const occ = (tagCounts.get(tag) ?? 0) + 1;
			tagCounts.set(tag, occ);

			const children = [...el.children];
			nodes.push({ tag, depth, path, childCount: children.length, closingOccurrence: occ });
			children.forEach((child, i) => walk(child, depth + 1, `${path}.${i}`));
		}

		const root = doc.body;
		if (!root) return [];

		[...root.children].forEach((child, i) => walk(child, 0, String(i)));
		if (nodes.length === 0) {
			walk(root, 0, '0');
		}

		return nodes;
	} catch {
		return [];
	}
}

export function isHtmlTreeNodeHidden(path: string, collapsedPaths: Set<string>): boolean {
	const parts = path.split('.');
	for (let i = 1; i < parts.length; i++) {
		if (collapsedPaths.has(parts.slice(0, i).join('.'))) return true;
	}
	return false;
}
