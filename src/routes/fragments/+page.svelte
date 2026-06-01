<script lang="ts">
	import { onMount } from 'svelte';
	import type { AjoFragmentListItem } from '$lib/ajo/fragment-types.js';

	interface LocalFragment {
		id: string;
		name: string;
		updatedAt: string;
	}

	let localFragments = $state<LocalFragment[]>([]);
	let isLoading = $state(true);
	let loadError = $state('');

	let showBrowse = $state(false);
	let allFragments = $state<AjoFragmentListItem[]>([]);
	let isBrowseLoading = $state(false);
	let browseError = $state('');

	onMount(() => {
		void loadLocalFragments();
	});

	async function loadLocalFragments() {
		isLoading = true;
		loadError = '';
		try {
			const res = await fetch('/api/ajo/fragments?source=local');
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
			const data = (await res.json()) as { fragments: LocalFragment[] };
			localFragments = data.fragments;
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load fragments';
		} finally {
			isLoading = false;
		}
	}

	async function loadAllFragments() {
		if (allFragments.length > 0) {
			showBrowse = true;
			return;
		}
		isBrowseLoading = true;
		browseError = '';
		showBrowse = true;
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
				throw new Error(detail || `Failed to load AJO fragments (${res.status})`);
			}
			const data = (await res.json()) as { fragments: AjoFragmentListItem[] };
			allFragments = data.fragments;
		} catch (err) {
			browseError = err instanceof Error ? err.message : 'Failed to load AJO fragments';
		} finally {
			isBrowseLoading = false;
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
		if (!iso) return '—';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '—';
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	const localIds = $derived(new Set(localFragments.map((f) => f.id)));
</script>

<div class="page">
	<header>
		<div class="header-inner">
			<a href="/" class="brand">
				<span class="brand-dot"></span>
				<span class="brand-name">Fragment Mailer</span>
			</a>
			<nav class="header-nav">
				<a href="/" class="nav-link">AEM Emails</a>
				<a href="/templates" class="nav-link">AJO Templates</a>
				<span class="nav-link active">AJO Fragments</span>
			</nav>
		</div>
	</header>

	<main>
		<div class="section-header">
			<div>
				<h2>AJO Fragments</h2>
				<p class="section-desc">
					Expression fragments managed through this tool. Open a fragment from AJO below to start
					tracking it here.
				</p>
			</div>
			<button
				type="button"
				class="refresh-btn"
				onclick={() => loadLocalFragments()}
				disabled={isLoading}
			>
				Refresh
			</button>
		</div>

		{#if isLoading}
			<p class="status-message">Loading…</p>
		{:else if loadError}
			<p class="status-message error">{loadError}</p>
		{:else if localFragments.length === 0}
			<p class="status-message">No fragments tracked here yet.</p>
		{:else}
			<div class="list-wrap">
				<table class="list-table">
					<thead>
						<tr>
							<th>Name</th>
							<th>ID</th>
							<th>Last modified here</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each localFragments as fragment (fragment.id)}
							<tr>
								<td class="name-cell">
									<a href="/fragments/{fragment.id}" class="row-link">{fragment.name}</a>
								</td>
								<td class="mono-cell" title={fragment.id}>{fragment.id}</td>
								<td class="date-cell">{formatDate(fragment.updatedAt)}</td>
								<td class="action-cell">
									<a href="/fragments/{fragment.id}" class="row-action">Edit</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<div class="browse-section">
			<button
				type="button"
				class="browse-toggle"
				onclick={() => (showBrowse ? (showBrowse = false) : loadAllFragments())}
			>
				{showBrowse ? 'Hide AJO fragments' : 'Browse all AJO fragments'}
			</button>

			{#if showBrowse}
				<div class="browse-body">
					{#if isBrowseLoading}
						<p class="status-message">Loading AJO fragments…</p>
					{:else if browseError}
						<p class="status-message error">{browseError}</p>
					{:else if allFragments.length === 0}
						<p class="status-message">No expression fragments found in AJO.</p>
					{:else}
						<p class="browse-hint">
							Click a fragment to open and edit it — it will be added to your tracked list above.
						</p>
						<div class="list-wrap">
							<table class="list-table">
								<thead>
									<tr>
										<th>Name</th>
										<th>Status</th>
										<th>ID</th>
										<th>Modified</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{#each allFragments as fragment (fragment.id)}
										<tr class={localIds.has(fragment.id) ? 'tracked-row' : ''}>
											<td class="name-cell">
												<a href="/fragments/{fragment.id}" class="row-link">{fragment.name}</a>
												{#if fragment.description}
													<p class="description">{fragment.description}</p>
												{/if}
											</td>
											<td>
												<span class="status-chip status-{fragment.status.toLowerCase()}">
													{statusLabel(fragment.status)}
												</span>
											</td>
											<td class="mono-cell" title={fragment.id}>{fragment.id}</td>
											<td class="date-cell">{formatDate(fragment.modifiedAt)}</td>
											<td class="action-cell">
												{#if localIds.has(fragment.id)}
													<span class="tracked-badge">tracked</span>
												{:else}
													<a href="/fragments/{fragment.id}" class="row-action">Open</a>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			{/if}
		</div>
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

	.list-wrap {
		background: #fff;
		border: 1px solid #e4e4e7;
		border-radius: 10px;
		overflow: hidden;
	}

	.list-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}

	.list-table th {
		text-align: left;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: #71717a;
		padding: 10px 14px;
		background: #fafafa;
		border-bottom: 1px solid #e4e4e7;
	}

	.list-table td {
		padding: 12px 14px;
		border-bottom: 1px solid #f4f4f5;
		vertical-align: middle;
	}

	.list-table tbody tr:last-child td {
		border-bottom: none;
	}

	.list-table tbody tr:hover {
		background: #fafaff;
	}

	.row-link {
		color: #111;
		font-weight: 600;
		text-decoration: none;
	}

	.row-link:hover {
		color: #5b5bd6;
	}

	.description {
		font-size: 12px;
		color: #71717a;
		margin-top: 4px;
		line-height: 1.4;
	}

	.status-chip {
		display: inline-block;
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

	.mono-cell {
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 11px;
		color: #a1a1aa;
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.date-cell {
		font-size: 12px;
		color: #a1a1aa;
		white-space: nowrap;
	}

	.action-cell {
		text-align: right;
		width: 72px;
	}

	.row-action {
		font-size: 12px;
		font-weight: 600;
		color: #5b5bd6;
		text-decoration: none;
	}

	.row-action:hover {
		text-decoration: underline;
	}

	.tracked-row {
		background: #fafaff;
	}

	.tracked-badge {
		font-size: 11px;
		font-weight: 600;
		color: #5b5bd6;
		background: #ededfc;
		padding: 2px 8px;
		border-radius: 4px;
	}

	.browse-section {
		margin-top: 40px;
	}

	.browse-toggle {
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		color: #71717a;
		background: none;
		border: 1px solid #e4e4e7;
		padding: 6px 12px;
		border-radius: 6px;
		cursor: pointer;
	}

	.browse-toggle:hover {
		border-color: #5b5bd6;
		color: #5b5bd6;
	}

	.browse-body {
		margin-top: 16px;
	}

	.browse-hint {
		font-size: 12px;
		color: #71717a;
		margin-bottom: 12px;
	}
</style>
