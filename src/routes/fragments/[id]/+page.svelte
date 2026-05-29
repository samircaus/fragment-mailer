<script lang="ts">
	import { page } from '$app/stores';
	import type { AjoExpressionFragmentDetail, AjoFragmentReferences } from '$lib/ajo/fragment-types.js';

	const fragmentId = $derived($page.params.id ?? '');

	let fragment = $state<AjoExpressionFragmentDetail | null>(null);
	let references = $state<AjoFragmentReferences>({ count: 0, items: [] });
	let expression = $state('');
	let etag = $state<string | undefined>();
	let isLoading = $state(true);
	let isSaving = $state(false);
	let loadError = $state('');
	let saveError = $state('');
	let saveSuccess = $state('');

	const expressionPlaceholder = '© {{profile.system.year}} Acme Corp…';

	$effect(() => {
		const id = fragmentId;
		if (!id) return;
		void loadFragment(id);
	});

	async function loadFragment(id = fragmentId) {
		isLoading = true;
		loadError = '';
		try {
			const res = await fetch(`/api/ajo/fragments/${encodeURIComponent(id)}`);
			if (!res.ok) {
				let detail = '';
				const contentType = res.headers.get('content-type') ?? '';
				if (contentType.includes('json')) {
					try {
						const body = (await res.json()) as { message?: string };
						detail = body.message ?? '';
					} catch {
						// ignore
					}
				} else {
					detail = (await res.text()).trim();
				}
				throw new Error(detail || `Failed to load fragment (${res.status})`);
			}
			const data = (await res.json()) as {
				fragment: AjoExpressionFragmentDetail;
				references: AjoFragmentReferences;
			};
			fragment = data.fragment;
			references = data.references ?? { count: 0, items: [] };
			expression = data.fragment.fragment?.expression ?? '';
			etag = data.fragment.etag;
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load fragment';
		} finally {
			isLoading = false;
		}
	}

	async function saveFragment() {
		if (!fragment) return;
		isSaving = true;
		saveError = '';
		saveSuccess = '';
		try {
			const res = await fetch(`/api/ajo/fragments/${encodeURIComponent(fragmentId)}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					expression,
					name: fragment.name,
					description: fragment.description,
					subType: fragment.subType ?? 'HTML',
					etag,
					publish: true
				})
			});
			if (!res.ok) {
				let detail = '';
				try {
					const body = (await res.json()) as { message?: string };
					detail = body.message ?? '';
				} catch {
					// ignore
				}
				throw new Error(detail || `Save failed (${res.status})`);
			}
			saveSuccess = 'Saved and published to AJO.';
			await loadFragment(fragmentId);
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Save failed';
		} finally {
			isSaving = false;
		}
	}

	function statusLabel(status: string): string {
		switch (status) {
			case 'PUBLISHED':
				return 'Live';
			case 'PUBLISHING':
				return 'Publishing';
			default:
				return 'Draft';
		}
	}
</script>

<div class="page">
	<header>
		<div class="header-inner">
			<a href="/" class="brand">
				<span class="brand-dot"></span>
				<span class="brand-name">Fragment Mailer</span>
			</a>
			<nav class="header-nav">
				<a href="/" class="nav-link">Emails</a>
				<a href="/fragments" class="nav-link active">AJO Fragments</a>
			</nav>
		</div>
	</header>

	<main>
		<div class="breadcrumb">
			<a href="/fragments">← Fragments</a>
		</div>

		{#if isLoading}
			<p class="status-message">Loading fragment…</p>
		{:else if loadError}
			<p class="status-message error">{loadError}</p>
		{:else if fragment}
			<div class="editor-header">
				<div>
					<h1>{fragment.name}</h1>
					<div class="meta">
						<span class="status-chip status-{fragment.status.toLowerCase()}">{statusLabel(fragment.status)}</span>
						<span class="meta-item">{fragment.type} · {fragment.subType ?? 'HTML'}</span>
						<span class="meta-item usage" title="Campaigns and journeys referencing this fragment">
							Used by {references.count} campaign{references.count === 1 ? '' : 's'}
						</span>
					</div>
					{#if fragment.description}
						<p class="description">{fragment.description}</p>
					{/if}
				</div>
				<button type="button" class="save-btn" onclick={() => saveFragment()} disabled={isSaving}>
					{isSaving ? 'Saving…' : 'Save & publish'}
				</button>
			</div>

			{#if saveError}
				<p class="banner error">{saveError}</p>
			{:else if saveSuccess}
				<p class="banner success">{saveSuccess}</p>
			{/if}

			<div class="editor-panel">
				<label class="editor-label" for="fragment-expression">Expression (Handlebars)</label>
				<textarea
					id="fragment-expression"
					class="expression-editor"
					bind:value={expression}
					spellcheck="false"
					placeholder={expressionPlaceholder}
				></textarea>
				<p class="editor-hint">
					Reference in templates with
					<code>{'{%#fragment id="'}{fragment.name}{'"%}{%/fragment%}'}</code>
				</p>
			</div>

			{#if references.items.length > 0}
				<section class="references">
					<h2>References</h2>
					<ul>
						{#each references.items as ref (ref.id)}
							<li>
								<span class="ref-name">{ref.name}</span>
								{#if ref.type}
									<span class="ref-type">{ref.type}</span>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/if}
	</main>
</div>

<style>
	.page {
		min-height: 100vh;
		background: #fafafa;
	}

	header {
		background: #111;
		padding: 0 40px;
		height: 52px;
		display: flex;
		align-items: center;
		border-bottom: 1px solid #222;
	}

	.header-inner {
		max-width: 960px;
		width: 100%;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		text-decoration: none;
	}

	.brand-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #5b5bd6;
	}

	.brand-name {
		font-size: 14px;
		font-weight: 600;
		color: #fff;
	}

	.header-nav {
		display: flex;
		gap: 16px;
	}

	.nav-link {
		font-size: 12px;
		font-weight: 600;
		color: #a1a1aa;
		text-decoration: none;
	}

	.nav-link.active {
		color: #fff;
	}

	main {
		max-width: 960px;
		margin: 0 auto;
		padding: 32px 40px 48px;
	}

	.breadcrumb a {
		font-size: 12px;
		font-weight: 600;
		color: #5b5bd6;
		text-decoration: none;
	}

	.breadcrumb {
		margin-bottom: 20px;
	}

	.editor-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 20px;
	}

	h1 {
		font-size: 20px;
		font-weight: 600;
		color: #111;
		margin-bottom: 8px;
		letter-spacing: -0.3px;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}

	.meta-item {
		font-size: 12px;
		color: #71717a;
	}

	.meta-item.usage {
		font-weight: 600;
		color: #3f3f46;
	}

	.status-chip {
		font-size: 11px;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 999px;
	}

	.status-draft,
	.status-publishing {
		background: #f4f4f5;
		color: #52525b;
	}

	.status-published {
		background: #dcfce7;
		color: #15803d;
	}

	.description {
		margin-top: 8px;
		font-size: 13px;
		color: #71717a;
		line-height: 1.5;
	}

	.save-btn {
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		padding: 8px 16px;
		border-radius: 8px;
		border: none;
		background: #5b5bd6;
		color: #fff;
		cursor: pointer;
		flex-shrink: 0;
	}

	.save-btn:hover:not(:disabled) {
		background: #4f4fc4;
	}

	.save-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.banner {
		font-size: 13px;
		padding: 10px 12px;
		border-radius: 8px;
		margin-bottom: 16px;
	}

	.banner.error {
		background: #fef2f2;
		color: #b91c1c;
		border: 1px solid #fecaca;
	}

	.banner.success {
		background: #f0fdf4;
		color: #15803d;
		border: 1px solid #bbf7d0;
	}

	.editor-panel {
		background: #fff;
		border: 1px solid #e4e4e7;
		border-radius: 10px;
		padding: 16px;
	}

	.editor-label {
		display: block;
		font-size: 12px;
		font-weight: 600;
		color: #3f3f46;
		margin-bottom: 8px;
	}

	.expression-editor {
		width: 100%;
		min-height: 280px;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 12px;
		line-height: 1.6;
		padding: 12px;
		border: 1px solid #e4e4e7;
		border-radius: 8px;
		resize: vertical;
		background: #fafafa;
		color: #111;
	}

	.expression-editor:focus {
		outline: none;
		border-color: #5b5bd6;
		box-shadow: 0 0 0 3px rgba(91, 91, 214, 0.1);
	}

	.editor-hint {
		margin-top: 10px;
		font-size: 12px;
		color: #71717a;
	}

	.editor-hint code {
		font-size: 11px;
		background: #f4f4f5;
		padding: 2px 6px;
		border-radius: 4px;
	}

	.references {
		margin-top: 28px;
	}

	.references h2 {
		font-size: 13px;
		font-weight: 600;
		color: #111;
		margin-bottom: 10px;
	}

	.references ul {
		list-style: none;
		background: #fff;
		border: 1px solid #e4e4e7;
		border-radius: 10px;
		overflow: hidden;
	}

	.references li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		border-bottom: 1px solid #f4f4f5;
		font-size: 13px;
	}

	.references li:last-child {
		border-bottom: none;
	}

	.ref-name {
		font-weight: 500;
		color: #111;
	}

	.ref-type {
		font-size: 11px;
		color: #71717a;
		background: #f4f4f5;
		padding: 1px 6px;
		border-radius: 4px;
	}

	.status-message {
		font-size: 14px;
		color: #71717a;
	}

	.status-message.error {
		color: #b91c1c;
	}
</style>
