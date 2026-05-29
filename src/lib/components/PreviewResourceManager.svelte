<script lang="ts">
	import { validateBrandData } from '$lib/brands/validate.js';
	import { validatePersonaData } from '$lib/personas/validate.js';
	import type { BrandListItem, PersonaListItem } from '$lib/personas/types.js';

	type ResourceKind = 'persona' | 'brand';
	type ResourceItem = PersonaListItem | BrandListItem;

	interface Props {
		kind: ResourceKind;
		open?: boolean;
		embedded?: boolean;
		items?: ResourceItem[];
		selectedId?: string;
		onclose?: () => void;
		onchange?: (detail: { items: ResourceItem[]; selectedId: string }) => void;
	}

	let {
		kind,
		open = false,
		embedded = false,
		items = [],
		selectedId = '',
		onclose,
		onchange
	}: Props = $props();

	const titles = {
		persona: {
			heading: 'Manage personas',
			subtitle: 'Profile fields used for {{profile.*}} preview tokens',
			idLabel: 'Persona id',
			newLabel: 'New persona',
			deleteConfirm: (label: string) => `Delete persona "${label}"? This cannot be undone.`
		},
		brand: {
			heading: 'Manage brands',
			subtitle: 'Values used for {{static.companyName}} and related preview tokens',
			idLabel: 'Brand id',
			newLabel: 'New brand',
			deleteConfirm: (label: string) => `Delete brand "${label}"? This cannot be undone.`
		}
	} as const;

	const defaultJson = {
		persona: JSON.stringify(
			{
				label: 'New persona',
				person: {
					name: { firstName: 'Alex', lastName: '' },
					email: 'alex@example.com'
				}
			},
			null,
			2
		),
		brand: JSON.stringify(
			{
				label: 'New brand',
				name: 'New Brand'
			},
			null,
			2
		)
	} as const;

	let localItems = $state<ResourceItem[]>([]);
	let activeId = $state('');
	let draftId = $state('');
	let editJson = $state('');
	let error = $state('');
	let saving = $state(false);
	let deleting = $state(false);
	let isNew = $state(false);

	const copy = $derived(titles[kind]);
	const activeItem = $derived(localItems.find((item) => item.id === activeId) ?? null);
	const canDelete = $derived(
		Boolean(activeItem && !activeItem.isBuiltin && localItems.length > 1 && !isNew)
	);

	function applySelection(nextItems: ResourceItem[], id: string, resetNew = false) {
		if (!id) {
			activeId = '';
			draftId = '';
			editJson = '';
			isNew = false;
			error = '';
			return;
		}

		const item = nextItems.find((entry) => entry.id === id);
		if (!item) return;

		activeId = id;
		draftId = id;
		isNew = resetNew;
		error = '';
		const { id: _id, isBuiltin: _builtin, ...editable } = item;
		editJson = JSON.stringify(editable, null, 2);
	}

	function syncFromProps() {
		const nextItems = items.map((item) => ({ ...item }));
		localItems = nextItems;
		const initialId =
			selectedId && nextItems.some((item) => item.id === selectedId)
				? selectedId
				: (nextItems[0]?.id ?? '');
		applySelection(nextItems, initialId, false);
	}

	let lastSyncKey = '';

	$effect(() => {
		if (!open && !embedded) {
			lastSyncKey = '';
			return;
		}

		const syncKey = `${kind}:${selectedId}:${items.map((item) => item.id).join('|')}`;
		if (syncKey === lastSyncKey) return;
		lastSyncKey = syncKey;

		syncFromProps();
	});

	function selectItem(id: string, resetNew = false) {
		applySelection(localItems, id, resetNew);
	}

	function startNewItem() {
		const baseId = kind === 'persona' ? 'persona' : 'brand';
		let n = localItems.length + 1;
		let nextId = `${baseId}-${n}`;
		while (localItems.some((item) => item.id === nextId)) {
			n += 1;
			nextId = `${baseId}-${n}`;
		}

		isNew = true;
		activeId = '';
		draftId = nextId;
		editJson = defaultJson[kind];
		error = '';
	}

	function closeDialog() {
		onclose?.();
	}

	function emitChange(nextItems: ResourceItem[], nextSelectedId: string) {
		onchange?.({ items: nextItems, selectedId: nextSelectedId });
	}

	function parseJson(): unknown | null {
		try {
			return JSON.parse(editJson);
		} catch {
			error = 'Invalid JSON syntax';
			return null;
		}
	}

	function validateDraft(parsed: unknown, id: string) {
		return kind === 'persona'
			? validatePersonaData(parsed, id)
			: validateBrandData(parsed, id);
	}

	async function saveItem() {
		error = '';
		const id = draftId.trim();
		if (!id) {
			error = `${copy.idLabel} is required`;
			return;
		}

		const parsed = parseJson();
		if (parsed === null) return;

		const result = validateDraft(parsed, id);
		if (!result.ok) {
			error = result.error;
			return;
		}

		saving = true;
		try {
			if (isNew) {
				const createBody =
					kind === 'persona'
						? {
								id,
								label: (result as { ok: true; persona: PersonaListItem }).persona.label,
								person: (result as { ok: true; persona: PersonaListItem }).persona.person,
								loyalty: (result as { ok: true; persona: PersonaListItem }).persona.loyalty
							}
						: {
								id,
								label: (result as { ok: true; brand: BrandListItem }).brand.label,
								name: (result as { ok: true; brand: BrandListItem }).brand.name,
								logoUrl: (result as { ok: true; brand: BrandListItem }).brand.logoUrl,
								privacyUrl: (result as { ok: true; brand: BrandListItem }).brand.privacyUrl
							};

				const res = await fetch(`/api/${kind === 'persona' ? 'personas' : 'brands'}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(createBody)
				});
				const data = (await res.json().catch(() => ({}))) as {
					persona?: PersonaListItem;
					brand?: BrandListItem;
					message?: string;
				};
				if (!res.ok) throw new Error(data.message ?? `Create failed (${res.status})`);

				const created = (kind === 'persona' ? data.persona : data.brand) as ResourceItem | undefined;
				if (!created) throw new Error('Create failed');

				localItems = [...localItems, created].sort((a, b) => a.label.localeCompare(b.label));
				isNew = false;
				activeId = created.id;
				draftId = created.id;
				emitChange(localItems, created.id);
				return;
			}

			const updateBody =
				kind === 'persona'
					? {
							label: (result as { ok: true; persona: PersonaListItem }).persona.label,
							person: (result as { ok: true; persona: PersonaListItem }).persona.person,
							loyalty: (result as { ok: true; persona: PersonaListItem }).persona.loyalty
						}
					: {
							label: (result as { ok: true; brand: BrandListItem }).brand.label,
							name: (result as { ok: true; brand: BrandListItem }).brand.name,
							logoUrl: (result as { ok: true; brand: BrandListItem }).brand.logoUrl,
							privacyUrl: (result as { ok: true; brand: BrandListItem }).brand.privacyUrl
						};

			const res = await fetch(
				`/api/${kind === 'persona' ? 'personas' : 'brands'}/${encodeURIComponent(activeId)}`,
				{
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(updateBody)
				}
			);
			const data = (await res.json().catch(() => ({}))) as {
				persona?: PersonaListItem;
				brand?: BrandListItem;
				message?: string;
			};
			if (!res.ok) throw new Error(data.message ?? `Save failed (${res.status})`);

			const savedRaw = kind === 'persona' ? data.persona : data.brand;
			const validated =
				kind === 'persona'
					? (result as { ok: true; persona: PersonaListItem }).persona
					: (result as { ok: true; brand: BrandListItem }).brand;
			const saved: ResourceItem = savedRaw
				? { ...savedRaw, isBuiltin: activeItem?.isBuiltin ?? false }
				: { ...validated, isBuiltin: activeItem?.isBuiltin ?? false };

			localItems = localItems
				.map((item) => (item.id === activeId ? saved : item))
				.sort((a, b) => a.label.localeCompare(b.label));
			selectItem(activeId, false);
			emitChange(localItems, activeId);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Save failed';
		} finally {
			saving = false;
		}
	}

	async function deleteItem() {
		if (!activeItem || !canDelete) return;
		if (!confirm(copy.deleteConfirm(activeItem.label))) return;

		deleting = true;
		error = '';
		try {
			const res = await fetch(
				`/api/${kind === 'persona' ? 'personas' : 'brands'}/${encodeURIComponent(activeItem.id)}`,
				{ method: 'DELETE' }
			);
			const data = (await res.json().catch(() => ({}))) as { message?: string };
			if (!res.ok) throw new Error(data.message ?? `Delete failed (${res.status})`);

			localItems = localItems.filter((item) => item.id !== activeItem.id);
			const nextId = localItems[0]?.id ?? '';
			selectItem(nextId, false);
			emitChange(localItems, nextId);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Delete failed';
		} finally {
			deleting = false;
		}
	}

	function itemSubtitle(item: ResourceItem): string {
		if (kind === 'persona') {
			const persona = item as PersonaListItem;
			return persona.person.name.firstName;
		}
		return (item as BrandListItem).name;
	}
</script>

{#snippet managerPanel()}
	<div class="manager-body">
		<aside class="manager-sidebar">
			<button type="button" class="manager-add-btn" onclick={startNewItem}>+ {copy.newLabel}</button>
			<ul class="manager-list" role="listbox" aria-label={copy.heading}>
				{#each localItems as item (item.id)}
					<li role="none">
						<button
							type="button"
							class="manager-list-item"
							class:selected={!isNew && activeId === item.id}
							role="option"
							aria-selected={!isNew && activeId === item.id}
							onclick={() => selectItem(item.id)}
						>
							<span class="manager-list-label">{item.label}</span>
							<span class="manager-list-meta">{itemSubtitle(item)}</span>
						</button>
					</li>
				{/each}
				{#if isNew}
					<li role="none">
						<div class="manager-list-item selected draft" role="option" aria-selected="true">
							<span class="manager-list-label">{copy.newLabel}</span>
							<span class="manager-list-meta">{draftId || 'unsaved'}</span>
						</div>
					</li>
				{/if}
			</ul>
		</aside>

		<div class="manager-editor">
			<label class="manager-field">
				<span class="manager-field-label">{copy.idLabel}</span>
				<input
					class="manager-id-input"
					value={draftId}
					disabled={!isNew}
					oninput={(e) => {
						draftId = e.currentTarget.value;
					}}
					spellcheck={false}
					autocomplete="off"
				/>
			</label>

			<textarea
				class="manager-json-editor"
				bind:value={editJson}
				spellcheck={false}
				autocomplete="off"
				autocapitalize="off"
			></textarea>
		</div>
	</div>

	{#if error}
		<div class="manager-error">{error}</div>
	{/if}

	<footer class="manager-footer">
		<button
			type="button"
			class="manager-delete-btn"
			disabled={!canDelete || deleting || saving}
			title={canDelete
				? 'Remove this item permanently'
				: activeItem?.isBuiltin
					? 'Built-in items cannot be deleted'
					: 'Keep at least one item'}
			onclick={deleteItem}
		>
			{deleting ? 'Deleting…' : 'Delete'}
		</button>
		<div class="manager-footer-actions">
			{#if !embedded}
				<button type="button" class="btn-cancel" onclick={closeDialog}>Cancel</button>
			{/if}
			<button type="button" class="btn-create" onclick={saveItem} disabled={saving || deleting}>
				{saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
			</button>
		</div>
	</footer>
{/snippet}

{#if embedded && open}
	<div class="manager-embedded">
		{@render managerPanel()}
	</div>
{:else if open}
	<div class="manager-layer" role="presentation">
		<button type="button" class="manager-backdrop" aria-label="Close dialog" onclick={closeDialog}></button>
		<div
			class="manager-dialog"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			aria-labelledby="resource-manager-title"
		>
			<header class="manager-header">
				<div>
					<h2 id="resource-manager-title" class="manager-title">{copy.heading}</h2>
					<p class="manager-subtitle">
						{copy.subtitle}
					</p>
				</div>
				<button type="button" class="manager-close" onclick={closeDialog} aria-label="Close">×</button>
			</header>

			{@render managerPanel()}
		</div>
	</div>
{/if}

<style>
	.manager-layer {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
	}

	.manager-backdrop {
		position: absolute;
		inset: 0;
		border: none;
		padding: 0;
		margin: 0;
		background: rgba(0, 0, 0, 0.4);
		cursor: default;
	}

	.manager-dialog {
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

	.manager-embedded {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.manager-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 16px 16px 12px;
		border-bottom: 1px solid #f4f4f5;
	}

	.manager-title {
		font-size: 15px;
		font-weight: 600;
		color: #111;
		margin: 0;
	}

	.manager-subtitle {
		font-size: 12px;
		color: #71717a;
		margin: 4px 0 0;
	}

	.manager-close {
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

	.manager-close:hover {
		background: #f4f4f5;
		color: #111;
	}

	.manager-body {
		display: grid;
		grid-template-columns: minmax(180px, 220px) minmax(0, 1fr);
		min-height: 360px;
		flex: 1;
		overflow: hidden;
	}

	.manager-sidebar {
		display: flex;
		flex-direction: column;
		border-right: 1px solid #f4f4f5;
		background: #fafafa;
		min-height: 0;
	}

	.manager-add-btn {
		margin: 10px;
		padding: 7px 10px;
		border: 1px dashed #d4d4d8;
		border-radius: 6px;
		background: #fff;
		color: #52525b;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
	}

	.manager-add-btn:hover {
		border-color: #5b5bd6;
		color: #5b5bd6;
		background: #fafafe;
	}

	.manager-list {
		list-style: none;
		margin: 0;
		padding: 0 8px 10px;
		overflow-y: auto;
		flex: 1;
	}

	.manager-list-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		padding: 8px 10px;
		border: none;
		border-radius: 6px;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}

	.manager-list-item:hover:not(.draft) {
		background: #f4f4f5;
	}

	.manager-list-item.selected {
		background: #ededfc;
	}

	.manager-list-item.draft {
		cursor: default;
	}

	.manager-list-label {
		font-size: 12px;
		font-weight: 500;
		color: #18181b;
		line-height: 1.3;
	}

	.manager-list-meta {
		font-size: 11px;
		color: #a1a1aa;
	}

	.manager-editor {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}

	.manager-field {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		border-bottom: 1px solid #f4f4f5;
	}

	.manager-field-label {
		font-size: 11px;
		font-weight: 600;
		color: #71717a;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	.manager-id-input {
		flex: 1;
		min-width: 0;
		height: 28px;
		padding: 0 8px;
		border: 1px solid #e4e4e7;
		border-radius: 5px;
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 12px;
		outline: none;
	}

	.manager-id-input:focus {
		border-color: #5b5bd6;
	}

	.manager-id-input:disabled {
		background: #f4f4f5;
		color: #71717a;
	}

	.manager-json-editor {
		flex: 1;
		min-height: 280px;
		margin: 0;
		padding: 14px 16px;
		border: none;
		outline: none;
		resize: none;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 12px;
		line-height: 1.6;
		color: #1a1a1a;
		background: #fafafa;
		tab-size: 2;
	}

	.manager-error {
		padding: 8px 16px;
		font-size: 12px;
		color: #dc2626;
		background: #fef2f2;
		border-top: 1px solid #fecaca;
	}

	.manager-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 12px 16px;
		background: #fafafa;
		border-top: 1px solid #f4f4f5;
	}

	.manager-footer-actions {
		display: flex;
		gap: 8px;
	}

	.manager-delete-btn {
		border: none;
		background: transparent;
		color: #dc2626;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		padding: 6px 8px;
		border-radius: 6px;
	}

	.manager-delete-btn:hover:not(:disabled) {
		background: #fef2f2;
	}

	.manager-delete-btn:disabled {
		color: #d4d4d8;
		cursor: default;
	}

	:global(.btn-cancel) {
		height: 30px;
		padding: 0 12px;
		border: 1px solid #e4e4e7;
		border-radius: 6px;
		background: #fff;
		color: #52525b;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
	}

	:global(.btn-create) {
		height: 30px;
		padding: 0 12px;
		border: none;
		border-radius: 6px;
		background: #5b5bd6;
		color: #fff;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
	}

	:global(.btn-create:disabled) {
		opacity: 0.55;
		cursor: default;
	}
</style>
