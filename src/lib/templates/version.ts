/** Bump the patch segment of a semver-like string (1.0.0 → 1.0.1). */
export function bumpPatchVersion(version: string): string {
	const parts = version.split('.');
	const last = Number.parseInt(parts[parts.length - 1] ?? '', 10);
	if (Number.isNaN(last)) return `${version}.1`;
	parts[parts.length - 1] = String(last + 1);
	return parts.join('.');
}

export function versionIdForFamily(familyId: string, version: string): string {
	return `${familyId}@${version}`;
}

export function parseVersionFromId(id: string, familyId: string): string | null {
	const prefix = `${familyId}@`;
	if (!id.startsWith(prefix)) return null;
	const version = id.slice(prefix.length);
	return version.length > 0 ? version : null;
}
