<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { AjoExpressionFragmentDetail, AjoFragmentReferences } from '$lib/ajo/fragment-types.js';
	import MjmlEditorPanel from '$lib/components/MjmlEditorPanel.svelte';

	interface Props {
		fragmentId: string;
	}

	let { fragmentId }: Props = $props();

	const LEFT_PANEL_WIDTH_KEY = 'fragment-editor-left-panel-width';

	let fragment = $state<AjoExpressionFragmentDetail | null>(null);
	let references = $state<AjoFragmentReferences>({ count: 0, items: [] });
	let mjmlCode = $state('');
	let etag = $state<string | undefined>();
	let isLoading = $state(true);
	let isSaving = $state(false);
	let loadError = $state('');
	let saveError = $state('');
	let saveSuccess = $state('');
	let isLocalDraft = $state(false);
	let isDirty = $state(false);
	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');

	let leftPanelWidth = $state(480);
	let isResizingPanel = $state(false);
	let previewHtml = $state('');
	let previewStatus = $state<'idle' | 'loading' | 'error'>('idle');
	let previewError = $state('');
	let previewRequestId = 0;

	function clampLeftPanelWidth(width: number): number {
		return Math.max(320, Math.min(width, 900));
	}

	onMount(() => {
		const stored = localStorage.getItem(LEFT_PANEL_WIDTH_KEY);
		if (stored) {
			const parsed = Number.parseInt(stored, 10);
			if (!Number.isNaN(parsed)) {
				leftPanelWidth = clampLeftPanelWidth(parsed);
			}
		}
	});

	$effect(() => {
		const id = fragmentId;
		if (!id) return;
		void loadFragment(id);
	});

	async function loadFragment(id = fragmentId) {
		isLoading = true;
		loadError = '';
		try {
			const res = await fetch(`/api/ajo/fragments/${encodeURIComponent(id)}`);
			if (!res.ok) {
				let detail = '';
				const contentType = res.headers.get('content-type') ?? '';
				if (contentType.includes('json')) {
					try {
						const body = (await res.json()) as { message?: string };
						detail = body.message ?? '';
					} catch {
						// ignore
					}
				} else {
					detail = (await res.text()).trim();
				}
				throw new Error(detail || `Failed to load fragment (${res.status})`);
			}
			const data = (await res.json()) as {
				fragment: AjoExpressionFragmentDetail;
				references: AjoFragmentReferences;
				isLocalDraft?: boolean;
			};
			fragment = {
				...data.fragment,
				description: data.fragment.description ?? ''
			};
			references = data.references ?? { count: 0, items: [] };
			isLocalDraft = Boolean(data.isLocalDraft);
			mjmlCode = data.fragment.fragment?.expression ?? '';
			etag = data.fragment.etag;
			isDirty = false;
			saveStatus = 'idle';
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load fragment';
		} finally {
			isLoading = false;
		}
	}

	async function compileMjmlClient(mjml: string): Promise<string> {
		const res = await fetch('/api/compile/standalone', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mjml, personaId: 'persona-1' })
		});
		const data = (await res.json()) as {
			html?: string | null;
			errors?: Array<{ message: string }>;
			message?: string;
		};
		if (!res.ok || !data.html) {
			const details = Array.isArray(data.errors)
				? data.errors.map((e) => e.message).join('; ')
				: (data.message ?? `Compile failed: ${res.status}`);
			throw new Error(details);
		}
		return data.html;
	}

	$effect(() => {
		const mjml = mjmlCode;
		if (!mjml.trim() || isLoading) {
			previewHtml = '';
			return;
		}

		previewStatus = 'loading';
		previewError = '';

		const timer = setTimeout(() => {
			const requestId = ++previewRequestId;
			void (async () => {
				try {
					const html = await compileMjmlClient(mjml);
					if (requestId !== previewRequestId) return;
					previewHtml = html;
					previewStatus = 'idle';
					previewError = '';
				} catch (e) {
					if (requestId !== previewRequestId) return;
					previewHtml = '';
					previewError = e instanceof Error ? e.message : 'Preview failed';
					previewStatus = 'error';
				}
			})();
		}, 500);

		return () => clearTimeout(timer);
	});

	function validateMetadata(): boolean {
		if (!fragment) return false;
		const name = fragment.name.trim();
		if (!name) {
			saveError = 'Name is required.';
			return false;
		}
		fragment.name = name;
		return true;
	}

	async function saveFragment() {
		if (!fragment || !validateMetadata()) return;
		isSaving = true;
		saveError = '';
		saveSuccess = '';
		saveStatus = 'saving';
		try {
			const res = await fetch(`/api/ajo/fragments/${encodeURIComponent(fragmentId)}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					expression: mjmlCode,
					name: fragment.name,
					description: fragment.description,
					subType: fragment.subType ?? 'HTML',
					etag,
					publish: !isLocalDraft,
					syncToAjo: false
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
				throw new Error(detail || `Save failed (${res.status})`);
			}
			saveSuccess = isLocalDraft ? 'Draft saved locally.' : 'Saved and published to AJO.';
			isDirty = false;
			saveStatus = 'saved';
			await loadFragment(fragmentId);
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Save failed';
			saveStatus = 'error';
		} finally {
			isSaving = false;
		}
	}

	async function syncToAjo() {
		if (!fragment || !isLocalDraft || !validateMetadata()) return;
		isSaving = true;
		saveError = '';
		saveSuccess = '';
		try {
			const res = await fetch(`/api/ajo/fragments/${encodeURIComponent(fragmentId)}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					expression: mjmlCode,
					name: fragment.name,
					description: fragment.description,
					subType: fragment.subType ?? 'HTML',
					publish: true,
					syncToAjo: true
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
				throw new Error(detail || `Sync failed (${res.status})`);
			}
			const data = (await res.json()) as { newFragmentId?: string };
			if (!data.newFragmentId) {
				throw new Error('AJO did not return a new fragment ID');
			}
			await goto(`/fragments/${encodeURIComponent(data.newFragmentId)}`);
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Sync failed';
		} finally {
			isSaving = false;
		}
	}

	function startPanelResize(e: MouseEvent) {
		e.preventDefault();
		const startX = e.clientX;
		const startWidth = leftPanelWidth;
		isResizingPanel = true;

		function onMove(moveEvent: MouseEvent) {
			leftPanelWidth = clampLeftPanelWidth(startWidth + (moveEvent.clientX - startX));
		}

		function onUp() {
			isResizingPanel = false;
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
			localStorage.setItem(LEFT_PANEL_WIDTH_KEY, String(leftPanelWidth));
		}

		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	function statusLabel(status: string): string {
		switch (status) {
			case 'PUBLISHED':
				return 'Live';
			case 'PUBLISHING':
				return 'Publishing';
			default:
				return 'Draft';
		}
	}
</script>

<div class="editor-layout">
	<header class="topbar">
		<a href="/fragments" class="back-link">
			<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
				<path
					d="M9 11L5 7l4-4"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			Fragments
		</a>
		<div class="topbar-divider"></div>
		<div class="topbar-title">{fragment?.name ?? 'Fragment'}</div>
		<div class="topbar-spacer"></div>
		{#if fragment}
			<span class="status-chip status-{fragment.status.toLowerCase()}">{statusLabel(fragment.status)}</span>
			{#if isLocalDraft}
				<button type="button" class="topbar-btn" onclick={() => syncToAjo()} disabled={isSaving}>
					{isSaving ? 'Syncing…' : 'Sync to AJO'}
				</button>
			{/if}
		{/if}
	</header>

	{#if isLoading}
		<div class="loading-state">Loading fragment…</div>
	{:else if loadError}
		<div class="loading-state error">{loadError}</div>
	{:else if fragment}
		{#if saveError}
			<p class="banner error">{saveError}</p>
		{:else if saveSuccess}
			<p class="banner success">{saveSuccess}</p>
		{/if}

		<div class="meta-bar">
			<div class="meta-field">
				<label for="fragment-name">Name</label>
				<input
					id="fragment-name"
					type="text"
					bind:value={fragment.name}
					maxlength="120"
					oninput={() => (isDirty = true)}
				/>
			</div>
			<div class="meta-field meta-field-grow">
				<label for="fragment-description">Description</label>
				<input
					id="fragment-description"
					type="text"
					bind:value={fragment.description}
					maxlength="600"
					placeholder="What this fragment is for"
					oninput={() => (isDirty = true)}
				/>
			</div>
			{#if !isLocalDraft}
				<span class="usage-hint">
					Used by {references.count} campaign{references.count === 1 ? '' : 's'}
				</span>
			{:else}
				<span class="usage-hint draft">Local draft · not in AJO yet</span>
			{/if}
		</div>

		<div class="panels" class:resizing={isResizingPanel}>
			<aside class="left-panel" style:width={`${leftPanelWidth}px`}>
				<MjmlEditorPanel
					bind:value={mjmlCode}
					bind:isDirty
					compileHtml={compileMjmlClient}
					onsave={saveFragment}
					saveLabel={isLocalDraft ? 'Save draft' : 'Save & publish'}
					saveDisabled={isSaving}
					{saveStatus}
				/>
			</aside>

			<button
				type="button"
				class="panel-resize-handle"
				aria-label="Resize editor panel"
				onmousedown={startPanelResize}
			></button>

			<main class="preview-area">
				<header class="preview-toolbar">
					<span class="preview-label">Preview</span>
					<span class="preview-hint">Compiled MJML · default persona</span>
				</header>
				<div class="preview-frame-wrap">
					{#if !mjmlCode.trim()}
						<p class="preview-empty">Add MJML to see a preview</p>
					{:else if previewStatus === 'loading' && !previewHtml}
						<p class="preview-empty">Compiling…</p>
					{:else if previewStatus === 'error'}
						<p class="preview-error">{previewError}</p>
					{:else if previewHtml}
						<iframe
							title="Fragment preview"
							class="preview-iframe"
							sandbox="allow-same-origin"
							srcdoc={previewHtml}
						></iframe>
					{/if}
				</div>
			</main>
		</div>
	{/if}
</div>

<style>
	.editor-layout {
		height: 100vh;
		background: #fafafa;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.topbar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 18px;
		height: 48px;
		background: #111;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		flex-shrink: 0;
	}

	.back-link {
		display: flex;
		align-items: center;
		gap: 4px;
		color: #71717a;
		text-decoration: none;
		font-size: 13px;
		white-space: nowrap;
	}

	.back-link:hover {
		color: #fff;
	}

	.topbar-divider {
		width: 1px;
		height: 14px;
		background: rgba(255, 255, 255, 0.1);
	}

	.topbar-title {
		font-size: 13px;
		font-weight: 500;
		color: #e4e4e7;
		max-width: 280px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.topbar-spacer {
		flex: 1;
	}

	.status-chip {
		font-size: 11px;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 999px;
		flex-shrink: 0;
	}

	.status-draft,
	.status-publishing {
		background: rgba(255, 255, 255, 0.08);
		color: #a1a1aa;
	}

	.status-published {
		background: rgba(74, 222, 128, 0.15);
		color: #86efac;
	}

	.topbar-btn {
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		padding: 6px 12px;
		border-radius: 6px;
		border: none;
		background: #5b5bd6;
		color: #fff;
		cursor: pointer;
		flex-shrink: 0;
	}

	.topbar-btn.secondary {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: #e4e4e7;
	}

	.topbar-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.banner {
		font-size: 13px;
		padding: 8px 18px;
		margin: 0;
		flex-shrink: 0;
	}

	.banner.error {
		background: #fef2f2;
		color: #b91c1c;
		border-bottom: 1px solid #fecaca;
	}

	.banner.success {
		background: #f0fdf4;
		color: #15803d;
		border-bottom: 1px solid #bbf7d0;
	}

	.meta-bar {
		display: flex;
		align-items: flex-end;
		gap: 12px;
		padding: 10px 18px;
		background: #fff;
		border-bottom: 1px solid #e4e4e7;
		flex-shrink: 0;
	}

	.meta-field label {
		display: block;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: #71717a;
		margin-bottom: 4px;
	}

	.meta-field input {
		font: inherit;
		font-size: 13px;
		padding: 6px 10px;
		border: 1px solid #e4e4e7;
		border-radius: 6px;
		width: 200px;
	}

	.meta-field-grow {
		flex: 1;
		min-width: 0;
	}

	.meta-field-grow input {
		width: 100%;
	}

	.usage-hint {
		font-size: 12px;
		color: #71717a;
		padding-bottom: 7px;
		white-space: nowrap;
	}

	.usage-hint.draft {
		color: #5b5bd6;
		font-weight: 600;
	}

	.panels {
		flex: 1;
		min-height: 0;
		display: flex;
	}

	.panels.resizing {
		cursor: col-resize;
		user-select: none;
	}

	.left-panel {
		flex: 0 0 auto;
		background: #fff;
		border-right: 1px solid #e4e4e7;
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
	}

	.panel-resize-handle {
		flex: 0 0 5px;
		margin-left: -2px;
		margin-right: -2px;
		border: none;
		cursor: col-resize;
		background: transparent;
		position: relative;
		z-index: 10;
	}

	.panel-resize-handle::after {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 1px;
		background: #e4e4e7;
	}

	.panel-resize-handle:hover::after,
	.panels.resizing .panel-resize-handle::after {
		width: 3px;
		background: #5b5bd6;
	}

	.preview-area {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		background: #f4f4f5;
	}

	.preview-toolbar {
		display: flex;
		align-items: baseline;
		gap: 10px;
		padding: 10px 16px;
		background: #fff;
		border-bottom: 1px solid #e4e4e7;
		flex-shrink: 0;
	}

	.preview-label {
		font-size: 12px;
		font-weight: 600;
		color: #111;
	}

	.preview-hint {
		font-size: 11px;
		color: #a1a1aa;
	}

	.preview-frame-wrap {
		flex: 1;
		min-height: 0;
		padding: 16px;
		overflow: auto;
	}

	.preview-iframe {
		width: 100%;
		max-width: 600px;
		min-height: 400px;
		border: none;
		background: #fff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
		border-radius: 4px;
	}

	.preview-empty,
	.preview-error,
	.loading-state {
		font-size: 14px;
		color: #71717a;
		padding: 24px;
	}

	.preview-error,
	.loading-state.error {
		color: #b91c1c;
	}

	.loading-state {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
