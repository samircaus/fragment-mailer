<script lang="ts">
	import { onMount } from 'svelte';

	interface Campaign {
		id: string;
		name: string;
		templateId: string;
		status: string;
		updatedAt: string;
	}

	let campaigns = $state<Campaign[]>([]);
	let mockMode = $state(false);
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
			const data = (await res.json()) as { campaigns: Campaign[]; mockMode: boolean };
			campaigns = data.campaigns;
			mockMode = data.mockMode;
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
			{#if mockMode}
				<span class="badge">Mock</span>
			{/if}
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
							<span class="status-chip status-{campaign.status}">{campaign.status}</span>
						</div>
						<h3>{campaign.name}</h3>
						<div class="card-footer">
							{#if campaign.updatedAt}
								<span class="date">{formatDate(campaign.updatedAt)}</span>
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
		font-size: 11px;
		font-weight: 500;
		padding: 2px 8px;
		border-radius: 4px;
	}

	.status-draft {
		background: #f4f4f5;
		color: #71717a;
	}

	.status-live {
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

	.campaign-card:hover .card-arrow {
		opacity: 1;
	}
</style>
