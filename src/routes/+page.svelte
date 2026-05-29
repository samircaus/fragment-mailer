<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { cfExperienceCloudBrowseUrl, cfExperienceCloudEditorUrl } from '$lib/aem/author-links.js';
	import { displayStatusHint, displayStatusLabel } from '$lib/db/attach-email-status.js';
	import type { EmailStatusInfo } from '$lib/db/email-status-types.js';
	import { formatAjoTemplateLabel } from '$lib/ajo/format-template-id.js';

	interface Campaign {
		id: string;
		name: string;
		cfPath: string;
		cfUuid?: string;
		templateId: string;
		status: string;
		updatedAt?: string;
		emailStatus?: EmailStatusInfo;
	}

	interface StandaloneTemplate {
		id: string;
		name: string;
		version: string;
		emailStatus?: EmailStatusInfo;
	}

	interface AjoRemoteTemplate {
		id: string;
		name: string;
		templateType: string;
		modifiedAt?: string;
		origin?: string;
	}

	const aemAuthorUrl = $derived($page.data?.aem?.authorUrl ?? $page.data?.ue?.aemBaseUrl ?? null);
	const cfEditorTenant = $derived($page.data?.aem?.cfEditorTenant ?? 'psc');
	const campaignsPath = $derived($page.data?.aem?.campaignsPath ?? '/content/dam/email/en/campaigns');
	const cfBrowseUrl = $derived(
		cfExperienceCloudBrowseUrl(campaignsPath, aemAuthorUrl, cfEditorTenant)
	);

	function authorUrlForCampaign(campaign: Campaign): string | null {
		if (!campaign.cfUuid) return null;
		return cfExperienceCloudEditorUrl(campaign.cfUuid, aemAuthorUrl, cfEditorTenant);
	}

	let campaigns = $state<Campaign[]>([]);
	let standaloneTemplates = $state<StandaloneTemplate[]>([]);
	let ajoTemplates = $state<AjoRemoteTemplate[]>([]);
	let campaignsLoading = $state(true);
	let templatesLoading = $state(true);
	let campaignsError = $state('');
	let templatesError = $state('');
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

	const linkedAjoIds = $derived(
		new Set(
			standaloneTemplates
				.map((t) => t.emailStatus?.remoteTemplateId)
				.filter((id): id is string => Boolean(id))
		)
	);

	const ajoOnlyTemplates = $derived(
		ajoTemplates.filter((t) => t.id && !linkedAjoIds.has(t.id))
	);

	onMount(() => {
		void loadCampaigns();
		void loadTemplates();
	});

	async function loadCampaigns() {
		campaignsLoading = true;
		campaignsError = '';
		try {
			const res = await fetch('/api/campaigns');
			if (!res.ok) {
				let detail = '';
				try {
					const body = (await res.json()) as { message?: string };
					detail = body.message ?? '';
				} catch {
					// ignore non-JSON error bodies
				}
				throw new Error(detail || `Failed to load campaigns (${res.status})`);
			}
			const data = (await res.json()) as { campaigns: Campaign[] };
			campaigns = data.campaigns;
		} catch (err) {
			campaignsError = err instanceof Error ? err.message : 'Failed to load campaigns';
		} finally {
			campaignsLoading = false;
		}
	}

	async function loadTemplates() {
		templatesLoading = true;
		templatesError = '';
		try {
			const [standaloneRes, ajoRes] = await Promise.all([
				fetch('/api/templates/standalone'),
				fetch('/api/ajo/templates')
			]);

			if (standaloneRes.ok) {
				const data = (await standaloneRes.json()) as { templates: StandaloneTemplate[] };
				standaloneTemplates = data.templates;
			}

			if (ajoRes.ok) {
				const data = (await ajoRes.json()) as { templates: AjoRemoteTemplate[] };
				ajoTemplates = data.templates;
			} else if (!standaloneRes.ok) {
				let detail = '';
				try {
					const body = (await ajoRes.json()) as { message?: string };
					detail = body.message ?? '';
				} catch {
					// ignore
				}
				throw new Error(detail || `Failed to load AJO templates (${ajoRes.status})`);
			}
		} catch (err) {
			templatesError = err instanceof Error ? err.message : 'Failed to load templates';
		} finally {
			templatesLoading = false;
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

	function formatDate(iso: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<div class="page">
	<header>
		<div class="header-inner">
			<div class="brand">
				<span class="brand-dot"></span>
				<span class="brand-name">Fragment Mailer</span>
			</div>
			<nav class="header-nav">
				<span class="nav-link active">Emails</span>
				<a href="/fragments" class="nav-link">AJO Fragments</a>
			</nav>
		</div>
	</header>

	<main>
		<section class="content-section">
			<div class="section-header">
				<div>
					<h2>AEM Campaigns</h2>
					<p class="section-path">
						<code>{campaignsPath}</code>
						{#if cfBrowseUrl}
							<a href={cfBrowseUrl} target="_blank" rel="noopener noreferrer" class="folder-link">
								Open in CF editor ↗
							</a>
						{/if}
					</p>
				</div>
			</div>

			{#if campaignsLoading}
				<p class="status-message">Loading campaigns…</p>
			{:else if campaignsError}
				<p class="status-message error">{campaignsError}</p>
			{:else if campaigns.length === 0}
				<p class="status-message">No campaigns found in AEM.</p>
			{:else}
				<div class="card-grid">
					{#each campaigns as campaign}
						<a href="/editor/{campaign.id}" class="card">
							<div class="card-top">
								<span class="template-chip">{campaign.templateId}</span>
								<span
									class="status-chip status-{campaign.status.replace('_', '-')}"
									title={displayStatusHint(campaign.status)}
								>
									<span class="status-dot" aria-hidden="true"></span>
									{displayStatusLabel(campaign.status)}
								</span>
							</div>
							<h3>{campaign.name}</h3>
							<div class="card-footer">
								{#if campaign.updatedAt}
									<span class="date">{formatDate(campaign.updatedAt)}</span>
								{/if}
								<div class="card-actions">
									{#if authorUrlForCampaign(campaign)}
										<button
											type="button"
											class="card-author-link"
											title="Open in AEM Author"
											onclick={(e) => {
												e.stopPropagation();
												e.preventDefault();
												const url = authorUrlForCampaign(campaign);
												if (url) window.open(url, '_blank', 'noopener,noreferrer');
											}}
										>
											Author ↗
										</button>
									{/if}
									<span class="card-arrow">Open →</span>
								</div>
							</div>
						</a>
					{/each}
				</div>
			{/if}
		</section>

		<section class="content-section">
			<div class="section-header">
				<div>
					<h2>AJO Content Templates</h2>
					<p class="section-desc">
						Pure MJML templates — no AEM content fragments. Edit here, then push to AJO.
					</p>
				</div>
				<button
					type="button"
					class="new-btn"
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
						<input
							type="text"
							bind:value={newTemplateName}
							placeholder="Spring newsletter"
							required
						/>
					</label>
					{#if newTemplateId}
						<p class="id-preview">ID: <code>ajo-{newTemplateId}</code></p>
					{/if}
					{#if newTemplateError}
						<p class="form-error">{newTemplateError}</p>
					{/if}
					<button type="submit" class="new-btn" disabled={!newTemplateId || newTemplateCreating}>
						{newTemplateCreating ? 'Creating…' : 'Create & edit'}
					</button>
				</form>
			{/if}

			{#if templatesLoading}
				<p class="status-message">Loading templates…</p>
			{:else if templatesError}
				<p class="status-message error">{templatesError}</p>
			{:else if standaloneTemplates.length === 0 && ajoOnlyTemplates.length === 0}
				<p class="status-message">No content templates yet. Create one to get started.</p>
			{:else}
				<div class="card-grid">
					{#each standaloneTemplates as template (template.id)}
						<a href="/templates/{template.id}" class="card">
							<div class="card-top">
								<span class="template-chip">MJML</span>
								{#if template.emailStatus?.syncStatus}
									<span
										class="status-chip status-{template.emailStatus.syncStatus.replace('_', '-')}"
										title={displayStatusHint(template.emailStatus.syncStatus)}
									>
										<span class="status-dot" aria-hidden="true"></span>
										{displayStatusLabel(template.emailStatus.syncStatus)}
									</span>
								{/if}
							</div>
							<h3>{template.name}</h3>
							<div class="card-footer">
								{#if template.emailStatus?.remoteTemplateId}
									<span class="template-id" title={template.emailStatus.remoteTemplateId}>
										{formatAjoTemplateLabel(template.emailStatus.remoteTemplateId)}
									</span>
								{/if}
								<span class="card-arrow">Edit →</span>
							</div>
						</a>
					{/each}

					{#each ajoOnlyTemplates as template (template.id)}
						<div class="card card-readonly">
							<div class="card-top">
								<span class="template-chip">{template.templateType}</span>
								<span class="status-chip status-synced">
									<span class="status-dot" aria-hidden="true"></span>
									In AJO
								</span>
							</div>
							<h3>{template.name}</h3>
							<div class="card-footer">
								<span class="template-id" title={template.id}>{formatAjoTemplateLabel(template.id)}</span>
								{#if template.modifiedAt}
									<span class="date">{formatDate(template.modifiedAt)}</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>
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

	.content-section + .content-section {
		margin-top: 56px;
		padding-top: 8px;
		border-top: 1px solid #e4e4e7;
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

	.section-path {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		font-size: 12px;
		color: #71717a;
	}

	.section-path code {
		font-size: 12px;
		background: #f4f4f5;
		padding: 2px 6px;
		border-radius: 4px;
		color: #3f3f46;
	}

	.folder-link {
		font-size: 12px;
		font-weight: 600;
		color: #5b5bd6;
		text-decoration: none;
	}

	.folder-link:hover {
		text-decoration: underline;
	}

	.section-desc {
		font-size: 13px;
		color: #71717a;
		line-height: 1.5;
		max-width: 560px;
	}

	.new-btn {
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

	.new-btn:hover:not(:disabled) {
		background: #4f4fc4;
	}

	.new-btn:disabled {
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

	.card-readonly {
		opacity: 0.92;
		cursor: default;
	}

	.card-readonly:hover {
		border-color: #e4e4e7;
		box-shadow: none;
		transform: none;
	}

	.card-top {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.template-chip {
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

	.status-draft,
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

	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 2px;
		gap: 8px;
	}

	.date {
		font-size: 12px;
		color: #a1a1aa;
	}

	.template-id {
		font-size: 11px;
		font-family: 'SF Mono', 'Fira Code', monospace;
		color: #a1a1aa;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-left: auto;
	}

	.card-author-link {
		font: inherit;
		font-size: 11px;
		font-weight: 600;
		color: #71717a;
		text-decoration: none;
		padding: 2px 6px;
		border-radius: 4px;
		border: 1px solid #e4e4e7;
		background: transparent;
		cursor: pointer;
	}

	.card-author-link:hover {
		color: #5b5bd6;
		border-color: #c7c7f5;
		background: #f8f8ff;
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
