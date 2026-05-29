<script lang="ts">
	import { onMount } from 'svelte';
	import type { AjoFragmentListItem } from '$lib/ajo/fragment-types.js';

	let fragments = $state<AjoFragmentListItem[]>([]);
	let isLoading = $state(true);
	let loadError = $state('');

	onMount(() => {
		void loadFragments();
	});

	async function loadFragments() {
		isLoading = true;
		loadError = '';
		try {
			const res = await fetch('/api/ajo/fragments?type=expression');
			if (!res.ok) {
				let detail = '';
				try {
					const body = (await res.json()) as { message?: string };
					detail = body.message ?? '';
				} catch {
					// ignore
				}
				throw new Error(detail || `Failed to load fragments (${res.status})`);
			}
			const data = (await res.json()) as { fragments: AjoFragmentListItem[] };
			fragments = data.fragments;
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load fragments';
		} finally {
			isLoading = false;
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

	function formatDate(iso?: string): string {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
				<span class="nav-link active">AJO Fragments</span>
			</nav>
		</div>
	</header>

	<main>
		<div class="section-header">
			<div>
				<h2>AJO Fragments</h2>
				<p class="section-desc">
					Expression fragments are reusable Handlebars blocks. Edit once — every campaign referencing
					<code>{'{%#fragment id="…"%}'}</code> picks up the change after publish.
				</p>
			</div>
			<button type="button" class="refresh-btn" onclick={() => loadFragments()} disabled={isLoading}>
				Refresh
			</button>
		</div>

		{#if isLoading}
			<p class="status-message">Loading fragments…</p>
		{:else if loadError}
			<p class="status-message error">{loadError}</p>
		{:else if fragments.length === 0}
			<p class="status-message">No expression fragments found in this AJO sandbox.</p>
		{:else}
			<div class="fragment-grid">
				{#each fragments as fragment (fragment.id)}
					<a href="/fragments/{fragment.id}" class="fragment-card">
						<div class="card-top">
							<span class="type-chip">{fragment.type}</span>
							<span class="status-chip status-{fragment.status.toLowerCase()}">{statusLabel(fragment.status)}</span>
						</div>
						<h3>{fragment.name}</h3>
						{#if fragment.description}
							<p class="description">{fragment.description}</p>
						{/if}
						<div class="card-footer">
							<span class="fragment-id" title={fragment.id}>{fragment.id}</span>
							{#if fragment.modifiedAt}
								<span class="date">{formatDate(fragment.modifiedAt)}</span>
							{/if}
							<span class="card-arrow">Edit →</span>
						</div>
					</a>
				{/each}
			</div>
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
		flex-shrink: 0;
	}

	.brand-name {
		font-size: 14px;
		font-weight: 600;
		color: #fff;
		letter-spacing: -0.2px;
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

	.nav-link:not(.active):hover {
		color: #e4e4e7;
	}

	main {
		max-width: 960px;
		margin: 0 auto;
		padding: 48px 40px;
	}

	.section-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 24px;
	}

	.section-header h2 {
		font-size: 15px;
		font-weight: 600;
		color: #111;
		letter-spacing: -0.2px;
		margin-bottom: 6px;
	}

	.section-desc {
		font-size: 13px;
		color: #71717a;
		line-height: 1.5;
		max-width: 560px;
	}

	.section-desc code {
		font-size: 12px;
		background: #f4f4f5;
		padding: 1px 5px;
		border-radius: 4px;
	}

	.refresh-btn {
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		padding: 6px 12px;
		border-radius: 6px;
		border: 1px solid #e4e4e7;
		background: #fff;
		color: #3f3f46;
		cursor: pointer;
		flex-shrink: 0;
	}

	.refresh-btn:hover:not(:disabled) {
		border-color: #5b5bd6;
		color: #5b5bd6;
	}

	.refresh-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.status-message {
		font-size: 14px;
		color: #71717a;
	}

	.status-message.error {
		color: #b91c1c;
	}

	.fragment-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 12px;
	}

	.fragment-card {
		background: #fff;
		border: 1px solid #e4e4e7;
		border-radius: 10px;
		padding: 20px;
		text-decoration: none;
		color: inherit;
		display: flex;
		flex-direction: column;
		gap: 8px;
		transition:
			border-color 0.12s,
			box-shadow 0.12s,
			transform 0.12s;
	}

	.fragment-card:hover {
		border-color: #5b5bd6;
		box-shadow: 0 0 0 3px rgba(91, 91, 214, 0.08);
		transform: translateY(-1px);
	}

	.card-top {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.type-chip {
		font-size: 11px;
		font-weight: 600;
		background: #ededfc;
		color: #5b5bd6;
		padding: 2px 8px;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.2px;
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

	h3 {
		font-size: 14px;
		font-weight: 600;
		color: #111;
		letter-spacing: -0.2px;
		line-height: 1.4;
	}

	.description {
		font-size: 12px;
		color: #71717a;
		line-height: 1.5;
	}

	.card-footer {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 4px;
		flex-wrap: wrap;
	}

	.fragment-id {
		font-size: 11px;
		font-family: 'SF Mono', 'Fira Code', monospace;
		color: #a1a1aa;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 140px;
	}

	.date {
		font-size: 12px;
		color: #a1a1aa;
		margin-left: auto;
	}

	.card-arrow {
		font-size: 12px;
		color: #5b5bd6;
		font-weight: 500;
		opacity: 0;
		transition: opacity 0.12s;
	}

	.fragment-card:hover .card-arrow {
		opacity: 1;
	}
</style>
