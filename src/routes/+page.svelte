<script lang="ts">
	interface Campaign {
		id: string;
		name: string;
		templateId: string;
		status: string;
		updatedAt: string;
	}

	// Mock campaigns for the landing page
	const campaigns: Campaign[] = [
		{
			id: 'mock-campaign-1',
			name: 'Spring Promo 2025',
			templateId: 'promo',
			status: 'draft',
			updatedAt: '2025-03-15T10:30:00Z'
		},
		{
			id: 'mock-campaign-2',
			name: 'Welcome Series — Email 1',
			templateId: 'promo',
			status: 'draft',
			updatedAt: '2025-02-01T09:00:00Z'
		}
	];

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<div class="page">
	<header>
		<div class="header-inner">
			<div class="wordmark">Fragment Mailer</div>
			<p class="tagline">Preview AEM Content Fragment emails before they reach Journey Optimizer</p>
		</div>
	</header>

	<main>
		<div class="section-header">
			<h2>Campaigns</h2>
			<span class="badge">MOCK MODE</span>
		</div>

		<div class="campaign-grid">
			{#each campaigns as campaign}
				<a href="/editor/{campaign.id}" class="campaign-card">
					<div class="card-top">
						<span class="template-chip">{campaign.templateId}</span>
						<span class="status-chip status-{campaign.status}">{campaign.status}</span>
					</div>
					<h3>{campaign.name}</h3>
					<p class="meta">Updated {formatDate(campaign.updatedAt)}</p>
					<div class="card-cta">Open in editor →</div>
				</a>
			{/each}
		</div>
	</main>
</div>

<style>
	.page {
		min-height: 100vh;
		background: #f8f8f8;
	}

	header {
		background: #1a1a1a;
		color: white;
		padding: 32px 40px;
	}

	.header-inner {
		max-width: 960px;
		margin: 0 auto;
	}

	.wordmark {
		font-size: 20px;
		font-weight: 700;
		letter-spacing: -0.5px;
		margin-bottom: 6px;
	}

	.tagline {
		font-size: 14px;
		color: #888;
	}

	main {
		max-width: 960px;
		margin: 0 auto;
		padding: 40px;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 20px;
	}

	.section-header h2 {
		font-size: 18px;
		font-weight: 600;
	}

	.badge {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.5px;
		background: #fff3cd;
		color: #856404;
		border: 1px solid #ffc107;
		padding: 2px 8px;
		border-radius: 999px;
	}

	.campaign-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 16px;
	}

	.campaign-card {
		background: white;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		padding: 20px;
		text-decoration: none;
		color: inherit;
		display: flex;
		flex-direction: column;
		gap: 8px;
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}

	.campaign-card:hover {
		border-color: #0265dc;
		box-shadow: 0 2px 8px rgba(2, 101, 220, 0.12);
	}

	.card-top {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.template-chip {
		font-size: 11px;
		background: #e8f0fe;
		color: #0265dc;
		padding: 2px 8px;
		border-radius: 4px;
		font-weight: 600;
	}

	.status-chip {
		font-size: 11px;
		padding: 2px 8px;
		border-radius: 4px;
	}

	.status-draft {
		background: #f5f5f5;
		color: #666;
	}

	.status-live {
		background: #d4edda;
		color: #155724;
	}

	h3 {
		font-size: 15px;
		font-weight: 600;
		color: #1a1a1a;
	}

	.meta {
		font-size: 12px;
		color: #888;
	}

	.card-cta {
		margin-top: 4px;
		font-size: 13px;
		color: #0265dc;
		font-weight: 500;
	}
</style>
