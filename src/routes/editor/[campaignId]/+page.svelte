<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';

	interface CFField {
		id: string;
		label: string;
		type: string;
		required: boolean;
		value: string;
	}

	interface Campaign {
		id: string;
		name: string;
		templateId: string;
		cfPath: string;
		status: string;
	}

	interface ValidationWarning {
		severity: 'error' | 'warning' | 'info';
		fieldPath: string;
		message: string;
		suggestion: string;
	}

	const campaignId = $derived($page.params.campaignId);

	let campaign = $state<Campaign | null>(null);
	let fields = $state<CFField[]>([]);
	let warnings = $state<ValidationWarning[]>([]);
	let selectedPersonaId = $state('persona-1');
	let isLoading = $state(true);
	let iframeKey = $state(0); // increment to force iframe reload
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let exportStatus = $state<'idle' | 'exporting' | 'done' | 'error'>('idle');

	const PERSONAS = [
		{ id: 'persona-1', label: 'Sarah (Gold)' },
		{ id: 'persona-2', label: 'Marcus (New)' },
		{ id: 'persona-3', label: 'Elena (Platinum)' }
	];

	const FIELD_LABELS: Record<string, string> = {
		heroHeadline: 'Hero Headline',
		subtitle: 'Subtitle (optional)',
		bodyCopy: 'Body Copy',
		ctaText: 'CTA Button Text',
		ctaUrl: 'CTA URL',
		featuredOffer: 'Featured Offer CF'
	};

	const previewUrl = $derived(
		`/preview/${campaignId}?personaId=${selectedPersonaId}&t=${iframeKey}`
	);

	onMount(async () => {
		await loadCampaign();
	});

	onDestroy(() => {
		if (debounceTimer) clearTimeout(debounceTimer);
	});

	async function loadCampaign() {
		isLoading = true;
		try {
			const res = await fetch(`/api/campaigns/${campaignId}`);
			if (!res.ok) throw new Error(`${res.status}`);
			const data = await res.json() as { campaign: Campaign; cf: { fields: Record<string, unknown> } };
			campaign = data.campaign;

			// Build editable fields from CF data + template definition
			const cfFields = data.cf?.fields ?? {};
			fields = buildFields(cfFields);
			await runValidation();
		} catch (err) {
			console.error('Failed to load campaign:', err);
		} finally {
			isLoading = false;
		}
	}

	function buildFields(cfFields: Record<string, unknown>): CFField[] {
		const fieldDefs: Record<string, { type: string; required: boolean }> = {
			heroHeadline: { type: 'text', required: true },
			subtitle: { type: 'text', required: false },
			bodyCopy: { type: 'richtext', required: true },
			ctaText: { type: 'text', required: true },
			ctaUrl: { type: 'url', required: true }
		};

		return Object.entries(fieldDefs).map(([id, def]) => ({
			id,
			label: FIELD_LABELS[id] ?? id,
			type: def.type,
			required: def.required,
			value: String(cfFields[id] ?? '')
		}));
	}

	function onFieldChange(fieldId: string, newValue: string) {
		const field = fields.find((f) => f.id === fieldId);
		if (field) field.value = newValue;

		// Debounce preview refresh + validation (500ms as spec)
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			iframeKey += 1;
			runValidation();
		}, 500);
	}

	async function runValidation() {
		if (!fields.length) return;
		try {
			const fieldValues: Record<string, string> = {};
			const fieldTypes: Record<string, string> = {};
			for (const f of fields) {
				fieldValues[f.id] = f.value;
				fieldTypes[f.id] = f.type;
			}
			const res = await fetch('/api/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fields: fieldValues, fieldTypes })
			});
			const data = await res.json() as { warnings: ValidationWarning[] };
			warnings = data.warnings ?? [];
		} catch {
			// validation errors are non-blocking
		}
	}

	async function handleExport() {
		exportStatus = 'exporting';
		try {
			const res = await fetch(
				`/api/export?campaignId=${campaignId}&personaId=${selectedPersonaId}`
			);
			if (!res.ok) throw new Error(`Export failed: ${res.status}`);
			const blob = await res.blob();
			const downloadUrl = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = downloadUrl;
			a.download = `${campaignId}-export.json`;
			a.click();
			URL.revokeObjectURL(downloadUrl);
			exportStatus = 'done';
			setTimeout(() => (exportStatus = 'idle'), 3000);
		} catch (err) {
			console.error('Export failed:', err);
			exportStatus = 'error';
			setTimeout(() => (exportStatus = 'idle'), 3000);
		}
	}

	const errorCount = $derived(warnings.filter((w) => w.severity === 'error').length);
	const warningCount = $derived(warnings.filter((w) => w.severity === 'warning').length);
