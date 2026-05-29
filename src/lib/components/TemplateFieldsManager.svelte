<script lang="ts">
	import { cfExperienceCloudModelEditorUrl } from '$lib/aem/author-links.js';
	import type { CfInsertField } from '$lib/templates/cf-insert.js';

	interface ContentModel {
		model: { id: string; title: string; path: string };
		fields: CfInsertField[];
	}

	interface Props {
		open?: boolean;
		campaignId?: string;
		authorUrl?: string | null;
		cfEditorTenant?: string;
		onclose?: () => void;
	}

	let {
		open = false,
		campaignId = '',
		authorUrl = null,
		cfEditorTenant = 'psc',
		onclose
	}: Props = $props();

	let loading = $state(false);
	let error = $state('');
	let contentModel = $state<ContentModel | null>(null);

	const modelEditorUrl = $derived(
		contentModel?.model.id
			? cfExperienceCloudModelEditorUrl(contentModel.model.id, authorUrl, cfEditorTenant)
			: null
	);

	let lastLoadKey = '';

	$effect(() => {
		if (!open || !campaignId) {
			lastLoadKey = '';
			return;
		}
		if (campaignId === lastLoadKey) return;
		lastLoadKey = campaignId;
		void loadContentModel(campaignId);
	});

	async function loadContentModel(id: string) {
		loading = true;
		error = '';
		contentModel = null;
		try {
			const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}/content-model`);
			const data = (await res.json().catch(() => ({}))) as ContentModel & { message?: string };
			if (!res.ok) throw new Error(data.message ?? `Load failed (${res.status})`);
			contentModel = data;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load content model';
		} finally {
			loading = false;
		}
	}

	function closeDialog() {
		onclose?.();
	}
</script>

{#if open}
	<div class="manager-layer" role="presentation">
		<button type="button" class="manager-backdrop" aria-label="Close" onclick={closeDialog}></button>
		<div
			class="manager-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="content-model-title"
		>
			<header class="manager-header">
				<div class="manager-header-text">
					<h2 id="content-model-title" class="manager-title">
						{contentModel?.model.title ?? 'Content model'}
					</h2>
					{#if contentModel?.model.path}
						<p class="manager-subtitle">{contentModel.model.path}</p>
					{/if}
				</div>
				<div class="manager-header-actions">
					{#if modelEditorUrl}
						<a
							class="model-edit-link"
							href={modelEditorUrl}
							target="_blank"
							rel="noopener noreferrer"
						>
							Edit model
							<svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path
									d="M3.5 8.5 8.5 3.5"
									stroke="currentColor"
									stroke-width="1.25"
									stroke-linecap="round"
								/>
							</svg>
						</a>
					{/if}
					<button type="button" class="manager-close" onclick={closeDialog} aria-label="Close">×</button>
				</div>
			</header>

			<div class="manager-body">
				{#if loading}
					<p class="fields-status">Loading…</p>
				{:else if contentModel?.fields.length}
					<div class="fields-table-wrap">
						<table class="fields-table">
							<thead>
								<tr>
									<th>Field</th>
									<th>Label</th>
									<th>Token</th>
								</tr>
							</thead>
							<tbody>
								{#each contentModel.fields as field (field.name)}
									<tr>
										<td><code>{field.name}</code></td>
										<td>{field.label}</td>
										<td><code>{`{{${field.token}}}`}</code></td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<p class="fields-footnote">
						Fields come from the AEM model on this email. Use <strong>Insert</strong> in the code
						editor to add them to MJML.
					</p>
				{:else}
					<p class="fields-status">No fields on this content model.</p>
				{/if}
			</div>

			{#if error}
				<div class="manager-error">{error}</div>
			{/if}

			<footer class="manager-footer">
				<button type="button" class="btn-secondary" onclick={closeDialog}>Close</button>
			</footer>
		</div>
	</div>
{/if}

<style>
	.manager-layer {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
	}

	.manager-backdrop {
		position: absolute;
		inset: 0;
		border: none;
		background: rgb(0 0 0 / 0.45);
		cursor: pointer;
	}

	.manager-dialog {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		width: min(520px, 100%);
		max-height: min(80vh, 560px);
		background: var(--surface, #fff);
		border: 1px solid var(--border, #e2e8f0);
		border-radius: 12px;
		box-shadow: 0 24px 48px rgb(0 0 0 / 0.18);
		overflow: hidden;
	}

	.manager-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.875rem 1.25rem;
		border-bottom: 1px solid var(--border, #e2e8f0);
	}

	.manager-header-text {
		min-width: 0;
	}

	.manager-header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.manager-title {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.manager-subtitle {
		margin: 0.2rem 0 0;
		font-family: ui-monospace, monospace;
		font-size: 0.6875rem;
		color: var(--muted, #94a3b8);
		line-height: 1.35;
		word-break: break-all;
	}

	.manager-close {
		width: 2rem;
		height: 2rem;
		border: none;
		border-radius: 6px;
		background: transparent;
		font-size: 1.25rem;
		cursor: pointer;
		color: var(--muted, #64748b);
	}

	.manager-close:hover {
		background: var(--surface-hover, #f1f5f9);
	}

	.model-edit-link {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		height: 2rem;
		padding: 0 0.5rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--accent, #2563eb);
		text-decoration: none;
		white-space: nowrap;
	}

	.model-edit-link:hover {
		text-decoration: underline;
	}

	.manager-body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 1rem 1.25rem;
	}

	.fields-footnote,
	.fields-status {
		margin: 0.75rem 0 0;
		font-size: 0.75rem;
		color: var(--muted, #64748b);
		line-height: 1.45;
	}

	.fields-table-wrap {
		overflow: auto;
		border: 1px solid var(--border, #e2e8f0);
		border-radius: 8px;
	}

	.fields-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;
	}

	.fields-table th,
	.fields-table td {
		padding: 0.5rem 0.75rem;
		text-align: left;
		border-bottom: 1px solid var(--border, #e2e8f0);
	}

	.fields-table th {
		background: var(--surface-hover, #f8fafc);
		font-weight: 500;
		color: var(--muted, #64748b);
		font-size: 0.75rem;
	}

	.manager-error {
		margin: 0 1.25rem;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		background: #fef2f2;
		font-size: 0.8125rem;
		color: #b91c1c;
	}

	.manager-footer {
		padding: 0.75rem 1.25rem;
		border-top: 1px solid var(--border, #e2e8f0);
		display: flex;
		justify-content: flex-end;
	}

	.btn-secondary {
		padding: 0.375rem 0.875rem;
		border-radius: 6px;
		font-size: 0.8125rem;
		cursor: pointer;
		border: 1px solid var(--border, #e2e8f0);
		background: var(--surface, #fff);
	}
</style>
