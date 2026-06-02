<script lang="ts">
	import MjmlCodeEditor from '$lib/components/MjmlCodeEditor.svelte';
	import {
		buildMjmlTree,
		isMjmlTreeNodeHidden,
		mjmlTreeNodeColor,
		type MjmlFlatNode
	} from '$lib/mjml/tree.js';

	interface Props {
		value?: string;
		isDirty?: boolean;
		compileHtml?: (mjml: string) => Promise<string>;
		onsave?: () => void | Promise<void>;
		saveLabel?: string;
		saveDisabled?: boolean;
		saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
	}

	let {
		value = $bindable(''),
		isDirty = $bindable(false),
		compileHtml,
		onsave,
		saveLabel = 'Save',
		saveDisabled = false,
		saveStatus = 'idle'
	}: Props = $props();

	let activeTab = $state<'code' | 'tree' | 'html'>('code');
	let treeNodes = $state<MjmlFlatNode[]>([]);
	let collapsedPaths = $state<Set<string>>(new Set());
	let htmlOutput = $state('');
	let htmlCompileStatus = $state<'idle' | 'loading' | 'error'>('idle');
	let htmlCompileError = $state('');
	let htmlCompileRequestId = 0;

	let mjmlEditor = $state<MjmlCodeEditor | undefined>();

	$effect(() => {
		treeNodes = buildMjmlTree(value);
	});

	$effect(() => {
		const mjml = value;
		const tab = activeTab;
		if (tab !== 'html' || !compileHtml || !mjml.trim()) {
			return;
		}

		htmlCompileStatus = 'loading';
		htmlCompileError = '';

		const timer = setTimeout(() => {
			const requestId = ++htmlCompileRequestId;
			void (async () => {
				try {
					const html = await compileHtml(mjml);
					if (requestId !== htmlCompileRequestId) return;
					htmlOutput = html;
					htmlCompileStatus = 'idle';
					htmlCompileError = '';
				} catch (e) {
					if (requestId !== htmlCompileRequestId) return;
					htmlOutput = '';
					htmlCompileError = e instanceof Error ? e.message : 'Compile failed';
					htmlCompileStatus = 'error';
				}
			})();
		}, 400);

		return () => clearTimeout(timer);
	});

	function toggleCollapse(path: string) {
		const next = new Set(collapsedPaths);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		collapsedPaths = next;
	}
</script>

