// Load Adobe OAuth server-to-server credentials from env or oauth.json (local dev).

import type { AppEnv } from '$lib/aem/env.js';

export interface OAuthCredentials {
	clientId: string;
	clientSecret: string;
	imsOrg?: string;
	imsHost: string;
	scopes: string[];
}

const DEFAULT_AUTHOR_SCOPES = [
	'openid',
	'AdobeID',
	'aem.folders',
	'aem.assets.author',
	'aem.fragments.management'
];

const PLACEHOLDER_RE = /^(placeholder|your-)/i;

/** Postman / Adobe Developer Console export shape (see oauth.example.json). */
export interface OAuthJsonFile {
	values?: Array<{ key?: string; value?: unknown; enabled?: boolean }>;
}

export function parseOAuthJson(raw: string): OAuthCredentials | null {
	let parsed: OAuthJsonFile;
	try {
		parsed = JSON.parse(raw) as OAuthJsonFile;
	} catch {
		return null;
	}
	const map = new Map<string, unknown>();
	for (const entry of parsed.values ?? []) {
		if (entry.enabled === false || !entry.key) continue;
		map.set(entry.key, entry.value);
	}
	return credentialsFromMap(map);
}

function credentialsFromMap(map: Map<string, unknown>): OAuthCredentials | null {
	const clientId = stringValue(map.get('API_KEY') ?? map.get('CLIENT_ID'));
	const clientSecret = stringValue(map.get('CLIENT_SECRET'));
	if (!clientId || !clientSecret) return null;
	if (PLACEHOLDER_RE.test(clientId) || PLACEHOLDER_RE.test(clientSecret)) return null;

	const imsRaw = stringValue(map.get('IMS')) ?? 'ims-na1.adobelogin.com';
	return {
		clientId,
		clientSecret,
		imsOrg: stringValue(map.get('IMS_ORG') ?? map.get('IMS_ORG_ID')),
		imsHost: normalizeImsHost(imsRaw),
		scopes: parseScopes(map.get('SCOPES'))
	};
}

export function oauthCredentialsFromEnv(env?: AppEnv): OAuthCredentials | null {
	if (!env) return null;
	const clientId = env.IMS_CLIENT_ID?.trim();
	const clientSecret = env.IMS_CLIENT_SECRET?.trim();
	if (!clientId || !clientSecret) return null;
	if (PLACEHOLDER_RE.test(clientId) || PLACEHOLDER_RE.test(clientSecret)) return null;

	const imsHost = normalizeImsHost(env.IMS_HOST?.trim() ?? 'ims-na1.adobelogin.com');
	const scopes = env.IMS_SCOPES?.trim()
		? parseScopes(env.IMS_SCOPES)
		: DEFAULT_AUTHOR_SCOPES;

	return {
		clientId,
		clientSecret,
		imsOrg: env.IMS_ORG_ID?.trim(),
		imsHost,
		scopes
	};
}

/** Env vars first, then optional oauth.json (Node local dev only). */
export async function resolveOAuthCredentials(env?: AppEnv): Promise<OAuthCredentials | null> {
	const fromEnv = oauthCredentialsFromEnv(env);
	if (fromEnv) return fromEnv;

	if (!canReadOAuthFile()) return null;
	const path = env?.OAUTH_CONFIG_PATH?.trim() || 'oauth.json';
	try {
		const { readFile } = await import('node:fs/promises');
		const { existsSync } = await import('node:fs');
		const { resolve } = await import('node:path');
		const absolute = resolve(process.cwd(), path);
		if (!existsSync(absolute)) return null;
		return parseOAuthJson(await readFile(absolute, 'utf-8'));
	} catch {
		return null;
	}
}

function canReadOAuthFile(): boolean {
	return typeof process !== 'undefined' && Boolean(process.versions?.node);
}

function stringValue(value: unknown): string | undefined {
	if (value == null) return undefined;
	const s = String(value).trim();
	return s || undefined;
}

export function parseScopes(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map(String).filter(Boolean);
	}
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return DEFAULT_AUTHOR_SCOPES;
		if (trimmed.startsWith('[')) {
			try {
				const parsed = JSON.parse(trimmed) as unknown;
				if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
			} catch {
				/* fall through */
			}
		}
		return trimmed.split(/[\s,]+/).filter(Boolean);
	}
	return DEFAULT_AUTHOR_SCOPES;
}

function normalizeImsHost(host: string): string {
	const t = host.trim();
	if (!t) return 'https://ims-na1.adobelogin.com';
	if (t.startsWith('http://') || t.startsWith('https://')) return t.replace(/\/$/, '');
	return `https://${t.replace(/\/$/, '')}`;
}
