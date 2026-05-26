<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	interface Campaign {
		id: string;
		name: string;
		templateId: string;
		cfPath: string;
		status: string;
	}

	const campaignId = $derived($page.params.campaignId);

	let campaign = $state<Campaign | null>(null);
	let selectedPersonaId = $state('persona-1');
	let isLoading = $state(true);
	let iframeKey = $state(0);
	let iframeEl = $state<HTMLIFrameElement | null>(null);

	function fitIframe() {
		if (!iframeEl?.contentDocument) return;
		const body = iframeEl.contentDocument.body;
		if (!body) return;
		iframeEl.style.height = body.scrollHeight + 'px';
	}
	let exportStatus = $state<'idle' | 'exporting' | 'done' | 'error'>('idle');

	const PERSONAS = [
		{ id: 'persona-1', label: 'Sarah (Gold)' },
		{ id: 'persona-2', label: 'Marcus (New)' },
		{ id: 'persona-3', label: 'Elena (Platinum)' }
	];

	const previewUrl = $derived(
		`/preview/${campaignId}?personaId=${selectedPersonaId}&t=${iframeKey}`
	);

	onMount(async () => {
		await loadCampaign();
	});

	async function loadCampaign() {
		isLoading = true;
		try {
			const res = await fetch(`/api/campaigns/${campaignId}`);
			if (!res.ok) throw new Error(`${res.status}`);
			const data = await res.json() as { campaign: Campaign };
			campaign = data.campaign;
		} catch (err) {
			console.error('Failed to load campaign:', err);
		} finally {
			isLoading = false;
		}
	}

	async function handleExport() {
		exportStatus = 'exporting';
		try {
			const res = await fetch(
				`/api/export?campaignId=${campaignId}&personaId=${selectedPersonaId}`
			);
			if (!res.ok) throw new Error(`Export failed: ${res.status}`);
			const blob = await res.blob();
			const downloadUrl = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = downloadUrl;
			a.download = `${campaignId}-export.json`;
			a.click();
			URL.revokeObjectURL(downloadUrl);
			exportStatus = 'done';
			setTimeout(() => (exportStatus = 'idle'), 3000);
		} catch (err) {
			console.error('Export failed:', err);
			exportStatus = 'error';
			setTimeout(() => (exportStatus = 'idle'), 3000);
		}
	}
</script>

