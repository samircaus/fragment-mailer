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
	<!-- ─── Top bar ─── -->
	<header class="topbar">
		<a href="/" class="back-link">← Campaigns</a>
		<div class="campaign-name">{campaign?.name ?? campaignId}</div>
		<div class="topbar-actions">
			<button
				class="export-btn"
				class:loading={exportStatus === 'exporting'}
				onclick={handleExport}
				disabled={exportStatus === 'exporting'}
			>
				{#if exportStatus === 'exporting'}Exporting…
				{:else if exportStatus === 'done'}Exported ✓
				{:else if exportStatus === 'error'}Export failed
				{:else}Export for AJO{/if}
			</button>
		</div>
	</header>

	<!-- ─── Two-panel layout ─── -->
	<div class="panels">
		<!-- Left: template/persona info -->
		<aside class="panel panel-left">
			<div class="panel-header">Template</div>
			<div class="panel-content">
				<div class="template-info">
					<div class="info-row">
						<span class="info-label">Template</span>
						<span class="info-value">{campaign?.templateId ?? '—'}</span>
					</div>
					<div class="info-row">
						<span class="info-label">CF Path</span>
						<span class="info-value cf-path">{campaign?.cfPath ?? '—'}</span>
					</div>
				</div>

				<div class="section-title">Persona</div>
				<div class="persona-select">
					{#each PERSONAS as persona}
						<label class="persona-option">
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

				<div class="section-title">Blocks in template</div>
				<ul class="block-list">
					<li>Hero headline + subtitle</li>
					<li>Personalised greeting</li>
					<li>Body copy</li>
					<li>Featured offer (optional)</li>
					<li>CTA button</li>
					<li>Footer</li>
				</ul>
			</div>
		</aside>

		<!-- Center: preview iframe (UE-instrumented) -->
		<main class="panel panel-center">
			<div class="panel-header">Preview</div>
			{#if isLoading}
				<div class="preview-loading">Loading preview…</div>
			{:else}
				<div class="iframe-wrapper">
					<iframe
						src={previewUrl}
						title="Email preview"
						allow="same-origin"
						class="preview-iframe"
					></iframe>
				</div>
			{/if}
		</main>
	</div>
</div>

<style>
	.editor-layout {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
		background: #f0f0f0;
	}

	/* ── Topbar ── */
	.topbar {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 0 16px;
		height: 48px;
		background: #1a1a1a;
		color: white;
		flex-shrink: 0;
	}

	.back-link {
		color: #aaa;
		text-decoration: none;
		font-size: 13px;
		white-space: nowrap;
	}
	.back-link:hover { color: white; }

	.campaign-name {
		flex: 1;
		font-size: 14px;
		font-weight: 600;
	}

	.topbar-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.export-btn {
		background: #0265dc;
		color: white;
		border: none;
		border-radius: 4px;
		padding: 6px 14px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}
	.export-btn:hover:not(:disabled) { background: #0050b3; }
	.export-btn:disabled { opacity: 0.6; cursor: default; }
	.export-btn.loading { background: #666; }

	/* ── Panels ── */
	.panels {
		display: grid;
		grid-template-columns: 220px 1fr;
		flex: 1;
		overflow: hidden;
		gap: 1px;
		background: #ddd;
	}

	.panel {
		background: white;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-header {
		padding: 10px 16px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #666;
		border-bottom: 1px solid #e5e5e5;
		flex-shrink: 0;
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
	}

	/* ── Left panel ── */
	.template-info { margin-bottom: 20px; }

	.info-row {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: 10px;
	}

	.info-label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #888;
		font-weight: 600;
	}

	.info-value {
		font-size: 13px;
		color: #1a1a1a;
	}

	.cf-path {
		font-family: monospace;
		font-size: 11px;
		color: #555;
		word-break: break-all;
	}

	.section-title {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #888;
		margin-bottom: 8px;
		margin-top: 16px;
	}

	.persona-select {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 16px;
	}

	.persona-option {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		cursor: pointer;
	}

	.block-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.block-list li {
		font-size: 12px;
		color: #555;
		padding: 4px 8px;
		background: #f8f8f8;
		border-radius: 4px;
	}

	/* ── Center panel ── */
	.panel-center { background: #e8e8e8; }

	.preview-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		color: #888;
		font-size: 13px;
	}

	.iframe-wrapper {
		flex: 1;
		overflow: auto;
		display: flex;
		justify-content: center;
		padding: 16px;
		background: #e8e8e8;
	}

	.preview-iframe {
		width: 600px;
		height: 100%;
		border: none;
		background: white;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
	}
</style>
