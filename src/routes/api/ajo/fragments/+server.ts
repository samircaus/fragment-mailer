// GET /api/ajo/fragments — list AJO content fragments
// ?source=local  returns only locally-tracked fragments (from DB)
// ?type=expression|html  filters by type (AJO API only)

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listFragments } from '$lib/ajo/fragments-client.js';
import { isAjoConfigured } from '$lib/auth/ajo-token-provider.js';
import { resolveAppEnv } from '$lib/server/app-env.js';
import { listAjoFragments } from '$lib/db/ajo-fragments.js';
import { listAjoFragmentDrafts, upsertAjoFragmentDraft } from '$lib/db/ajo-fragment-drafts.js';
import { getDb } from '$lib/db/email-status.js';
import { z } from 'zod';

export const GET: RequestHandler = async ({ url, platform }) => {
	if (url.searchParams.get('source') === 'local') {
		const db = getDb(platform);
		const [trackedFragments, draftFragments] = await Promise.all([
			listAjoFragments(db),
			listAjoFragmentDrafts(db)
		]);
		const fragments = [
			...draftFragments.map((draft) => ({
				id: draft.id,
				name: draft.name,
				updatedAt: draft.updatedAt,
				source: 'draft' as const
			})),
			...trackedFragments.map((fragment) => ({
				id: fragment.id,
				name: fragment.name,
				updatedAt: fragment.updatedAt,
				source: 'ajo' as const
			}))
		].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		return json({ fragments });
	}

	const env = resolveAppEnv(platform?.env);
	if (!isAjoConfigured(env)) {
		throw error(503, 'AJO credentials not configured');
	}

	const typeParam = url.searchParams.get('type');
	const type = typeParam === 'html' || typeParam === 'expression' ? typeParam : undefined;

	const result = await listFragments(env, { type, limit: 100 });
	if (result.error) {
		const status = result.status && result.status >= 400 ? result.status : 502;
		throw error(status, result.error);
	}

	return json({ fragments: result.data?.items ?? [] });
};

const CreateLocalDraftSchema = z.object({
	name: z.string().trim().min(1).max(120),
	description: z.string().trim().max(600).optional(),
	expression: z.string().optional(),
	subType: z.enum(['TEXT', 'HTML', 'JSON']).optional()
});

export const POST: RequestHandler = async ({ request, platform }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = CreateLocalDraftSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, `Invalid request: ${parsed.error.message}`);
	}

	const id = `local-${crypto.randomUUID()}`;
	const db = getDb(platform);
	await upsertAjoFragmentDraft(db, {
		id,
		name: parsed.data.name,
		description: parsed.data.description ?? '',
		expression: parsed.data.expression ?? '',
		subType: parsed.data.subType ?? 'HTML'
	});

	return json({ ok: true, id });
};
