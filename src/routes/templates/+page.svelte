<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { displayStatusHint, displayStatusLabel } from '$lib/db/attach-email-status.js';
	import type { EmailStatusInfo } from '$lib/db/email-status-types.js';
	import { formatAjoTemplateLabel } from '$lib/ajo/format-template-id.js';

	interface StandaloneTemplate {
		id: string;
		name: string;
		version: string;
		updatedAt?: string;
		emailStatus?: EmailStatusInfo;
	}

	let standaloneTemplates = $state<StandaloneTemplate[]>([]);
	let isLoading = $state(true);
	let loadError = $state('');
	let showNewTemplateForm = $state(false);
	let newTemplateName = $state('');
	let newTemplateCreating = $state(false);
	let newTemplateError = $state('');

	const newTemplateId = $derived(
		newTemplateName
			.toLowerCase()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9-]/g, '')
	);

	onMount(() => {
		void loadTemplates();
	});

	async function loadTemplates() {
		isLoading = true;
		loadError = '';
		try {
			const res = await fetch('/api/templates/standalone');
			if (!res.ok) {
				let detail = '';
				try {
					const body = (await res.json()) as { message?: string };
					detail = body.message ?? '';
				} catch {
					// ignore
				}
				throw new Error(detail || `Failed to load templates (${res.status})`);
			}
			const data = (await res.json()) as { templates: StandaloneTemplate[] };
			standaloneTemplates = data.templates;
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load templates';
		} finally {
			isLoading = false;
		}
	}

	async function createStandaloneTemplate() {
		if (!newTemplateId || newTemplateCreating) return;
		newTemplateCreating = true;
		newTemplateError = '';
		try {
			const res = await fetch('/api/templates', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: `ajo-${newTemplateId}`,
					name: newTemplateName.trim(),
					cfModel: ''
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
				throw new Error(detail || `Create failed (${res.status})`);
			}
			const data = (await res.json()) as { template?: { id: string } };
			const id = data.template?.id ?? `ajo-${newTemplateId}`;
			await goto(`/templates/${id}`);
		} catch (err) {
			newTemplateError = err instanceof Error ? err.message : 'Failed to create template';
		} finally {
			newTemplateCreating = false;
		}
	}

	function formatDate(iso?: string): string {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function statusClass(template: StandaloneTemplate): string {
		const status = template.emailStatus?.syncStatus ?? 'never_pushed';
		return `status-${status.replace('_', '-')}`;
	}

	function statusLabel(template: StandaloneTemplate): string {
		return template.emailStatus?.syncStatus
			? displayStatusLabel(template.emailStatus.syncStatus)
			: 'Draft';
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
				<span class="nav-link active">AJO Templates</span>
				<a href="/fragments" class="nav-link">AJO Fragments</a>
			</nav>
		</div>
	</header>

	<main>
		<div class="section-header">
			<div>
				<h2>AJO Content Templates</h2>
			</div>
			<button
				type="button"
				class="action-btn"
				onclick={() => {
					showNewTemplateForm = !showNewTemplateForm;
					newTemplateError = '';
				}}
			>
				{showNewTemplateForm ? 'Cancel' : 'New template'}
			</button>
		</div>

		{#if showNewTemplateForm}
			<form
				class="new-template-form"
				onsubmit={(e) => {
					e.preventDefault();
					void createStandaloneTemplate();
				}}
			>
				<label>
					<span>Template name</span>
					<input type="text" bind:value={newTemplateName} placeholder="Spring newsletter" required />
				</label>
				{#if newTemplateId}
					<p class="id-preview">ID: <code>ajo-{newTemplateId}</code></p>
				{/if}
				{#if newTemplateError}
					<p class="form-error">{newTemplateError}</p>
				{/if}
				<button type="submit" class="action-btn" disabled={!newTemplateId || newTemplateCreating}>
					{newTemplateCreating ? 'Creating…' : 'Create & edit'}
				</button>
			</form>
		{/if}

		{#if isLoading}
			<p class="status-message">Loading templates…</p>
		{:else if loadError}
			<p class="status-message error">{loadError}</p>
		{:else if standaloneTemplates.length === 0}
			<p class="status-message"></p>
		{:else}
			<div class="card-grid">
				{#each standaloneTemplates as template (template.id)}
					<a href="/templates/{template.id}" class="card">
						<div class="card-top">
							<span class="version-chip">v{template.version}</span>
							<span
								class="status-chip {statusClass(template)}"
								title={template.emailStatus?.syncStatus
									? displayStatusHint(template.emailStatus.syncStatus)
									: undefined}
							>
								<span class="status-dot" aria-hidden="true"></span>
								{statusLabel(template)}
							</span>
						</div>
						<h3>{template.name}</h3>
						{#if template.emailStatus?.remoteTemplateId}
							<p class="ajo-id" title={template.emailStatus.remoteTemplateId}>
								{formatAjoTemplateLabel(template.emailStatus.remoteTemplateId)}
							</p>
						{/if}
						<div class="card-footer">
							{#if template.updatedAt}
								<span class="date">{formatDate(template.updatedAt)}</span>
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

	.section-desc {
		font-size: 13px;
		color: #71717a;
		line-height: 1.5;
		max-width: 560px;
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

	.new-template-form {
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

	.new-template-form label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 12px;
		font-weight: 600;
		color: #3f3f46;
	}

	.new-template-form input {
		font: inherit;
		padding: 8px 10px;
		border: 1px solid #e4e4e7;
		border-radius: 6px;
	}

	.id-preview {
		font-size: 12px;
		color: #71717a;
	}

	.id-preview code {
		background: #f4f4f5;
		padding: 1px 5px;
		border-radius: 4px;
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

	.version-chip {
		font-size: 11px;
		font-weight: 600;
		background: #ededfc;
		color: #5b5bd6;
		padding: 2px 8px;
		border-radius: 4px;
		letter-spacing: 0.2px;
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

	.status-synced,
	.status-live {
		background: #dcfce7;
		color: #15803d;
	}

	.status-synced .status-dot,
	.status-live .status-dot {
		background: #22c55e;
	}

	.status-stale {
		background: #fff7ed;
		color: #c2410c;
	}

	.status-stale .status-dot {
		background: #f97316;
	}

	h3 {
		font-size: 14px;
		font-weight: 600;
		color: #111;
		letter-spacing: -0.2px;
		line-height: 1.4;
	}

	.ajo-id {
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 11px;
		color: #71717a;
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
