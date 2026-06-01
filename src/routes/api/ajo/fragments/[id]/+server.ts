// GET    /api/ajo/fragments/:id — fetch fragment detail
// PUT    /api/ajo/fragments/:id — update expression + publish

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
	buildAjoExpressionFragmentPayload,
	getFragment,
	getFragmentReferences,
	publishFragment,
	updateFragment
} from '$lib/ajo/fragments-client.js';
import { isAjoConfigured } from '$lib/auth/ajo-token-provider.js';
import { resolveAppEnv } from '$lib/server/app-env.js';
import { upsertAjoFragment } from '$lib/db/ajo-fragments.js';
import { getDb } from '$lib/db/email-status.js';

function ajoErrorDetail(raw: string, fallback: string): string {
	const jsonStart = raw.indexOf('{');
	if (jsonStart >= 0) {
		try {
			const parsed = JSON.parse(raw.slice(jsonStart)) as { title?: string; message?: string };
			if (parsed.title) return parsed.title;
			if (parsed.message) return parsed.message;
		} catch {
			// ignore parse errors
		}
	}
	return raw.length > 240 ? `${raw.slice(0, 240)}…` : raw || fallback;
}

export const GET: RequestHandler = async ({ params, platform }) => {
	try {
		const env = resolveAppEnv(platform?.env);
		if (!isAjoConfigured(env)) {
			throw error(503, 'AJO credentials not configured');
		}

		const fragmentResult = await getFragment(params.id, env);
		// References API is not available in all sandboxes — fetch separately, never fail the page.
		const referencesResult = await getFragmentReferences(params.id, env);

		if (fragmentResult.error || !fragmentResult.data) {
			const status =
				fragmentResult.status && fragmentResult.status >= 400 ? fragmentResult.status : 502;
			console.error(
				JSON.stringify({
					event: 'fragment_get_failed',
					fragmentId: params.id,
					status,
					error: fragmentResult.error
				})
			);
			throw error(status, ajoErrorDetail(fragmentResult.error ?? '', 'Fragment not found'));
		}

		// Auto-register in local DB so it appears in the "managed here" list.
		const db = getDb(platform);
		await upsertAjoFragment(db, { id: params.id, name: fragmentResult.data.name }).catch(
			() => undefined
		);

		return json({
			fragment: fragmentResult.data,
			references: referencesResult.data ?? { count: 0, items: [] }
		});
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		console.error(
			JSON.stringify({
				event: 'fragment_get_unhandled',
				fragmentId: params.id,
				error: e instanceof Error ? e.message : String(e)
			})
		);
		throw error(500, 'Failed to load fragment');
	}
};

const UpdateSchema = z.object({
	expression: z.string(),
	name: z.string().min(1).optional(),
	description: z.string().optional(),
	subType: z.enum(['TEXT', 'HTML', 'JSON']).optional(),
	etag: z.string().optional(),
	publish: z.boolean().optional()
});

export const PUT: RequestHandler = async ({ params, request, platform }) => {
	const env = resolveAppEnv(platform?.env);
	if (!isAjoConfigured(env)) {
		throw error(503, 'AJO credentials not configured');
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = UpdateSchema.safeParse(body);
	if (!parsed.success) throw error(400, `Invalid request: ${parsed.error.message}`);

	const existing = await getFragment(params.id, env);
	if (existing.error || !existing.data) {
		const status = existing.status && existing.status >= 400 ? existing.status : 404;
		throw error(status, existing.error ?? 'Fragment not found');
	}

	const payload = buildAjoExpressionFragmentPayload({
		name: parsed.data.name ?? existing.data.name,
		description: parsed.data.description ?? existing.data.description,
		expression: parsed.data.expression,
		subType: parsed.data.subType ?? existing.data.subType ?? 'HTML'
	});

	const etag = parsed.data.etag ?? existing.data.etag;
	const updateResult = await updateFragment(params.id, payload, env, etag);
	if (updateResult.error) {
		const status = updateResult.status && updateResult.status >= 400 ? updateResult.status : 502;
		throw error(status, updateResult.error);
	}

	let published = false;
	if (parsed.data.publish !== false) {
		const publishResult = await publishFragment(params.id, env);
		if (publishResult.error) {
			const status = publishResult.status && publishResult.status >= 400 ? publishResult.status : 502;
			throw error(status, publishResult.error);
		}
		published = true;
	}

	const savedName = parsed.data.name ?? existing.data.name;
	const db = getDb(platform);
	await upsertAjoFragment(db, { id: params.id, name: savedName }).catch(() => undefined);

	return json({ ok: true, published });
};