</script>

<div class="editor-layout">
	<!-- ─── Top bar ─── -->
	<header class="topbar">
		<a href="/" class="back-link">← Campaigns</a>
		<div class="campaign-name">
			{campaign?.name ?? campaignId}
			<span class="mode-badge">MOCK MODE</span>
		</div>
		<div class="topbar-actions">
			{#if errorCount > 0 || warningCount > 0}
				<span class="issue-count">
					{#if errorCount > 0}<span class="error-dot">{errorCount} error{errorCount > 1 ? 's' : ''}</span>{/if}
					{#if warningCount > 0}<span class="warning-dot">{warningCount} warning{warningCount > 1 ? 's' : ''}</span>{/if}
				</span>
			{/if}
			<button
				class="export-btn"
				class:loading={exportStatus === 'exporting'}
				onclick={handleExport}
				disabled={exportStatus === 'exporting'}
			>
				{#if exportStatus === 'exporting'}Exporting…
				{:else if exportStatus === 'done'}Exported ✓
				{:else if exportStatus === 'error'}Export failed
				{:else}Export for AJO{/if}
			</button>
		</div>
	</header>

	<!-- ─── Three-panel layout ─── -->
	<div class="panels">
		<!-- Left: template/block info -->
		<aside class="panel panel-left">
			<div class="panel-header">Template</div>
			<div class="panel-content">
				<div class="template-info">
					<div class="info-row">
						<span class="info-label">Template</span>
						<span class="info-value">{campaign?.templateId ?? '—'}</span>
					</div>
					<div class="info-row">
						<span class="info-label">CF Path</span>
						<span class="info-value cf-path">{campaign?.cfPath ?? '—'}</span>
					</div>
				</div>

				<div class="section-title">Persona</div>
				<div class="persona-select">
					{#each PERSONAS as persona}
						<label class="persona-option">
							<input
								type="radio"
								name="persona"
								value={persona.id}
								bind:group={selectedPersonaId}
								onchange={() => (iframeKey += 1)}
							/>
							{persona.label}
						</label>
					{/each}
				</div>

				<div class="section-title">Blocks in template</div>
				<ul class="block-list">
					<li>Hero headline + subtitle</li>
					<li>Personalised greeting</li>
					<li>Body copy</li>
					<li>Featured offer (optional)</li>
					<li>CTA button</li>
					<li>Footer</li>
				</ul>
			</div>
		</aside>

		<!-- Center: preview iframe -->
		<main class="panel panel-center">
			<div class="panel-header">Preview</div>
			{#if isLoading}
				<div class="preview-loading">Loading preview…</div>
			{:else}
				<div class="iframe-wrapper">
					<iframe
						src={previewUrl}
						title="Email preview"
						sandbox="allow-same-origin allow-scripts"
						class="preview-iframe"
					></iframe>
				</div>
			{/if}
		</main>

		<!-- Right: property / CF binding panel -->
		<aside class="panel panel-right">
			<div class="panel-header">Content Fragments</div>
			<div class="panel-content">
				{#if isLoading}
					<p class="loading-text">Loading fields…</p>
				{:else}
					<div class="fields-list">
						{#each fields as field}
							{@const fieldWarnings = warnings.filter((w) => w.fieldPath === `cf.${field.id}`)}
							<div class="field-group" class:has-error={fieldWarnings.some((w) => w.severity === 'error')}>
								<label class="field-label" for="field-{field.id}">
									{field.label}
									{#if field.required}<span class="required">*</span>{/if}
								</label>

								{#if field.type === 'richtext'}
									<textarea
										id="field-{field.id}"
										class="field-input field-textarea"
										value={field.value}
										oninput={(e) => onFieldChange(field.id, (e.target as HTMLTextAreaElement).value)}
										rows={4}
									></textarea>
								{:else if field.type === 'url'}
									<input
										id="field-{field.id}"
										type="url"
										class="field-input"
										value={field.value}
										oninput={(e) => onFieldChange(field.id, (e.target as HTMLInputElement).value)}
									/>
								{:else}
									<input
										id="field-{field.id}"
										type="text"
										class="field-input"
										value={field.value}
										oninput={(e) => onFieldChange(field.id, (e.target as HTMLInputElement).value)}
									/>
								{/if}

								{#each fieldWarnings as w}
									<div class="field-warning severity-{w.severity}">
										<span class="warning-icon">{w.severity === 'error' ? '✕' : '!'}</span>
										{w.message}
									</div>
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</aside>
	</div>
</div>

<style>
	.editor-layout {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
		background: #f0f0f0;
	}

	/* ── Topbar ── */
	.topbar {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 0 16px;
		height: 48px;
		background: #1a1a1a;
		color: white;
		flex-shrink: 0;
	}

	.back-link {
		color: #aaa;
		text-decoration: none;
		font-size: 13px;
		white-space: nowrap;
	}
	.back-link:hover { color: white; }

	.campaign-name {
		flex: 1;
		font-size: 14px;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.mode-badge {
		font-size: 10px;
		background: #fff3cd;
		color: #856404;
		padding: 1px 6px;
		border-radius: 4px;
		font-weight: 700;
	}

	.topbar-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.issue-count {
		display: flex;
		gap: 8px;
		font-size: 12px;
	}

	.error-dot { color: #ff6b6b; font-weight: 600; }
	.warning-dot { color: #ffc107; font-weight: 600; }

	.export-btn {
		background: #0265dc;
		color: white;
		border: none;
		border-radius: 4px;
		padding: 6px 14px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}
	.export-btn:hover:not(:disabled) { background: #0050b3; }
	.export-btn:disabled { opacity: 0.6; cursor: default; }
	.export-btn.loading { background: #666; }

	/* ── Panels ── */
	.panels {
		display: grid;
		grid-template-columns: 220px 1fr 280px;
		flex: 1;
		overflow: hidden;
		gap: 1px;
		background: #ddd;
	}

	.panel {
		background: white;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-header {
		padding: 10px 16px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #666;
		border-bottom: 1px solid #e5e5e5;
		flex-shrink: 0;
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
	}

	/* ── Left panel ── */
	.template-info {
		margin-bottom: 20px;
	}

	.info-row {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: 10px;
	}

	.info-label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #888;
		font-weight: 600;
	}

	.info-value {
		font-size: 13px;
		color: #1a1a1a;
	}

	.cf-path {
		font-family: monospace;
		font-size: 11px;
		color: #555;
		word-break: break-all;
	}

	.section-title {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #888;
		margin-bottom: 8px;
		margin-top: 16px;
	}

	.persona-select {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 16px;
	}

	.persona-option {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		cursor: pointer;
	}

	.block-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.block-list li {
		font-size: 12px;
		color: #555;
		padding: 4px 8px;
		background: #f8f8f8;
		border-radius: 4px;
	}

	/* ── Center panel ── */
	.panel-center {
		background: #e8e8e8;
	}

	.preview-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		color: #888;
		font-size: 13px;
	}

	.iframe-wrapper {
		flex: 1;
		overflow: auto;
		display: flex;
		justify-content: center;
		padding: 16px;
		background: #e8e8e8;
	}

	.preview-iframe {
		width: 600px;
		height: 100%;
		border: none;
		background: white;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
	}

	/* ── Right panel ── */
	.fields-list {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.field-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.field-group.has-error .field-input {
		border-color: #ff6b6b;
	}

	.field-label {
		font-size: 12px;
		font-weight: 600;
		color: #444;
	}

	.required {
		color: #dc3545;
		margin-left: 2px;
	}

	.field-input {
		width: 100%;
		padding: 6px 8px;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 13px;
		font-family: inherit;
		transition: border-color 0.15s;
	}

	.field-input:focus {
		outline: none;
		border-color: #0265dc;
	}

	.field-textarea {
		resize: vertical;
		line-height: 1.5;
	}

	.field-warning {
		display: flex;
		align-items: flex-start;
		gap: 5px;
		font-size: 11px;
		line-height: 1.4;
		padding: 4px 6px;
		border-radius: 3px;
	}

	.severity-error {
		background: #fff0f0;
		color: #c00;
		border-left: 2px solid #ff6b6b;
	}

	.severity-warning {
		background: #fffbea;
		color: #7a5c00;
		border-left: 2px solid #ffc107;
	}

	.warning-icon {
		font-weight: bold;
		flex-shrink: 0;
	}

	.loading-text {
		color: #888;
		font-size: 13px;
	}
</style>