<div class="mjml-panel">
	<div class="tab-bar">
		<button type="button" class="tab" class:active={activeTab === 'code'} onclick={() => (activeTab = 'code')}>
			Code
		</button>
		<button type="button" class="tab" class:active={activeTab === 'tree'} onclick={() => (activeTab = 'tree')}>
			Structure
		</button>
		<button type="button" class="tab" class:active={activeTab === 'html'} onclick={() => (activeTab = 'html')}>
			HTML
		</button>
	</div>

	<div class="panel-content">
		{#if activeTab === 'code'}
			<div class="editor-wrap">
				<MjmlCodeEditor
					bind:this={mjmlEditor}
					class="mjml-editor"
					bind:value
					ondirty={() => (isDirty = true)}
					onsave={onsave}
				/>
				<a
					href="https://documentation.mjml.io/#mjml-guide"
					target="_blank"
					rel="noopener noreferrer"
					class="mjml-docs-link"
					title="MJML documentation"
				>
					MJML docs ↗
				</a>
			</div>
		{:else if activeTab === 'html'}
			<div class="editor-wrap html-panel">
				<div class="html-panel-hint">Read-only · compiled from MJML</div>
				{#if !value.trim()}
					<div class="html-empty">No MJML to compile</div>
				{:else if !compileHtml}
					<div class="html-empty">HTML preview not available</div>
				{:else if htmlCompileStatus === 'loading' && !htmlOutput}
					<div class="html-empty">Compiling…</div>
				{:else if htmlCompileStatus === 'error'}
					<div class="editor-error">{htmlCompileError}</div>
				{:else}
					<textarea
						class="mjml-editor html-output"
						readonly
						value={htmlOutput}
						spellcheck={false}
						tabindex="-1"
						aria-label="Compiled HTML output"
					></textarea>
				{/if}
			</div>
		{:else}
			<div class="tree-view">
				{#if treeNodes.length === 0}
					<div class="tree-empty">
						{value.trim() ? 'No MJML structure detected' : 'No MJML loaded'}
					</div>
				{:else}
					<div class="tree-scroll">
						{#each treeNodes as node (node.path)}
							{#if !isMjmlTreeNodeHidden(node.path, collapsedPaths)}
								<div class="tree-node" style:padding-left={`${node.depth * 16 + 10}px`}>
									<button
										class="collapse-btn"
										class:has-children={node.childCount > 0}
										onclick={() => node.childCount > 0 && toggleCollapse(node.path)}
										tabindex={node.childCount > 0 ? 0 : -1}
										aria-label={node.childCount > 0 ? 'Toggle' : undefined}
									>
										{#if node.childCount > 0}
											{collapsedPaths.has(node.path) ? '▶' : '▾'}
										{/if}
									</button>
									<span class="node-tag node-{mjmlTreeNodeColor(node.tag)}">{node.tag}</span>
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	{#if onsave}
		<div class="panel-footer">
			<div class="footer-actions">
				{#if isDirty}
					<span class="dirty-indicator" title="Unsaved changes">●</span>
				{/if}
				<button
					type="button"
					class="save-btn"
					class:saving={saveStatus === 'saving'}
					class:saved={saveStatus === 'saved'}
					class:save-error={saveStatus === 'error'}
					onclick={() => onsave?.()}
					disabled={saveDisabled || saveStatus === 'saving'}
				>
					{#if saveStatus === 'saving'}
						Saving…
					{:else if saveStatus === 'saved'}
						Saved ✓
					{:else if saveStatus === 'error'}
						Save failed
					{:else}
						{saveLabel}
					{/if}
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.mjml-panel {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.tab-bar {
		display: flex;
		gap: 0;
		padding: 0 12px;
		border-bottom: 1px solid #f0f0f1;
		flex-shrink: 0;
	}

	.tab {
		font: inherit;
		font-size: 12px;
		font-weight: 500;
		padding: 10px 12px;
		border: none;
		background: none;
		color: #71717a;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}

	.tab:hover {
		color: #3f3f46;
	}

	.tab.active {
		color: #111;
		border-bottom-color: #5b5bd6;
	}

	.panel-content {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.editor-wrap {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.mjml-editor {
		flex: 1;
		min-height: 0;
	}

	.mjml-docs-link {
		position: absolute;
		right: 12px;
		bottom: 10px;
		font-size: 11px;
		font-weight: 500;
		color: #a1a1aa;
		text-decoration: none;
		z-index: 2;
	}

	.mjml-docs-link:hover {
		color: #5b5bd6;
	}

	.html-panel-hint {
		font-size: 11px;
		color: #a1a1aa;
		padding: 8px 14px 0;
		flex-shrink: 0;
	}

	.html-empty {
		padding: 24px 14px;
		font-size: 13px;
		color: #a1a1aa;
	}

	.html-output {
		flex: 1;
		min-height: 0;
		resize: none;
		border: none;
		border-radius: 0;
		background: #fafafa;
	}

	.editor-error {
		margin: 12px 14px;
		padding: 10px 12px;
		font-size: 12px;
		color: #b91c1c;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
	}

	.tree-view {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.tree-scroll {
		height: 100%;
		overflow: auto;
		padding: 8px 0;
	}

	.tree-empty {
		padding: 24px 14px;
		font-size: 13px;
		color: #a1a1aa;
	}

	.tree-node {
		display: flex;
		align-items: center;
		gap: 4px;
		height: 26px;
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 12px;
	}

	.collapse-btn {
		width: 16px;
		height: 16px;
		padding: 0;
		border: none;
		background: none;
		color: #a1a1aa;
		font-size: 9px;
		cursor: default;
		flex-shrink: 0;
	}

	.collapse-btn.has-children {
		cursor: pointer;
	}

	.node-tag {
		padding: 1px 6px;
		border-radius: 4px;
	}

	.node-structure {
		color: #5b5bd6;
		background: #ededfc;
	}

	.node-head {
		color: #71717a;
		background: #f4f4f5;
	}

	.node-content {
		color: #111;
	}

	.panel-footer {
		flex-shrink: 0;
		padding: 10px 12px;
		border-top: 1px solid #f0f0f1;
		display: flex;
		justify-content: flex-end;
	}

	.footer-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.dirty-indicator {
		color: #f59e0b;
		font-size: 10px;
	}

	.save-btn {
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		padding: 6px 14px;
		border-radius: 6px;
		border: none;
		background: #5b5bd6;
		color: #fff;
		cursor: pointer;
	}

	.save-btn:hover:not(:disabled) {
		background: #4f4fc4;
	}

	.save-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.save-btn.saved {
		background: #15803d;
	}

	.save-btn.save-error {
		background: #b91c1c;
	}
</style>
