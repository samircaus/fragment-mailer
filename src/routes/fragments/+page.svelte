<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	interface LocalFragment {
		id: string;
		name: string;
		updatedAt: string;
		source: 'draft' | 'ajo';
	}

	let localFragments = $state<LocalFragment[]>([]);
	let isLoading = $state(true);
	let loadError = $state('');
	let showNewFragmentForm = $state(false);
	let newFragmentName = $state('');
	let newFragmentCreating = $state(false);
	let newFragmentError = $state('');

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

	async function createLocalFragment() {
		const name = newFragmentName.trim();
		if (!name || newFragmentCreating) return;

		newFragmentCreating = true;
		newFragmentError = '';
		try {
			const res = await fetch('/api/ajo/fragments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name })
			});
			if (!res.ok) {
				let detail = '';
				try {
					const body = (await res.json()) as { message?: string };
					detail = body.message ?? '';
				} catch {
					// ignore
				}
				throw new Error(detail || `Failed to create fragment (${res.status})`);
			}
			const data = (await res.json()) as { id: string };
			await goto(`/fragments/${encodeURIComponent(data.id)}`);
		} catch (err) {
			newFragmentError = err instanceof Error ? err.message : 'Failed to create fragment';
		} finally {
			newFragmentCreating = false;
		}
	}

	function formatDate(iso?: string): string {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function statusClass(fragment: LocalFragment): string {
		return fragment.source === 'draft' ? 'status-never-pushed' : 'status-synced';
	}

	function statusLabel(fragment: LocalFragment): string {
		return fragment.source === 'draft' ? 'Local draft' : 'In AJO';
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
			</div>
			<button
				type="button"
				class="action-btn"
				onclick={() => {
					showNewFragmentForm = !showNewFragmentForm;
					newFragmentError = '';
				}}
			>
				{showNewFragmentForm ? 'Cancel' : 'New fragment'}
			</button>
		</div>

		{#if showNewFragmentForm}
			<form
				class="new-fragment-form"
				onsubmit={(e) => {
					e.preventDefault();
					void createLocalFragment();
				}}
			>
				<label>
					<span>Fragment name</span>
					<input type="text" bind:value={newFragmentName} placeholder="Hero banner" required />
				</label>
				{#if newFragmentError}
					<p class="form-error">{newFragmentError}</p>
				{/if}
				<button type="submit" class="action-btn" disabled={!newFragmentName.trim() || newFragmentCreating}>
					{newFragmentCreating ? 'Creating…' : 'Create & edit'}
				</button>
			</form>
		{/if}

		{#if isLoading}
			<p class="status-message">Loading fragments…</p>
		{:else if loadError}
			<p class="status-message error">{loadError}</p>
		{:else if localFragments.length === 0}
			<p class="status-message"></p>
		{:else}
			<div class="card-grid">
				{#each localFragments as fragment (fragment.id)}
					<a href="/fragments/{fragment.id}" class="card">
						<div class="card-top">
							<span class="status-chip {statusClass(fragment)}">
								<span class="status-dot" aria-hidden="true"></span>
								{statusLabel(fragment)}
							</span>
						</div>
						<h3>{fragment.name}</h3>
						<p class="fragment-id" title={fragment.id}>{fragment.id}</p>
						<div class="card-footer">
							{#if fragment.updatedAt}
								<span class="date">{formatDate(fragment.updatedAt)}</span>
							{/if}
							<span class="card-arrow">Open →</span>
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

	.action-btn {
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		padding: 6px 12px;
		border-radius: 6px;
		border: 1px solid #5b5bd6;
		background: #5b5bd6;
		color: #fff;
		cursor: pointer;
		flex-shrink: 0;
	}

	.action-btn:hover:not(:disabled) {
		background: #4f4fc4;
	}

	.action-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.new-fragment-form {
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 420px;
		margin-bottom: 24px;
		padding: 16px;
		background: #fff;
		border: 1px solid #e4e4e7;
		border-radius: 10px;
	}

	.new-fragment-form label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 12px;
		font-weight: 600;
		color: #3f3f46;
	}

	.new-fragment-form input {
		font: inherit;
		padding: 8px 10px;
		border: 1px solid #e4e4e7;
		border-radius: 6px;
	}

	.form-error {
		font-size: 12px;
		color: #b91c1c;
	}

	.status-message {
		font-size: 14px;
		color: #71717a;
	}

	.status-message.error {
		color: #b91c1c;
	}

	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 12px;
	}

	.card {
		background: #fff;
		border: 1px solid #e4e4e7;
		border-radius: 10px;
		padding: 20px;
		text-decoration: none;
		color: inherit;
		display: flex;
		flex-direction: column;
		gap: 10px;
		transition:
			border-color 0.12s,
			box-shadow 0.12s,
			transform 0.12s;
	}

	.card:hover {
		border-color: #5b5bd6;
		box-shadow: 0 0 0 3px rgba(91, 91, 214, 0.08);
		transform: translateY(-1px);
	}

	.card-top {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.status-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 11px;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 999px;
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.status-never-pushed {
		background: #f4f4f5;
		color: #52525b;
	}

	.status-never-pushed .status-dot {
		background: #a1a1aa;
	}

	.status-synced {
		background: #dcfce7;
		color: #15803d;
	}

	.status-synced .status-dot {
		background: #22c55e;
	}

	h3 {
		font-size: 14px;
		font-weight: 600;
		color: #111;
		letter-spacing: -0.2px;
		line-height: 1.4;
	}

	.fragment-id {
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 11px;
		color: #71717a;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 2px;
	}

	.date {
		font-size: 12px;
		color: #a1a1aa;
	}

	.card-arrow {
		font-size: 12px;
		color: #5b5bd6;
		font-weight: 500;
		opacity: 0;
		transition: opacity 0.12s;
	}

	.card:hover .card-arrow {
		opacity: 1;
	}
</style>
