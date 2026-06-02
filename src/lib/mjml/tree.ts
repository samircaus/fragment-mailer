export interface MjmlFlatNode {
	tag: string;
	depth: number;
	path: string;
	childCount: number;
	closingOccurrence: number;
}

export function buildMjmlTree(mjml: string): MjmlFlatNode[] {
	if (!mjml.trim() || typeof DOMParser === 'undefined') return [];
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<x-root>${mjml}</x-root>`, 'text/html');
		const nodes: MjmlFlatNode[] = [];
		const tagCounts = new Map<string, number>();

		function walk(el: Element, depth: number, path: string) {
			const tag = el.tagName.toLowerCase();
			if (!tag.startsWith('mj-') && tag !== 'mjml') return;

			const occ = (tagCounts.get(tag) ?? 0) + 1;
			tagCounts.set(tag, occ);

			const mjmlChildren = [...el.children].filter((c) => {
				const t = c.tagName.toLowerCase();
				return t.startsWith('mj-') || t === 'mjml';
			});

			nodes.push({ tag, depth, path, childCount: mjmlChildren.length, closingOccurrence: occ });

			mjmlChildren.forEach((child, i) => walk(child, depth + 1, `${path}.${i}`));
		}

		const wrapper = doc.body.querySelector('x-root') ?? doc.body;
		[...wrapper.children].forEach((child, i) => {
			const tag = child.tagName.toLowerCase();
			if (tag.startsWith('mj-') || tag === 'mjml') walk(child, 0, String(i));
		});

		return nodes;
	} catch {
		return [];
	}
}

export function isMjmlTreeNodeHidden(path: string, collapsedPaths: Set<string>): boolean {
	const parts = path.split('.');
	for (let i = 1; i < parts.length; i++) {
		if (collapsedPaths.has(parts.slice(0, i).join('.'))) return true;
	}
	return false;
}

export function mjmlTreeNodeColor(tag: string): string {
	if (tag === 'mjml' || tag === 'mj-body' || tag === 'mj-section' || tag === 'mj-column') {
		return 'structure';
	}
	if (tag === 'mj-head' || tag.startsWith('mj-attributes') || tag === 'mj-style' || tag === 'mj-preview') {
		return 'head';
	}
	return 'content';
}
