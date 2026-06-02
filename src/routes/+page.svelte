<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { cfExperienceCloudBrowseUrl, cfExperienceCloudEditorUrl } from '$lib/aem/author-links.js';
	import {
		absoluteFolderPath,
		folderForCampaign,
		campaignsInFolder,
		collectAllFolderPaths,
		folderDisplayName,
		folderToSearchParam,
		parseFolderFromSearchParam
	} from '$lib/campaigns/folder-tree.js';
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
	const campaignsPath = $derived($page.data?.aem?.campaignsPath ?? '/content/dam/email/en/campaigns');

	function authorUrlForCampaign(campaign: Campaign): string | null {
		if (!campaign.cfUuid) return null;
		return cfExperienceCloudEditorUrl(campaign.cfUuid, aemAuthorUrl, cfEditorTenant);
	}

	let campaigns = $state<Campaign[]>([]);
	let isLoading = $state(true);
	let loadError = $state('');
	let currentFolder = $state('/');
	let filterQuery = $state('');
	const allFolders = $derived.by(() => {
		return [...collectAllFolderPaths(campaigns, campaignsPath, [currentFolder])]
			.sort((a, b) => {
				const depthDiff = folderDepth(a) - folderDepth(b);
				if (depthDiff !== 0) return depthDiff;
				return a.localeCompare(b);
			})
			.map((path) => ({
				path,
				label: folderDisplayName(path, campaignsPath),
				depth: folderDepth(path)
			}));
	});
	const folderCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const campaign of campaigns) {
			const folder = folderForCampaign(campaign.cfPath, campaignsPath);
			counts.set(folder, (counts.get(folder) ?? 0) + 1);
		}
		return counts;
	});
	const currentFolderPath = $derived(absoluteFolderPath(currentFolder, campaignsPath));

	const visibleCampaigns = $derived.by(() => {
		const inFolder = campaignsInFolder(campaigns, currentFolder, campaignsPath);
		const q = filterQuery.trim().toLowerCase();
		const list = q
			? inFolder.filter((c) => c.name.toLowerCase().includes(q))
			: inFolder;
		return [...list].sort((a, b) => a.name.localeCompare(b.name));
	});

	onMount(() => {
		currentFolder = parseFolderFromSearchParam($page.url.searchParams.get('folder'));
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

	function navigateFolder(relPath: string) {
		currentFolder = relPath;
		filterQuery = '';
		const url = new URL($page.url);
		const param = folderToSearchParam(relPath);
		if (param) url.searchParams.set('folder', param);
		else url.searchParams.delete('folder');
		const search = url.searchParams.toString();
		goto(`${url.pathname}${search ? `?${search}` : ''}`, {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
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

	function folderDepth(path: string): number {
		if (path === '/') return 0;
		return path.split('/').filter(Boolean).length;
	}

	function folderBrowseUrl(relPath: string): string | null {
		return cfExperienceCloudBrowseUrl(
			absoluteFolderPath(relPath, campaignsPath),
			aemAuthorUrl,
			cfEditorTenant
		);
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
				<span class="nav-link active">AEM Emails</span>
				<a href="/templates" class="nav-link">AJO Templates</a>
				<a href="/fragments" class="nav-link">AJO Fragments</a>
			</nav>
		</div>
	</header>

	<main>
		<div class="section-header">
			<h2>AEM Campaigns</h2>
		</div>

		{#if isLoading}
			<p class="status-message">Loading campaigns…</p>
		{:else if loadError}
			<p class="status-message error">{loadError}</p>
		{:else if campaigns.length === 0}
			<p class="status-message">No campaigns found in AEM.</p>
		{:else}
			<div class="content-layout">
				<aside class="folder-sidebar">
					<div class="sidebar-meta">
						<code>{currentFolderPath}</code>
						{#if folderBrowseUrl(currentFolder)}
							<a
								href={folderBrowseUrl(currentFolder)}
								target="_blank"
								rel="noopener noreferrer"
								class="cf-link"
							>
								CF Editor
							</a>
						{/if}
					</div>
					<div class="folder-list">
						{#each allFolders as folder (folder.path)}
							<button
								type="button"
								class="folder-item"
								class:active={folder.path === currentFolder}
								style={`--folder-depth:${folder.depth}`}
								onclick={() => navigateFolder(folder.path)}
							>
								<span class="folder-name">{folder.label}</span>
								<span class="folder-count">{folderCounts.get(folder.path) ?? 0}</span>
							</button>
						{/each}
					</div>
				</aside>

				<section class="cards-panel">
					<div class="panel-head">
						<input type="search" bind:value={filterQuery} placeholder="Filter emails..." />
					</div>

					{#if visibleCampaigns.length === 0}
						<p class="status-message">
							{filterQuery.trim()
								? 'No emails match your filter in this folder.'
								: 'No emails in this folder.'}
						</p>
					{:else}
						<div class="card-grid">
							{#each visibleCampaigns as campaign (campaign.id)}
								<a href="/editor/{campaign.id}" class="card">
									<div class="card-header">
										<div class="card-title-block">
											<h4>{campaign.name}</h4>
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
										</div>
										<span
											class="status-chip status-{campaign.status.replace('_', '-')}"
											title={displayStatusHint(campaign.status)}
										>
											<span class="status-dot" aria-hidden="true"></span>
											{displayStatusLabel(campaign.status)}
										</span>
									</div>
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
				</section>
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
		max-width: 1120px;
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
		max-width: 1120px;
		margin: 0 auto;
		padding: 48px 40px;
	}

	.section-header {
		margin-bottom: 8px;
	}

	.section-header h2 {
		font-size: 15px;
		font-weight: 600;
		color: #111;
		letter-spacing: -0.2px;
	}

	.status-message {
		font-size: 14px;
		color: #71717a;
	}

	.status-message.error {
		color: #b91c1c;
	}

	.content-layout {
		display: grid;
		grid-template-columns: minmax(300px, 340px) 1fr;
		gap: 28px;
		align-items: start;
	}

	.folder-sidebar {
		padding: 0 28px 0 0;
		position: sticky;
		top: 16px;
		border-right: 1px solid #ececf1;
	}

	.sidebar-meta {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
		margin-bottom: 14px;
	}

	.sidebar-meta code {
		font-size: 12px;
		line-height: 1.45;
		color: #52525b;
		word-break: break-all;
	}

	.folder-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 68vh;
		overflow: auto;
		padding-right: 2px;
	}

	.folder-item {
		font: inherit;
		font-size: 13px;
		color: #52525b;
		background: transparent;
		border: 0;
		border-radius: 4px;
		padding: 6px 0;
		padding-left: calc(var(--folder-depth) * 14px);
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		text-align: left;
		width: 100%;
	}

	.folder-item:hover {
		color: #111;
	}

	.folder-item.active {
		color: #111;
		font-weight: 600;
	}

	.folder-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.folder-count {
		font-size: 12px;
		color: #a1a1aa;
		flex-shrink: 0;
	}

	.folder-item.active .folder-count {
		color: #71717a;
	}

	.cards-panel {
		min-width: 0;
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		margin-bottom: 12px;
	}

	.cf-link {
		font-size: 12px;
		font-weight: 600;
		color: #5b5bd6;
		text-decoration: none;
		white-space: nowrap;
	}

	.cf-link:hover {
		text-decoration: underline;
	}

	.panel-head input {
		font: inherit;
		font-size: 12px;
		padding: 7px 9px;
		border: 1px solid #e4e4e7;
		border-radius: 7px;
		width: 100%;
		max-width: 280px;
	}

	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 10px;
	}

	@media (max-width: 720px) {
		.content-layout {
			grid-template-columns: 1fr;
		}

		.folder-sidebar {
			position: static;
		}
	}

	.card {
		background: #fff;
		border: 1px solid #f0f0f3;
		border-radius: 10px;
		padding: 16px;
		text-decoration: none;
		color: inherit;
		display: flex;
		flex-direction: column;
		gap: 8px;
		transition:
			background-color 0.12s,
			transform 0.12s;
	}

	.card:hover {
		background: #fcfcff;
		transform: translateY(-1px);
	}

	.card-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.card-title-block {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
	}

	.card-title-block h4 {
		font-size: 14px;
		font-weight: 600;
		color: #111;
		letter-spacing: -0.2px;
		line-height: 1.4;
		margin: 0;
		width: 100%;
	}

	.card-header .status-chip {
		flex-shrink: 0;
		margin-top: 1px;
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

	.card-author-link {
		font: inherit;
		font-size: 11px;
		font-weight: 500;
		color: #71717a;
		text-decoration: none;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: pointer;
	}

	.card-author-link:hover {
		color: #5b5bd6;
		text-decoration: underline;
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
