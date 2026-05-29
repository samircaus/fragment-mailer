<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import MjmlCodeEditor from '$lib/components/MjmlCodeEditor.svelte';
	import { formatAjoTemplateLabel } from '$lib/ajo/format-template-id.js';
	import { displayStatusHint, displayStatusLabel } from '$lib/db/attach-email-status.js';
	import type { EmailStatusInfo } from '$lib/db/email-status-types.js';

	const templateId = $derived($page.params.id);

	interface TemplateMeta {
		id: string;
		name: string;
		version: string;
	}

	let template = $state<TemplateMeta | null>(null);
	let mjmlCode = $state('');
	let previewHtml = $state('');
	let emailStatus = $state<EmailStatusInfo | undefined>();
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isPushing = $state(false);
	let loadError = $state('');
	let saveError = $state('');
	let saveSuccess = $state('');
	let pushError = $state('');
	let pushSuccess = $state('');

	onMount(() => {
		void loadTemplate();
	});

	async function loadTemplate() {
		isLoading = true;
		loadError = '';
		try {
			const [templateRes, standaloneRes] = await Promise.all([
				fetch(`/api/templates/${encodeURIComponent(templateId)}`),
				fetch('/api/templates/standalone')
			]);

			if (!templateRes.ok) {
				let detail = '';
				try {
					const body = (await templateRes.json()) as { message?: string };
					detail = body.message ?? '';
				} catch {
					// ignore
				}
				throw new Error(detail || `Failed to load template (${templateRes.status})`);
			}

			const data = (await templateRes.json()) as {
				mjml: string;
				definition: TemplateMeta;
			};
			template = data.definition;
			mjmlCode = data.mjml;

			if (standaloneRes.ok) {
				const standalone = (await standaloneRes.json()) as {
					templates: Array<{ id: string; emailStatus?: EmailStatusInfo }>;
				};
				emailStatus = standalone.templates.find((t) => t.id === templateId)?.emailStatus;
			}

			await refreshPreview();
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load template';
		} finally {
			isLoading = false;
		}
	}

	async function refreshPreview() {
		if (!mjmlCode.trim()) {
			previewHtml = '';
			return;
		}
		try {
			const res = await fetch('/api/compile/standalone', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mjml: mjmlCode })
			});
			if (!res.ok) return;
			const data = (await res.json()) as { html?: string };
			previewHtml = data.html ?? '';
		} catch {
			// preview is best-effort
		}
	}

	async function saveTemplate() {
		if (!template) return;
		isSaving = true;
		saveError = '';
		saveSuccess = '';
		try {
			const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mjml: mjmlCode })
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
			saveSuccess = 'Saved.';
			await refreshPreview();
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Save failed';
		} finally {
			isSaving = false;
		}
	}

	async function pushToAjo() {
		if (!template) return;
		isPushing = true;
		pushError = '';
		pushSuccess = '';
		try {
			const res = await fetch('/api/export/ajo/standalone', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					templateId,
					mjml: mjmlCode,
					push: true,
					templateName: template.name,
					ajoTemplateId: emailStatus?.remoteTemplateId
				})
			});
			const data = (await res.json()) as {
				ok?: boolean;
				message?: string;
				templateId?: string;
			};
			if (!res.ok || !data.ok) {
				throw new Error(data.message || `Push failed (${res.status})`);
			}
			pushSuccess = data.templateId
				? `Pushed ${formatAjoTemplateLabel(data.templateId)}`
				: 'Pushed to AJO.';
			await loadTemplate();
		} catch (err) {
			pushError = err instanceof Error ? err.message : 'Push failed';
		} finally {
			isPushing = false;
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
				<a href="/" class="nav-link active">Emails</a>
				<a href="/fragments" class="nav-link">AJO Fragments</a>
			</nav>
		</div>
	</header>

	<main>
		<div class="breadcrumb">
			<a href="/">← Emails</a>
		</div>

		{#if isLoading}
			<p class="status-message">Loading template…</p>
		{:else if loadError}
			<p class="status-message error">{loadError}</p>
		{:else if template}
			<div class="editor-header">
				<div>
					<h1>{template.name}</h1>
					<div class="meta">
						<span class="meta-item">Standalone MJML</span>
						{#if emailStatus?.syncStatus}
							<span
								class="status-chip status-{emailStatus.syncStatus.replace('_', '-')}"
								title={displayStatusHint(emailStatus.syncStatus)}
							>
								{displayStatusLabel(emailStatus.syncStatus)}
							</span>
						{/if}
						{#if emailStatus?.remoteTemplateId}
							<span class="meta-item mono" title={emailStatus.remoteTemplateId}>
								{formatAjoTemplateLabel(emailStatus.remoteTemplateId)}
							</span>
						{/if}
					</div>
				</div>
				<div class="actions">
					<button type="button" class="secondary-btn" onclick={() => refreshPreview()}>Preview</button>
					<button type="button" class="secondary-btn" onclick={() => saveTemplate()} disabled={isSaving}>
						{isSaving ? 'Saving…' : 'Save'}
					</button>
					<button type="button" class="primary-btn" onclick={() => pushToAjo()} disabled={isPushing}>
						{isPushing ? 'Pushing…' : 'Push to AJO'}
					</button>
				</div>
			</div>

			{#if saveError}
				<p class="banner error">{saveError}</p>
			{:else if saveSuccess}
				<p class="banner success">{saveSuccess}</p>
			{/if}
			{#if pushError}
				<p class="banner error">{pushError}</p>
			{:else if pushSuccess}
				<p class="banner success">{pushSuccess}</p>
			{/if}

			<div class="editor-layout">
				<div class="editor-pane">
					<MjmlCodeEditor
						bind:value={mjmlCode}
						placeholder="<mjml>…</mjml>"
						onsave={() => saveTemplate()}
					/>
				</div>
				<div class="preview-pane">
					<div class="preview-label">Preview</div>
					{#if previewHtml}
						<iframe title="Email preview" srcdoc={previewHtml} class="preview-frame"></iframe>
					{:else}
						<p class="preview-empty">Compile preview to see rendered HTML.</p>
					{/if}
				</div>
			</div>
		{/if}
	</main>
</div>

<style>
	.page {
		min-height: 100vh;
		background: #fafafa;
		display: flex;
		flex-direction: column;
	}

	header {
		background: #111;
		padding: 0 40px;
		height: 52px;
		display: flex;
		align-items: center;
		border-bottom: 1px solid #222;
		flex-shrink: 0;
	}

	.header-inner {
		max-width: 1200px;
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

	main {
		max-width: 1200px;
		width: 100%;
		margin: 0 auto;
		padding: 32px 40px 48px;
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.breadcrumb a {
		font-size: 12px;
		color: #71717a;
		text-decoration: none;
	}

	.breadcrumb a:hover {
		color: #5b5bd6;
	}

	.editor-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin: 20px 0 16px;
	}

	h1 {
		font-size: 18px;
		font-weight: 600;
		color: #111;
		margin-bottom: 8px;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.meta-item {
		font-size: 12px;
		color: #71717a;
	}

	.meta-item.mono {
		font-family: 'SF Mono', 'Fira Code', monospace;
	}

	.status-chip {
		font-size: 11px;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 999px;
	}

	.status-never-pushed {
		background: #f4f4f5;
		color: #52525b;
	}

	.status-synced,
	.status-live {
		background: #dcfce7;
		color: #15803d;
	}

	.status-stale {
		background: #fff7ed;
		color: #c2410c;
	}

	.actions {
		display: flex;
		gap: 8px;
		flex-shrink: 0;
	}

	.primary-btn,
	.secondary-btn {
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		padding: 8px 14px;
		border-radius: 6px;
		cursor: pointer;
	}

	.primary-btn {
		background: #5b5bd6;
		color: #fff;
		border: 1px solid #5b5bd6;
	}

	.primary-btn:hover:not(:disabled) {
		background: #4f4fc4;
	}

	.secondary-btn {
		background: #fff;
		color: #3f3f46;
		border: 1px solid #e4e4e7;
	}

	.secondary-btn:hover:not(:disabled) {
		border-color: #5b5bd6;
		color: #5b5bd6;
	}

	.primary-btn:disabled,
	.secondary-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.banner {
		font-size: 13px;
		padding: 10px 12px;
		border-radius: 8px;
		margin-bottom: 12px;
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

	.status-message {
		font-size: 14px;
		color: #71717a;
		margin-top: 24px;
	}

	.status-message.error {
		color: #b91c1c;
	}

	.editor-layout {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		flex: 1;
		min-height: 520px;
	}

	.editor-pane,
	.preview-pane {
		background: #fff;
		border: 1px solid #e4e4e7;
		border-radius: 10px;
		overflow: hidden;
		min-height: 0;
	}

	.editor-pane :global(.cm-editor) {
		height: 100%;
		min-height: 520px;
	}

	.preview-pane {
		display: flex;
		flex-direction: column;
	}

	.preview-label {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: #71717a;
		padding: 10px 12px;
		border-bottom: 1px solid #e4e4e7;
		background: #fafafa;
	}

	.preview-frame {
		flex: 1;
		width: 100%;
		border: 0;
		background: #fff;
		min-height: 480px;
	}

	.preview-empty {
		padding: 24px;
		font-size: 13px;
		color: #a1a1aa;
	}

	@media (max-width: 960px) {
		.editor-layout {
			grid-template-columns: 1fr;
		}
	}
</style>