<div class="editor-layout">
	<header class="topbar">
		<a href="/" class="back-link">
			<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M9 11L5 7l4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			Campaigns
		</a>
		<div class="topbar-divider"></div>
		<div class="campaign-name">{campaign?.name ?? campaignId}</div>
		<div class="topbar-spacer"></div>
		<button
			class="export-btn"
			class:loading={exportStatus === 'exporting'}
			class:done={exportStatus === 'done'}
			class:error={exportStatus === 'error'}
			onclick={handleExport}
			disabled={exportStatus === 'exporting'}
		>
			{#if exportStatus === 'exporting'}Exporting…
			{:else if exportStatus === 'done'}Exported ✓
			{:else if exportStatus === 'error'}Export failed
			{:else}Export for AJO{/if}
		</button>
	</header>

	<div class="panels">
		<aside class="sidebar">
			<div class="sidebar-section">
				<div class="sidebar-label">Template</div>
				<div class="sidebar-value">{campaign?.templateId ?? '—'}</div>
			</div>

			<div class="sidebar-section">
				<div class="sidebar-label">CF Path</div>
				<div class="sidebar-value cf-path">{campaign?.cfPath ?? '—'}</div>
			</div>

			<div class="sidebar-divider"></div>

			<div class="sidebar-section">
				<div class="sidebar-label">Persona</div>
				<div class="persona-list">
					{#each PERSONAS as persona}
						<label class="persona-option" class:active={selectedPersonaId === persona.id}>
							<input
								type="radio"
								name="persona"
								value={persona.id}
								bind:group={selectedPersonaId}
								onchange={() => (iframeKey += 1)}
							/>
							{persona.label}
						</label>
					{/each}
				</div>
			</div>

			<div class="sidebar-divider"></div>

			<div class="sidebar-section">
				<div class="sidebar-label">Blocks</div>
				<ul class="block-list">
					<li>Hero headline + subtitle</li>
					<li>Personalised greeting</li>
					<li>Body copy</li>
					<li>Featured offer</li>
					<li>CTA button</li>
					<li>Footer</li>
				</ul>
			</div>
		</aside>

		<main class="preview-area">
			{#if isLoading}
				<div class="preview-loading">
					<div class="loading-dot"></div>
					<span>Loading preview…</span>
				</div>
			{:else}
				<div class="preview-stage">
					<iframe
						bind:this={iframeEl}
						src={previewUrl}
						title="Email preview"
						allow="same-origin"
						scrolling="no"
						class="preview-iframe"
						onload={fitIframe}
					></iframe>
				</div>
			{/if}
		</main>
	</div>
</div>

<style>
	.editor-layout {
		min-height: 100vh;
		background: #fafafa;
	}

	/* ── Topbar ── */
	.topbar {
		position: sticky;
		top: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 20px;
		height: 48px;
		background: #111;
		border-bottom: 1px solid #222;
	}

	.back-link {
		display: flex;
		align-items: center;
		gap: 4px;
		color: #71717a;
		text-decoration: none;
		font-size: 13px;
		white-space: nowrap;
		transition: color 0.1s;
	}
	.back-link:hover { color: #fff; }

	.topbar-divider {
		width: 1px;
		height: 16px;
		background: #2e2e2e;
		flex-shrink: 0;
	}

	.campaign-name {
		font-size: 13px;
		font-weight: 500;
		color: #e4e4e7;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 300px;
	}

	.topbar-spacer { flex: 1; }

	.export-btn {
		background: #5b5bd6;
		color: #fff;
		border: none;
		border-radius: 6px;
		padding: 6px 14px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		letter-spacing: 0.1px;
		transition: background 0.1s;
	}
	.export-btn:hover:not(:disabled) { background: #4f4ec9; }
	.export-btn:disabled { opacity: 0.5; cursor: default; }
	.export-btn.loading { background: #444; }
	.export-btn.done { background: #16a34a; }
	.export-btn.error { background: #dc2626; }

	/* ── Layout ── */
	.panels {
		display: grid;
		grid-template-columns: 216px 1fr;
		min-height: calc(100vh - 48px);
	}

	/* ── Sidebar ── */
	.sidebar {
		background: #fff;
		border-right: 1px solid #e4e4e7;
		padding: 20px 16px;
		position: sticky;
		top: 48px;
		height: calc(100vh - 48px);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.sidebar-section {
		margin-bottom: 20px;
	}

	.sidebar-label {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: #a1a1aa;
		margin-bottom: 6px;
	}

	.sidebar-value {
		font-size: 13px;
		color: #111;
		font-weight: 500;
	}

	.cf-path {
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 11px;
		color: #71717a;
		word-break: break-all;
		font-weight: 400;
	}

	.sidebar-divider {
		height: 1px;
		background: #f4f4f5;
		margin: 4px 0 20px;
	}

	.persona-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.persona-option {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: #3f3f46;
		cursor: pointer;
		padding: 6px 8px;
		border-radius: 6px;
		transition: background 0.1s;
	}

	.persona-option:hover { background: #f4f4f5; }
	.persona-option.active { background: #ededfc; color: #5b5bd6; font-weight: 500; }

	.persona-option input[type="radio"] {
		accent-color: #5b5bd6;
	}

	.block-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.block-list li {
		font-size: 12px;
		color: #71717a;
		padding: 5px 8px;
		border-radius: 5px;
		background: #fafafa;
		border: 1px solid #f4f4f5;
	}

	/* ── Preview area ── */
	.preview-area {
		background: #f4f4f5;
		padding: 32px 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.preview-loading {
		display: flex;
		align-items: center;
		gap: 10px;
		color: #a1a1aa;
		font-size: 13px;
		margin-top: 80px;
	}

	.loading-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #5b5bd6;
		animation: pulse 1.2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.3; transform: scale(0.8); }
		50% { opacity: 1; transform: scale(1); }
	}

	.preview-stage {
		width: 100%;
		display: flex;
		justify-content: center;
	}

	.preview-iframe {
		width: 600px;
		height: 150px; /* replaced by fitIframe on load */
		overflow: hidden;
		border: none;
		background: #fff;
		border-radius: 4px;
		box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 24px rgba(0,0,0,0.06);
	}
</style>
