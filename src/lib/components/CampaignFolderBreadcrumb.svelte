<script lang="ts">
	import { onMount } from 'svelte';
	import { cfExperienceCloudBrowseUrl } from '$lib/aem/author-links.js';
	import { displayStatusLabel } from '$lib/db/attach-email-status.js';
	import {
		absoluteFolderPath,
		buildBreadcrumbSegments,
		campaignsInFolder,
		collectAllFolderPaths,
		displayBreadcrumbParts,
		folderDisplayName,
		normalizePath,
		siblingFolderPaths,
		type BreadcrumbSegment
	} from '$lib/campaigns/folder-tree.js';

	export interface CampaignListItem {
		id: string;
		name: string;
		cfPath: string;
		status: string;
	}

	interface Props {
		campaigns: CampaignListItem[];
		campaignsPath: string;
		currentFolder: string;
		filterQuery?: string;
		aemAuthorUrl?: string | null;
		cfEditorTenant?: string;
		onNavigate: (relPath: string) => void;
		onFilterChange?: (query: string) => void;
	}

	let {
		campaigns,
		campaignsPath,
		currentFolder,
		filterQuery = '',
		aemAuthorUrl = null,
		cfEditorTenant = 'psc',
		onNavigate,
		onFilterChange
	}: Props = $props();

	let openMenuKey = $state<string | null>(null);
	let ellipsisOpen = $state(false);
	let menuFilter = $state('');

	const normalizedBase = $derived(normalizePath(campaignsPath));
	const allFolderPaths = $derived(collectAllFolderPaths(campaigns, normalizedBase));
	const segments = $derived(buildBreadcrumbSegments(currentFolder, campaignsPath));
	const displayParts = $derived(displayBreadcrumbParts(segments));
	const isLastSegment = (segmentIndex: number) => segmentIndex === segments.length - 1;

	function menuKey(segmentIndex: number): string {
		return `seg-${segmentIndex}`;
	}

	function toggleMenu(segmentIndex: number, event: MouseEvent) {
		event.stopPropagation();
		const key = menuKey(segmentIndex);
		if (openMenuKey === key) {
			closeMenus();
			return;
		}
		ellipsisOpen = false;
		openMenuKey = key;
		menuFilter = isLastSegment(segmentIndex) ? filterQuery : '';
	}

	function toggleEllipsis(event: MouseEvent) {
		event.stopPropagation();
		openMenuKey = null;
		ellipsisOpen = !ellipsisOpen;
	}

	function closeMenus() {
		openMenuKey = null;
		ellipsisOpen = false;
	}

	function navigateTo(relPath: string) {
		closeMenus();
		onNavigate(relPath);
	}

	function applyMenuFilter(value: string) {
		menuFilter = value;
		onFilterChange?.(value);
	}

	function foldersForSegment(segment: BreadcrumbSegment): string[] {
		return siblingFolderPaths(segment.relPath, allFolderPaths);
	}

	function itemsForSegment(segment: BreadcrumbSegment): CampaignListItem[] {
		return campaignsInFolder(campaigns, segment.relPath, normalizedBase).sort((a, b) =>
			a.name.localeCompare(b.name)
		);
	}

	function cfEditorUrl(relPath: string): string | null {
		return cfExperienceCloudBrowseUrl(
			absoluteFolderPath(relPath, normalizedBase),
			aemAuthorUrl,
			cfEditorTenant
		);
	}

	function handleDocumentClick(event: MouseEvent) {
		const target = event.target as HTMLElement | null;
		if (!target?.closest('.breadcrumb-root')) closeMenus();
	}

	onMount(() => {
		document.addEventListener('click', handleDocumentClick);
		return () => document.removeEventListener('click', handleDocumentClick);
	});
</script>

