<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { cfExperienceCloudEditorUrl } from '$lib/aem/author-links.js';
	import { displayStatusHint, displayStatusLabel } from '$lib/db/attach-email-status.js';
	import type { EmailStatusInfo } from '$lib/db/email-status-types.js';

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

	const aemAuthorUrl = $derived($page.data?.aem?.authorUrl ?? $page.data?.ue?.aemBaseUrl ?? null);
	const cfEditorTenant = $derived($page.data?.aem?.cfEditorTenant ?? 'psc');

	function authorUrlForCampaign(campaign: Campaign): string | null {
		if (!campaign.cfUuid) return null;
		return cfExperienceCloudEditorUrl(campaign.cfUuid, aemAuthorUrl, cfEditorTenant);
	}

	let campaigns = $state<Campaign[]>([]);
	let isLoading = $state(true);
	let loadError = $state('');

	onMount(() => {
		void loadCampaigns();
	});

	async function loadCampaigns() {
		isLoading = true;
		loadError = '';
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
			loadError = err instanceof Error ? err.message : 'Failed to load campaigns';
		} finally {
			isLoading = false;
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
		</div>
	</header>

	<main>
		<div class="section-header">
			<h2>Campaigns</h2>
		</div>

		{#if isLoading}
			<p class="status-message">Loading campaigns…</p>
		{:else if loadError}
			<p class="status-message error">{loadError}</p>
		{:else if campaigns.length === 0}
			<p class="status-message">No campaigns found in AEM.</p>
		{:else}
			<div class="campaign-grid">
				{#each campaigns as campaign}
					<a href="/editor/{campaign.id}" class="campaign-card">
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

	main {
		max-width: 960px;
		margin: 0 auto;
		padding: 48px 40px;
	}

	.section-header {
		display: flex;
		align-items: baseline;
		gap: 10px;
		margin-bottom: 24px;
	}

	.section-header h2 {
		font-size: 15px;
		font-weight: 600;
		color: #111;
		letter-spacing: -0.2px;
	}

	.badge {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.3px;
		background: #fff7ed;
		color: #c2410c;
		border: 1px solid #fed7aa;
		padding: 1px 7px;
		border-radius: 999px;
		text-transform: uppercase;
	}

	.status-message {
		font-size: 14px;
		color: #71717a;
	}

	.status-message.error {
		color: #b91c1c;
	}

	.campaign-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 12px;
	}

	.campaign-card {
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

	.campaign-card:hover {
		border-color: #5b5bd6;
		box-shadow: 0 0 0 3px rgba(91, 91, 214, 0.08);
		transform: translateY(-1px);
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
	}

	.date {
		font-size: 12px;
		color: #a1a1aa;
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: 10px;
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

	.campaign-card:hover .card-arrow {
		opacity: 1;
	}
</style>
