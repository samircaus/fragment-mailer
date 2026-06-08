// GET /preview/fragment/:fragmentId — iframe preview for AJO expression fragments

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFragment } from '$lib/ajo/fragments-client.js';
import { isAjoConfigured } from '$lib/auth/ajo-token-provider.js';
import { getAjoFragmentDraft } from '$lib/db/ajo-fragment-drafts.js';
import { getDb } from '$lib/db/email-status.js';
import { compileFragmentMjmlToHtml } from '$lib/fragments/compile-mjml.js';
import { applyPreviewColorScheme } from '$lib/preview/color-scheme-preview.js';
import { resolveAppEnv } from '$lib/server/app-env.js';

export const GET: RequestHandler = async ({ params, url, platform }) => {
	const env = resolveAppEnv(platform?.env);
	const { fragmentId } = params;
	const personaId = url.searchParams.get('personaId') ?? 'persona-1';
	const personaJson = url.searchParams.get('persona');
	const colorSchemeParam = url.searchParams.get('colorScheme')?.trim().toLowerCase();
	const previewColorScheme = colorSchemeParam === 'dark' ? 'dark' : 'light';

	const db = getDb(platform);
	const localDraft = await getAjoFragmentDraft(db, fragmentId);
	let mjml = '';

	if (localDraft) {
		mjml = localDraft.expression;
	} else {
		if (!isAjoConfigured(env)) {
			throw error(503, 'AJO credentials not configured');
		}
		const fragmentResult = await getFragment(fragmentId, env);
		if (fragmentResult.error || !fragmentResult.data) {
			throw error(404, fragmentResult.error ?? 'Fragment not found');
		}
		mjml = fragmentResult.data.fragment?.expression ?? '';
	}

	if (!mjml.trim()) {
		throw error(404, 'Fragment has no content');
	}

	const compiled = await compileFragmentMjmlToHtml(mjml, env, {
		personaId,
		personaJson
	});
	if ('error' in compiled) {
		throw error(422, compiled.error);
	}

	const html = applyPreviewColorScheme(compiled.html, previewColorScheme);

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'no-store'
		}
	});
};
