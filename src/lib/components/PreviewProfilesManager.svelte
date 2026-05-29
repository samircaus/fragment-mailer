<script lang="ts">
	import PreviewResourceManager from '$lib/components/PreviewResourceManager.svelte';
	import type { BrandListItem, PersonaListItem } from '$lib/personas/types.js';

	type ResourceItem = PersonaListItem | BrandListItem;
	type ManagerTab = 'persona' | 'brand';

	interface Props {
		open?: boolean;
		personas?: PersonaListItem[];
		brands?: BrandListItem[];
		selectedPersonaId?: string;
		selectedBrandId?: string;
		onclose?: () => void;
		onpersonaschange?: (detail: { items: ResourceItem[]; selectedId: string }) => void;
		onbrandschange?: (detail: { items: ResourceItem[]; selectedId: string }) => void;
	}

	let {
		open = false,
		personas = [],
		brands = [],
		selectedPersonaId = '',
		selectedBrandId = '',
		onclose,
		onpersonaschange,
		onbrandschange
	}: Props = $props();

	let activeTab = $state<ManagerTab>('persona');
	let wasOpen = false;

	$effect(() => {
		if (open && !wasOpen) activeTab = 'persona';
		wasOpen = open;
	});

	function closeDialog() {
		onclose?.();
	}
</script>

{#if open}
	<div class="profiles-layer" role="presentation">
		<button type="button" class="profiles-backdrop" aria-label="Close dialog" onclick={closeDialog}></button>
		<div
			class="profiles-dialog"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			aria-labelledby="profiles-manager-title"
		>
			<header class="profiles-header">
				<h2 id="profiles-manager-title" class="profiles-title">Manage preview data</h2>
				<button type="button" class="profiles-close" onclick={closeDialog} aria-label="Close">×</button>
			</header>

			<div class="profiles-tabs" role="tablist" aria-label="Preview data type">
				<button
					type="button"
					class="profiles-tab"
					class:active={activeTab === 'persona'}
					role="tab"
					aria-selected={activeTab === 'persona'}
					onclick={() => (activeTab = 'persona')}
				>
					Personas
				</button>
				<button
					type="button"
					class="profiles-tab"
					class:active={activeTab === 'brand'}
					role="tab"
					aria-selected={activeTab === 'brand'}
					onclick={() => (activeTab = 'brand')}
				>
					Brands
				</button>
			</div>

			{#key activeTab}
				{#if activeTab === 'persona'}
					<PreviewResourceManager
						embedded
						kind="persona"
						open={true}
						items={personas}
						selectedId={selectedPersonaId}
						onchange={onpersonaschange}
					/>
				{:else}
					<PreviewResourceManager
						embedded
						kind="brand"
						open={true}
						items={brands}
						selectedId={selectedBrandId}
						onchange={onbrandschange}
					/>
				{/if}
			{/key}
		</div>
	</div>
{/if}

<style>
	.profiles-layer {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
	}

	.profiles-backdrop {
		position: absolute;
		inset: 0;
		border: none;
		padding: 0;
		margin: 0;
		background: rgba(0, 0, 0, 0.4);
		cursor: default;
	}

	.profiles-dialog {
		position: relative;
		z-index: 1;
		width: min(760px, 100%);
		max-height: min(720px, 100%);
		background: #fff;
		border-radius: 12px;
		box-shadow: 0 20px 48px rgba(0, 0, 0, 0.18);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.profiles-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 16px 16px 12px;
		border-bottom: 1px solid #f4f4f5;
	}

	.profiles-title {
		font-size: 15px;
		font-weight: 600;
		color: #111;
		margin: 0;
	}

	.profiles-close {
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: #71717a;
		font-size: 20px;
		line-height: 1;
		cursor: pointer;
		flex-shrink: 0;
	}

	.profiles-close:hover {
		background: #f4f4f5;
		color: #111;
	}

	.profiles-tabs {
		display: flex;
		gap: 4px;
		padding: 10px 16px 0;
		border-bottom: 1px solid #f4f4f5;
	}

	.profiles-tab {
		padding: 8px 12px;
		border: none;
		border-bottom: 2px solid transparent;
		background: transparent;
		color: #71717a;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		margin-bottom: -1px;
	}

	.profiles-tab:hover {
		color: #3f3f46;
	}

	.profiles-tab.active {
		color: #5b5bd6;
		border-bottom-color: #5b5bd6;
	}
</style>
