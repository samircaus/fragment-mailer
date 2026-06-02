export function normalizePath(path: string): string {
	return `/${path}`
		.replace(/\/+/g, '/')
		.replace(/\/$/, '');
}

/** Relative folder path under campaigns root: `/` or `/q1/sub`. */
export function folderForCampaign(cfPath: string, basePath: string): string {
	const normalizedPath = normalizePath(cfPath);
	const normalizedBase = normalizePath(basePath);
	if (!normalizedPath.startsWith(normalizedBase)) return '/';
	const relativePath = normalizedPath.slice(normalizedBase.length).replace(/^\/+/, '');
	const pathParts = relativePath.split('/').filter(Boolean);
	if (pathParts.length <= 1) return '/';
	return `/${pathParts.slice(0, -1).join('/')}`;
}

export function absoluteFolderPath(relPath: string, basePath: string): string {
	const normalizedBase = normalizePath(basePath);
	if (relPath === '/') return normalizedBase;
	return `${normalizedBase}/${relPath.replace(/^\/+/, '')}`;
}

export function parentFolderPath(relPath: string): string {
	if (relPath === '/') return '/';
	const parts = relPath.split('/').filter(Boolean);
	parts.pop();
	return parts.length ? `/${parts.join('/')}` : '/';
}

export function rootFolderLabel(campaignsPath: string): string {
	const segment = campaignsPath.split('/').filter(Boolean).pop() ?? 'home';
	return formatFolderSegment(segment);
}

export interface BreadcrumbSegment {
	label: string;
	relPath: string;
	depth: number;
}

export function buildBreadcrumbSegments(
	relFolderPath: string,
	campaignsPath: string
): BreadcrumbSegment[] {
	const rootLabel = rootFolderLabel(campaignsPath);
	const segments: BreadcrumbSegment[] = [{ label: rootLabel, relPath: '/', depth: 0 }];

	const parts =
		relFolderPath === '/' ? [] : relFolderPath.replace(/^\/+/, '').split('/').filter(Boolean);
	let acc = '';
	for (let i = 0; i < parts.length; i++) {
		acc += `/${parts[i]}`;
		segments.push({
			label: formatFolderSegment(parts[i]!),
			relPath: acc,
			depth: i + 1
		});
	}
	return segments;
}

export type DisplayBreadcrumbPart =
	| { type: 'segment'; segment: BreadcrumbSegment; segmentIndex: number }
	| { type: 'ellipsis'; skipped: BreadcrumbSegment[] };

const MAX_VISIBLE_CRUMBS = 4;

/** Collapse middle segments when trail is long. */
export function displayBreadcrumbParts(segments: BreadcrumbSegment[]): DisplayBreadcrumbPart[] {
	if (segments.length <= MAX_VISIBLE_CRUMBS) {
		return segments.map((segment, segmentIndex) => ({
			type: 'segment' as const,
			segment,
			segmentIndex
		}));
	}

	const first = segments[0]!;
	const lastTwo = segments.slice(-2);
	const skipped = segments.slice(1, -2);

	return [
		{ type: 'segment', segment: first, segmentIndex: 0 },
		{ type: 'ellipsis', skipped },
		...lastTwo.map((segment, i) => ({
			type: 'segment' as const,
			segment,
			segmentIndex: segments.length - 2 + i
		}))
	];
}

export function collectAllFolderPaths(
	campaigns: { cfPath: string }[],
	basePath: string,
	includeRelativePaths: string[] = []
): Set<string> {
	const paths = new Set<string>(['/']);
	const normalizedBase = normalizePath(basePath);

	for (const campaign of campaigns) {
		const folder = folderForCampaign(campaign.cfPath, normalizedBase);
		addPathAndAncestors(paths, folder);
	}

	for (const relPath of includeRelativePaths) {
		addPathAndAncestors(paths, normalizeRelativePath(relPath));
	}

	return paths;
}

/** Immediate child folders of `relPath` that exist in the tree. */
export function childFolderPaths(relPath: string, allPaths: Set<string>): string[] {
	const children = new Set<string>();
	const prefix = relPath === '/' ? '/' : relPath;

	for (const p of allPaths) {
		if (p === relPath) continue;
		if (relPath === '/') {
			const parts = p.split('/').filter(Boolean);
			if (parts.length >= 1) children.add(`/${parts[0]}`);
			continue;
		}
		if (!p.startsWith(`${prefix}/`)) continue;
		const rest = p.slice(prefix.length + 1);
		const first = rest.split('/').filter(Boolean)[0];
		if (first) children.add(`${prefix}/${first}`);
	}

	return [...children].sort((a, b) => a.localeCompare(b));
}

/** Folders at the same level as `relPath` (same parent). */
export function siblingFolderPaths(relPath: string, allPaths: Set<string>): string[] {
	return childFolderPaths(parentFolderPath(relPath), allPaths);
}

export function folderDisplayName(relPath: string, campaignsPath: string): string {
	if (relPath === '/') return rootFolderLabel(campaignsPath);
	const parts = relPath.split('/').filter(Boolean);
	return formatFolderSegment(parts[parts.length - 1] ?? relPath);
}

export function parseFolderFromSearchParam(value: string | null): string {
	if (!value?.trim()) return '/';
	const raw = value.trim();
	if (raw.includes('..')) return '/';
	const parts = raw
		.split('/')
		.filter(Boolean)
		.map((p) => p.replace(/[^a-zA-Z0-9_-]/g, ''))
		.filter(Boolean);
	if (parts.length === 0) return '/';
	return `/${parts.join('/')}`;
}

export function folderToSearchParam(relPath: string): string | null {
	if (relPath === '/') return null;
	return relPath.replace(/^\//, '');
}

export function campaignsInFolder<T extends { cfPath: string }>(
	campaigns: T[],
	relPath: string,
	basePath: string
): T[] {
	const normalizedBase = normalizePath(basePath);
	return campaigns.filter((c) => folderForCampaign(c.cfPath, normalizedBase) === relPath);
}

function normalizeRelativePath(path: string): string {
	if (!path || path === '/') return '/';
	return `/${path.replace(/^\/+/, '')}`;
}

function addPathAndAncestors(paths: Set<string>, relPath: string): void {
	const normalized = normalizeRelativePath(relPath);
	paths.add(normalized);
	const parts = normalized.split('/').filter(Boolean);
	for (let i = 0; i < parts.length; i++) {
		const parent = `/${parts.slice(0, i).join('/')}`;
		paths.add(parent === '' ? '/' : parent);
	}
}

function formatFolderSegment(segment: string): string {
	const decoded = decodeURIComponent(segment);
	const spaced = decoded
		.replace(/[-_]+/g, ' ')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.trim();
	if (!spaced) return segment;
	return spaced
		.split(/\s+/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(' ');
}