{#snippet folderIcon()}
	<svg class="icon folder-icon" viewBox="0 0 16 16" aria-hidden="true">
		<path
			d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.879a1.5 1.5 0 0 1 1.06.44L8.5 5h4A1.5 1.5 0 0 1 14 6.5v5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7Z"
			fill="currentColor"
			opacity="0.9"
		/>
	</svg>
{/snippet}

{#snippet emailIcon()}
	<svg class="icon email-icon" viewBox="0 0 16 16" aria-hidden="true">
		<path
			d="M2.5 4.5A1.5 1.5 0 0 1 4 3h8a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 12 13H4a1.5 1.5 0 0 1-1.5-1.5v-7Zm1.2.75 4.3 3.01 4.3-3.01H3.7Z"
			fill="currentColor"
		/>
	</svg>
{/snippet}

{#snippet splitDropdown(segment: BreadcrumbSegment, segmentIndex: number)}
	{@const folders = foldersForSegment(segment)}
	{@const items = itemsForSegment(segment)}
	{@const isCurrent = isLastSegment(segmentIndex)}
	<div class="dropdown-panel" role="menu">
		{#if isCurrent && onFilterChange}
			<div class="dropdown-filter">
				<input
					type="search"
					placeholder="Filter emails in this folder…"
					value={menuFilter}
					oninput={(e) => applyMenuFilter(e.currentTarget.value)}
					onclick={(e) => e.stopPropagation()}
				/>
			</div>
		{/if}
		<div class="dropdown-columns">
			<div class="dropdown-col">
				<p class="col-label">Folders</p>
				<ul class="dropdown-list">
					{#if folders.length === 0}
						<li class="dropdown-empty">No subfolders</li>
					{:else}
						{#each folders as folderPath (folderPath)}
							<li>
								<button
									type="button"
									class="dropdown-row"
									onclick={() => navigateTo(folderPath)}
								>
									{@render folderIcon()}
									<span>{folderDisplayName(folderPath, campaignsPath)}</span>
								</button>
							</li>
						{/each}
					{/if}
				</ul>
			</div>
			<div class="dropdown-col">
				<p class="col-label">Emails</p>
				<ul class="dropdown-list">
					{#if items.length === 0}
						<li class="dropdown-empty">No emails here</li>
					{:else}
						{#each items as item (item.id)}
							<li>
								<a href="/editor/{item.id}" class="dropdown-row item-row" onclick={() => closeMenus()}>
									{@render emailIcon()}
									<span class="item-name">{item.name}</span>
									<span class="item-status">{displayStatusLabel(item.status)}</span>
								</a>
							</li>
						{/each}
					{/if}
				</ul>
			</div>
		</div>
		{#if cfEditorUrl(segment.relPath)}
			<div class="dropdown-footer">
				<a
					href={cfEditorUrl(segment.relPath)}
					target="_blank"
					rel="noopener noreferrer"
					class="cf-editor-link"
					onclick={(e) => e.stopPropagation()}
				>
					CF Editor
				</a>
			</div>
		{/if}
	</div>
{/snippet}

<nav class="breadcrumb-root" aria-label="Campaign folder">
	<ol class="breadcrumb">
		{#each displayParts as part (part.type === 'ellipsis' ? 'ellipsis' : part.segment.relPath)}
			<li class="crumb-wrap">
				{#if part.type === 'ellipsis'}
					<div class="crumb-group ellipsis-group">
						<button
							type="button"
							class="crumb-btn ellipsis-btn"
							aria-expanded={ellipsisOpen}
							aria-haspopup="true"
							onclick={toggleEllipsis}
						>
							…
						</button>
						<button
							type="button"
							class="menu-trigger"
							aria-label="Show skipped folders"
							aria-expanded={ellipsisOpen}
							onclick={toggleEllipsis}
						>
							▾
						</button>
						{#if ellipsisOpen}
							<div class="dropdown-panel ellipsis-panel" role="menu">
								<ul class="dropdown-list">
									{#each part.skipped as skipped (skipped.relPath)}
										<li>
											<button
												type="button"
												class="dropdown-row"
												onclick={() => navigateTo(skipped.relPath)}
											>
												{@render folderIcon()}
												<span>{skipped.label}</span>
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>
				{:else}
					{@const segment = part.segment}
					{@const segmentIndex = part.segmentIndex}
					{@const isCurrent = isLastSegment(segmentIndex)}
					{@const menuOpen = openMenuKey === menuKey(segmentIndex)}
					<div class="crumb-group" class:is-current={isCurrent}>
						<button
							type="button"
							class="crumb-btn"
							class:current={isCurrent}
							onclick={() => navigateTo(segment.relPath)}
						>
							{segment.label}
						</button>
						<button
							type="button"
							class="menu-trigger"
							aria-label="Browse {segment.label}"
							aria-expanded={menuOpen}
							aria-haspopup="true"
							onclick={(e) => toggleMenu(segmentIndex, e)}
						>
							▾
						</button>
						{#if menuOpen}
							{@render splitDropdown(segment, segmentIndex)}
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ol>
</nav>

<style>
	.breadcrumb-root {
		position: relative;
		margin-bottom: 28px;
	}

	.breadcrumb {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.crumb-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}

	.crumb-group {
		display: flex;
		align-items: center;
		gap: 2px;
		position: relative;
	}

	.crumb-btn {
		font: inherit;
		font-size: 20px;
		font-weight: 600;
		letter-spacing: -0.35px;
		color: #3f3f46;
		background: transparent;
		border: none;
		padding: 6px 4px;
		border-radius: 6px;
		cursor: pointer;
		line-height: 1.2;
	}

	.crumb-btn:hover {
		color: #111;
		background: #f4f4f5;
	}

	.crumb-btn.current {
		color: #111;
	}

	.ellipsis-btn {
		padding: 6px 8px;
	}

	.menu-trigger {
		font: inherit;
		font-size: 16px;
		line-height: 1;
		color: #5b5bd6;
		background: transparent;
		border: none;
		padding: 8px 2px;
		border-radius: 6px;
		cursor: pointer;
	}

	.menu-trigger:hover {
		color: #4f46e5;
		background: transparent;
	}

	.crumb-group.is-current .menu-trigger {
		color: #5b5bd6;
	}

	.crumb-group.is-current .dropdown-panel {
		left: auto;
		right: 0;
	}

	.dropdown-panel {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		z-index: 50;
		min-width: 420px;
		max-width: min(560px, 92vw);
		background: #fff;
		border: 1px solid #e4e4e7;
		border-radius: 12px;
		box-shadow:
			0 12px 40px rgba(0, 0, 0, 0.1),
			0 2px 8px rgba(0, 0, 0, 0.04);
		padding: 12px;
	}

	.ellipsis-panel {
		min-width: 220px;
	}

	.dropdown-filter {
		margin-bottom: 10px;
		padding-bottom: 10px;
		border-bottom: 1px solid #f0f0f3;
	}

	.dropdown-filter input {
		width: 100%;
		font: inherit;
		font-size: 13px;
		padding: 8px 10px;
		border: 1px solid #e4e4e7;
		border-radius: 8px;
	}

	.dropdown-filter input:focus {
		outline: none;
		border-color: #a5a5f0;
		box-shadow: 0 0 0 3px rgba(91, 91, 214, 0.12);
	}

	.dropdown-columns {
		display: grid;
		grid-template-columns: 1fr 1.2fr;
		gap: 12px;
	}

	.col-label {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #a1a1aa;
		margin: 0 0 8px 4px;
	}

	.dropdown-list {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 240px;
		overflow-y: auto;
	}

	.dropdown-row {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		font: inherit;
		font-size: 13px;
		text-align: left;
		color: #27272a;
		background: transparent;
		border: none;
		border-radius: 8px;
		padding: 8px 10px;
		cursor: pointer;
		text-decoration: none;
	}

	.dropdown-row:hover {
		background: #f4f4f5;
	}

	.item-row {
		justify-content: flex-start;
	}

	.item-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item-status {
		font-size: 11px;
		font-weight: 600;
		color: #71717a;
		flex-shrink: 0;
	}

	.dropdown-empty {
		font-size: 12px;
		color: #a1a1aa;
		padding: 8px 10px;
	}

	.dropdown-footer {
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid #f0f0f3;
	}

	.cf-editor-link {
		font-size: 12px;
		font-weight: 600;
		color: #5b5bd6;
		text-decoration: none;
	}

	.cf-editor-link:hover {
		text-decoration: underline;
	}

	.icon {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}

	.folder-icon {
		color: #eab308;
	}

	.email-icon {
		color: #5b5bd6;
	}
</style>
