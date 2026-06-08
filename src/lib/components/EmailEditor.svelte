<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount, tick } from 'svelte';
	import {
		ajoExperienceCloudTemplateUrl,
		cfExperienceCloudEditorUrl,
		universalEditorCanvasUrl
	} from '$lib/aem/author-links.js';
	import { type Persona } from '$lib/personas/samples.js';
	import type { PersonaListItem } from '$lib/personas/types.js';
	import PreviewProfilesManager from '$lib/components/PreviewProfilesManager.svelte';
	import TemplateFieldsManager from '$lib/components/TemplateFieldsManager.svelte';
	import type { CfInsertField } from '$lib/templates/cf-insert.js';
	import { displayStatusHint, displayStatusLabel } from '$lib/db/attach-email-status.js';
	import type { EmailStatusInfo } from '$lib/db/email-status-types.js';
	import MjmlCodeEditor from '$lib/components/MjmlCodeEditor.svelte';
	import type { AjoRequestFailure } from '$lib/ajo/client.js';
	import { formatAjoPushError } from '$lib/ajo/format-push-error.js';
	import { formatAjoTemplateLabel } from '$lib/ajo/format-template-id.js';
	import {
		parseEnvelopeHtmlComment,
		type EmailEnvelope
	} from '$lib/preview/envelope.js';

	type EmailEditorMode = 'campaign' | 'standalone';

	interface Props {
		mode?: EmailEditorMode;
		entityId: string;
	}

	let { mode = 'campaign', entityId }: Props = $props();

	// ─── Types ──────────────────────────────────────────────────────────────────
	interface Campaign {
		id: string;
		name: string;
		templateId: string;
		selectedTemplateId?: string;
		cfPath: string;
		cfUuid?: string;
		status: string;
		emailStatus?: EmailStatusInfo;
	}

	interface TemplateInfo {
		id: string;
		familyId: string;
		name: string;
		version: string;
		isBuiltin: boolean;
	}

	interface TemplateFamily {
		familyId: string;
		name: string;
	}

	interface FlatNode {
		tag: string;
		depth: number;
		path: string;
		childCount: number;
		closingOccurrence: number;
	}

	// ─── State ──────────────────────────────────────────────────────────────────
	const campaignId = $derived(mode === 'campaign' ? entityId : '');
	const standaloneTemplateId = $derived(mode === 'standalone' ? entityId : '');
	const isStandalone = $derived(mode === 'standalone');

	let campaign = $state<Campaign | null>(null);
	let cfVersion = $state('');
	let standaloneEmailStatus = $state<EmailStatusInfo | undefined>();
	let standaloneName = $state('');
	let isLoading = $state(true);

	// Template
	let templates = $state<TemplateInfo[]>([]);
	let selectedTemplateId = $state('');
	let mjmlCode = $state('');
	let isDirty = $state(false);
	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let saveVersionStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let templateLoadError = $state('');

	// Template picker
	let familyPickerOpen = $state(false);
	let versionPickerOpen = $state(false);
	let templateActionsOpen = $state(false);
	let deleteVersionStatus = $state<'idle' | 'deleting' | 'error'>('idle');
	let deleteFamilyStatus = $state<'idle' | 'deleting' | 'error'>('idle');
	let renameFamilyStatus = $state<'idle' | 'renaming' | 'error'>('idle');
	let renameTemplateName = $state('');
	let showRenameForm = $state(false);

	// Persona picker
	let personas = $state<PersonaListItem[]>([]);
	let previewActionsOpen = $state(false);
	let previewManagerOpen = $state(false);
	let templateFieldsManagerOpen = $state(false);
	let contentModelFields = $state<CfInsertField[]>([]);
	let cfInsertMenuOpen = $state(false);

	// New template inline form
	let showNewForm = $state(false);
	let newTemplateName = $state('');
	let newTemplateCreating = $state(false);
	const newTemplateId = $derived(
		newTemplateName
			.toLowerCase()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9-]/g, '')
	);

	// Left panel UI
	const LEFT_PANEL_WIDTH_KEY = 'editor-left-panel-width';
	const LEFT_PANEL_MIN = 280;
	const LEFT_PANEL_PREVIEW_MIN = 320;
	const LEFT_PANEL_DEFAULT = 480;

	function getLeftPanelMax(): number {
		if (typeof window === 'undefined') return 1200;
		return Math.max(LEFT_PANEL_MIN, window.innerWidth - LEFT_PANEL_PREVIEW_MIN);
	}

	function clampLeftPanelWidth(width: number): number {
		return Math.min(getLeftPanelMax(), Math.max(LEFT_PANEL_MIN, width));
	}

	let leftPanelWidth = $state(LEFT_PANEL_DEFAULT);
	let isResizingPanel = $state(false);

	let activeTab = $state<'code' | 'tree' | 'html'>('code');
	let htmlOutput = $state('');
	let htmlCompileStatus = $state<'idle' | 'loading' | 'error'>('idle');
	let htmlCompileError = $state('');
	let htmlCompileRequestId = 0;
	let treeNodes = $state<FlatNode[]>([]);
	let collapsedPaths = $state(new Set<string>());
	let addMenuNode = $state<{ node: FlatNode; x: number; y: number } | null>(null);

	// Preview
	const PREVIEW_VIEWPORT_KEY = 'editor-preview-viewport';
	const PREVIEW_CHROME_KEY = 'editor-preview-chrome';
	const PREVIEW_DESKTOP_WIDTH = 600;
	const PREVIEW_MOBILE_WIDTH = 375;

	let selectedPersonaId = $state('persona-1');
	let previewViewport = $state<'desktop' | 'mobile'>('desktop');
	let previewChrome = $state<'light' | 'dark'>('light');
	let previewWarnings = $state<string[]>([]);
	let previewWarningsExpanded = $state(false);
	let previewEnvelope = $state<EmailEnvelope | null>(null);
	let iframeKey = $state(0);
	let iframeEl = $state<HTMLIFrameElement | null>(null);
	let ajoPushStatus = $state<'idle' | 'exporting' | 'done' | 'error'>('idle');
	let ajoHtmlDownloadStatus = $state<'idle' | 'exporting' | 'done' | 'error'>('idle');
	let ajoHtmlCopyStatus = $state<'idle' | 'exporting' | 'done' | 'error'>('idle');
	let ajoActionMessage = $state('');
	let ajoErrorDialogOpen = $state(false);
	let ajoErrorDialogText = $state('');
	let ajoErrorCopyStatus = $state<'idle' | 'done'>('idle');
	let ajoActionsOpen = $state(false);
	let ajoUnlinkStatus = $state<'idle' | 'unlinking' | 'error'>('idle');

	// Textarea ref (for Tab/cursor handling)
	let mjmlEditor = $state<MjmlCodeEditor | null>(null);

	// ─── Constants ──────────────────────────────────────────────────────────────
	const CHILD_COMPONENTS: Record<string, { tag: string; label: string; snippet: string }[]> = {
		mjml: [
			{
				tag: 'mj-body',
				label: 'Body',
				snippet: `<mj-body>\n  <mj-section>\n    <mj-column>\n      <mj-text>New section</mj-text>\n    </mj-column>\n  </mj-section>\n</mj-body>`
			}
		],
		'mj-head': [
			{ tag: 'mj-preview', label: 'Preview text', snippet: '<mj-preview>Preview text</mj-preview>' },
			{ tag: 'mj-style', label: 'Style', snippet: '<mj-style>\n  \n</mj-style>' }
		],
		'mj-body': [
			{
				tag: 'mj-section',
				label: 'Section',
				snippet: `<mj-section padding="20px 40px" background-color="#FFFFFF">\n  <mj-column>\n    <mj-text>New section</mj-text>\n  </mj-column>\n</mj-section>`
			}
		],
		'mj-section': [
			{
				tag: 'mj-column',
				label: 'Column',
				snippet: `<mj-column>\n  <mj-text>New column</mj-text>\n</mj-column>`
			}
		],
		'mj-column': [
			{ tag: 'mj-text', label: 'Text', snippet: '<mj-text>New text</mj-text>' },
			{ tag: 'mj-image', label: 'Image', snippet: '<mj-image src="" alt="" />' },
			{
				tag: 'mj-button',
				label: 'Button',
				snippet: '<mj-button href="#" background-color="#0265DC">Button text</mj-button>'
			},
			{
				tag: 'mj-divider',
				label: 'Divider',
				snippet: '<mj-divider border-color="#EEEEEE" border-width="1px" />'
			},
			{ tag: 'mj-spacer', label: 'Spacer', snippet: '<mj-spacer height="20px" />' }
		]
	};

	// Tag colour groups for the tree
	function nodeColor(tag: string): string {
		if (tag === 'mjml' || tag === 'mj-body' || tag === 'mj-section' || tag === 'mj-column')
			return 'structure';
		if (tag === 'mj-head' || tag.startsWith('mj-attributes') || tag === 'mj-style' || tag === 'mj-preview')
			return 'head';
		return 'content';
	}

	// ─── Lifecycle ──────────────────────────────────────────────────────────────
	onMount(async () => {
		const stored = localStorage.getItem(LEFT_PANEL_WIDTH_KEY);
		if (stored) {
			const parsed = Number.parseInt(stored, 10);
			if (!Number.isNaN(parsed)) {
				leftPanelWidth = clampLeftPanelWidth(parsed);
			}
		}

		const storedViewport = localStorage.getItem(PREVIEW_VIEWPORT_KEY);
		if (storedViewport === 'desktop' || storedViewport === 'mobile') {
			previewViewport = storedViewport;
		}
		const storedChrome = localStorage.getItem(PREVIEW_CHROME_KEY);
		if (storedChrome === 'light' || storedChrome === 'dark') {
			previewChrome = storedChrome;
		}

		if (isStandalone) {
			await Promise.all([loadStandaloneTemplate(), loadTemplates(), loadPreviewContext()]);
			if (standaloneTemplateId) {
				selectedTemplateId = resolveTemplateSelectionId(standaloneTemplateId, templates);
			}
		} else {
			await Promise.all([loadCampaign(), loadTemplates(), loadPreviewContext()]);
			const preferredTemplateId = campaign?.selectedTemplateId ?? campaign?.templateId;
			if (preferredTemplateId) {
				selectedTemplateId = resolveTemplateSelectionId(preferredTemplateId, templates);
			}
		}
	});

	$effect(() => {
		if (isStandalone || !campaignId || !selectedTemplateId) return;
		selectedTemplateId;
		void loadContentModelFields();
	});

	async function loadPreviewContext() {
		try {
			const personasRes = await fetch('/api/personas');
			if (personasRes.ok) {
				const data = (await personasRes.json()) as { personas: PersonaListItem[] };
				personas = data.personas;
				if (!personas.some((p) => p.id === selectedPersonaId) && personas[0]) {
					selectedPersonaId = personas[0].id;
				}
			}
		} catch (err) {
			console.error('Failed to load preview context:', err);
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

	// Load MJML when selected template changes
	$effect(() => {
		if (selectedTemplateId) {
			loadTemplateMJML(selectedTemplateId);
		}
	});

	// Rebuild structure tree whenever MJML code changes
	$effect(() => {
		treeNodes = buildTree(mjmlCode);
	});

	// Debounced HTML compile when viewing HTML tab or when inputs change on that tab
	$effect(() => {
		const mjml = mjmlCode;
		const tab = activeTab;
		const id = isStandalone ? standaloneTemplateId : campaignId;
		const templateId = selectedTemplateId;
		const personaId = selectedPersonaId;
		const persona = selectedPersona;
		const version = cfVersion;

		if (tab !== 'html' || !id || !templateId || !mjml.trim()) {
			return;
		}

		htmlCompileStatus = 'loading';
		htmlCompileError = '';

		const timer = setTimeout(() => {
			const requestId = ++htmlCompileRequestId;
			void compileHtmlPreview(mjml, id, templateId, personaId, persona, requestId, version);
		}, 400);

		return () => clearTimeout(timer);
	});

	// ─── Data loading ────────────────────────────────────────────────────────────
	async function loadCampaign() {
		isLoading = true;
		try {
			const res = await fetch(`/api/campaigns/${campaignId}`);
			if (!res.ok) throw new Error(`${res.status}`);
			const data = (await res.json()) as {
				campaign: Campaign;
				cf?: { version?: string };
			};
			campaign = data.campaign;
			cfVersion = data.cf?.version ?? '';
		} catch (err) {
			console.error('Failed to load campaign:', err);
		} finally {
			isLoading = false;
		}
	}

	async function loadStandaloneTemplate() {
		isLoading = true;
		try {
			const [templateRes, standaloneRes] = await Promise.all([
				fetch(`/api/templates/${encodeURIComponent(standaloneTemplateId)}`),
				fetch('/api/templates/standalone')
			]);
			if (templateRes.ok) {
				const data = (await templateRes.json()) as { definition: { name: string } };
				standaloneName = data.definition.name;
			}
			if (standaloneRes.ok) {
				const data = (await standaloneRes.json()) as {
					templates: Array<{ id: string; emailStatus?: EmailStatusInfo }>;
				};
				standaloneEmailStatus = data.templates.find((t) => t.id === standaloneTemplateId)?.emailStatus;
			}
		} catch (err) {
			console.error('Failed to load standalone template:', err);
		} finally {
			isLoading = false;
		}
	}

	async function loadContentModelFields() {
		if (isStandalone || !campaignId) return;
		try {
			const templateQuery = selectedTemplateId
				? `?templateId=${encodeURIComponent(selectedTemplateId)}`
				: '';
			const res = await fetch(
				`/api/campaigns/${encodeURIComponent(campaignId)}/content-model${templateQuery}`
			);
			if (!res.ok) return;
			const data = (await res.json()) as { fields?: CfInsertField[] };
			contentModelFields = data.fields ?? [];
		} catch (err) {
			console.error('Failed to load content model fields:', err);
		}
	}

	function isRichFieldType(type: string): boolean {
		return type === 'asset' || type === 'image' || type === 'richtext' || type === 'html';
	}

	function formatCfInsertToken(field: CfInsertField): string {
		const unescaped = /asset|image|richtext|html/i.test(field.type);
		return unescaped ? `{{{${field.token}}}}` : `{{${field.token}}}`;
	}

	async function insertCfField(field: CfInsertField) {
		cfInsertMenuOpen = false;
		const snippet = field.snippet;
		if (activeTab === 'code' && mjmlEditor) {
			await mjmlEditor.insertAtCursor(snippet);
		} else {
			mjmlCode = `${mjmlCode}${mjmlCode.endsWith('\n') || !mjmlCode ? '' : '\n'}${snippet}`;
		}
		isDirty = true;
	}

	async function loadTemplates() {
		try {
			const url = isStandalone ? '/api/templates/standalone' : '/api/templates';
			const res = await fetch(url);
			if (!res.ok) throw new Error(`${res.status}`);
			const data = (await res.json()) as { templates: TemplateInfo[] };
			templates = data.templates;
		} catch (err) {
			console.error('Failed to load templates:', err);
		}
	}

	async function compileHtmlPreview(
		mjml: string,
		id: string,
		templateId: string,
		personaId: string,
		persona: Persona | null | undefined,
		requestId: number,
		cachedCfVersion = ''
	) {
		try {
			const res = isStandalone
				? await fetch('/api/compile/standalone', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							mjml,
							personaId,
							persona: persona ?? undefined
						})
					})
				: await fetch('/api/compile', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							mjml,
							campaignId: id,
							templateId,
							personaId,
							persona: persona ?? undefined,
							...(cachedCfVersion ? { cfVersion: cachedCfVersion } : {})
						})
					});

			if (requestId !== htmlCompileRequestId) return;

			const data = (await res.json()) as {
				html?: string | null;
				errors?: Array<{ message: string }>;
				message?: string;
			};

			if (!res.ok || !data.html) {
				const details = Array.isArray(data.errors)
					? data.errors.map((e) => e.message).join('; ')
					: (data.message ?? `Compile failed: ${res.status}`);
				htmlOutput = '';
				htmlCompileError = details;
				htmlCompileStatus = 'error';
				return;
			}

			htmlOutput = data.html;
			htmlCompileStatus = 'idle';
			htmlCompileError = '';
		} catch (e) {
			if (requestId !== htmlCompileRequestId) return;
			htmlOutput = '';
			htmlCompileError = e instanceof Error ? e.message : 'Compile failed';
			htmlCompileStatus = 'error';
		}
	}

	async function loadTemplateMJML(id: string) {
		templateLoadError = '';
		try {
			const res = await fetch(`/api/templates/${id}`);
			if (!res.ok) throw new Error(`${res.status}`);
			const data = (await res.json()) as { mjml: string };
			mjmlCode = data.mjml;
			isDirty = false;
		} catch (err) {
			templateLoadError = `Failed to load template: ${err}`;
		}
	}

	// ─── Actions ─────────────────────────────────────────────────────────────────
	function resolveTemplateSelectionId(campaignTemplateId: string, list: TemplateInfo[]): string {
		const exact = list.find((t) => t.id === campaignTemplateId);
		if (exact) return exact.id;
		const familyMatch = list.filter(
			(t) => t.familyId === campaignTemplateId || t.id === campaignTemplateId
		);
		if (familyMatch.length === 0) return campaignTemplateId;
		return familyMatch.sort((a, b) =>
			b.version.localeCompare(a.version, undefined, { numeric: true })
		)[0]!.id;
	}

	async function handleSave() {
		if (!selectedTemplateId || !mjmlCode) return;
		saveStatus = 'saving';
		try {
			const res = await fetch(`/api/templates/${selectedTemplateId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mjml: mjmlCode })
			});
			if (!res.ok) throw new Error(`${res.status}`);
			isDirty = false;
			saveStatus = 'saved';
			iframeKey += 1;
			setTimeout(() => (saveStatus = 'idle'), 2000);
		} catch {
			saveStatus = 'error';
			setTimeout(() => (saveStatus = 'idle'), 3000);
		}
	}

	async function handleSaveAsNewVersion() {
		if (!selectedTemplateId || !mjmlCode || saveVersionStatus === 'saving') return;
		templateActionsOpen = false;
		saveVersionStatus = 'saving';
		try {
			const res = await fetch(`/api/templates/${selectedTemplateId}/versions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mjml: mjmlCode })
			});
			if (!res.ok) throw new Error(`${res.status}`);
			const data = (await res.json()) as { id: string; version: string };
			await loadTemplates();
			selectedTemplateId = data.id;
			isDirty = false;
			saveVersionStatus = 'saved';
			iframeKey += 1;
			setTimeout(() => (saveVersionStatus = 'idle'), 2000);
		} catch {
			saveVersionStatus = 'error';
			setTimeout(() => (saveVersionStatus = 'idle'), 3000);
		}
	}

	async function handleDeleteVersion() {
		if (!selectedTemplateId || !canDeleteVersion || deleteVersionStatus === 'deleting') return;
		const versionLabel = selectedTemplate?.version ?? '';
		if (!confirm(`Delete version v${versionLabel}? This cannot be undone.`)) return;

		templateActionsOpen = false;
		deleteVersionStatus = 'deleting';
		const familyId = selectedTemplate!.familyId;
		const fallbackId =
			familyVersions.find((v) => v.id !== selectedTemplateId)?.id ??
			templates.find((t) => t.familyId === familyId && t.id !== selectedTemplateId)?.id ??
			'';

		try {
			const res = await fetch(`/api/templates/${selectedTemplateId}`, { method: 'DELETE' });
			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { message?: string };
				throw new Error(data.message ?? `${res.status}`);
			}
			await loadTemplates();
			selectedTemplateId =
				fallbackId ||
				resolveTemplateSelectionId(familyId, templates) ||
				templates[0]?.id ||
				'';
			isDirty = false;
			iframeKey += 1;
			deleteVersionStatus = 'idle';
		} catch (err) {
			console.error('Failed to delete template version:', err);
			deleteVersionStatus = 'error';
			setTimeout(() => (deleteVersionStatus = 'idle'), 3000);
		}
	}

	async function handleCreateTemplate() {
		if (!newTemplateId || !newTemplateName || newTemplateCreating) return;
		newTemplateCreating = true;
		try {
			const id = isStandalone ? `ajo-${newTemplateId}` : newTemplateId;
			const res = await fetch('/api/templates', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id,
					name: newTemplateName,
					...(isStandalone ? { cfModel: '' } : {})
				})
			});
			if (!res.ok) throw new Error(`${res.status}`);
			await loadTemplates();
			selectedTemplateId = id;
			showNewForm = false;
			newTemplateName = '';
		} catch (err) {
			console.error('Failed to create template:', err);
		} finally {
			newTemplateCreating = false;
		}
	}

	function remoteTemplateId(): string | undefined {
		if (isStandalone) return standaloneEmailStatus?.remoteTemplateId;
		return campaign?.emailStatus?.remoteTemplateId;
	}

	async function fetchAjoHtml(): Promise<string> {
		if (isStandalone) {
			if (!standaloneTemplateId) throw new Error('No template loaded');
			const res = await fetch('/api/export/ajo/standalone', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ templateId: selectedTemplateId || standaloneTemplateId, mjml: mjmlCode, push: false })
			});
			if (!res.ok) {
				const err = (await res.json().catch(() => ({}))) as {
					validationErrors?: Array<{ message: string }>;
					message?: string;
				};
				const details = Array.isArray(err.validationErrors)
					? err.validationErrors.map((e) => e.message).join('; ')
					: (err.message ?? `AJO export failed: ${res.status}`);
				throw new Error(details);
			}
			const payload = (await res.json()) as { html?: string };
			if (!payload.html) throw new Error('Export returned no HTML');
			return payload.html;
		}

		if (!campaignId) throw new Error('No campaign loaded');

		const res = await fetch(`/api/export/ajo?campaignId=${encodeURIComponent(campaignId)}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mjml: mjmlCode, push: false })
		});
		if (!res.ok) {
			const err = (await res.json().catch(() => ({}))) as {
				validationErrors?: Array<{ message: string }>;
				message?: string;
			};
			const details = Array.isArray(err.validationErrors)
				? err.validationErrors.map((e) => e.message).join('; ')
				: (err.message ?? `AJO export failed: ${res.status}`);
			throw new Error(details);
		}
		const payload = (await res.json()) as { html?: string };
		if (!payload.html) throw new Error('Export returned no HTML');
		return payload.html;
	}

	const ajoHtmlBusy = $derived(
		ajoHtmlDownloadStatus === 'exporting' || ajoHtmlCopyStatus === 'exporting'
	);

	async function handleAjoHtmlDownload() {
		if ((!campaignId && !standaloneTemplateId) || ajoHtmlBusy) return;
		ajoHtmlDownloadStatus = 'exporting';
		ajoActionMessage = '';
		try {
			const html = await fetchAjoHtml();
			const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
			const downloadUrl = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = downloadUrl;
			a.download = `${isStandalone ? standaloneTemplateId : campaignId}-ajo.html`;
			a.click();
			URL.revokeObjectURL(downloadUrl);
			ajoHtmlDownloadStatus = 'done';
			setTimeout(() => (ajoHtmlDownloadStatus = 'idle'), 2000);
		} catch (e) {
			ajoActionMessage = e instanceof Error ? e.message : 'Export failed';
			ajoHtmlDownloadStatus = 'error';
			setTimeout(() => (ajoHtmlDownloadStatus = 'idle'), 5000);
		}
	}

	async function handleAjoHtmlCopy() {
		if ((!campaignId && !standaloneTemplateId) || ajoHtmlBusy) return;
		ajoHtmlCopyStatus = 'exporting';
		ajoActionMessage = '';
		try {
			const html = await fetchAjoHtml();
			await navigator.clipboard.writeText(html);
			ajoHtmlCopyStatus = 'done';
			setTimeout(() => (ajoHtmlCopyStatus = 'idle'), 2000);
		} catch (e) {
			ajoActionMessage = e instanceof Error ? e.message : 'Copy failed';
			ajoHtmlCopyStatus = 'error';
			setTimeout(() => (ajoHtmlCopyStatus = 'idle'), 5000);
		}
	}

	function openAjoErrorDialog(text: string) {
		ajoErrorDialogText = text;
		ajoErrorDialogOpen = true;
	}

	function closeAjoErrorDialog() {
		ajoErrorDialogOpen = false;
		ajoErrorCopyStatus = 'idle';
	}

	async function copyAjoErrorDialog() {
		try {
			await navigator.clipboard.writeText(ajoErrorDialogText);
			ajoErrorCopyStatus = 'done';
			setTimeout(() => (ajoErrorCopyStatus = 'idle'), 2000);
		} catch {
			// ignore — user can still select from textarea
		}
	}

	async function handleAjoUnlink() {
		if ((!campaignId && !standaloneTemplateId) || !remoteTemplateId() || ajoUnlinkStatus === 'unlinking') return;
		const confirmed = confirm(
			'Unlink this email from its AJO template?\n\nUse this if you deleted the template manually in AJO. The next push will create a new template.'
		);
		if (!confirmed) return;

		ajoActionsOpen = false;
		ajoUnlinkStatus = 'unlinking';
		ajoActionMessage = '';
		try {
			const res = isStandalone
				? await fetch(`/api/templates/${encodeURIComponent(standaloneTemplateId)}/ajo-link`, {
						method: 'DELETE'
					})
				: await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/ajo-link`, {
						method: 'DELETE'
					});
			const data = (await res.json().catch(() => ({}))) as {
				campaign?: Campaign;
				emailStatus?: EmailStatusInfo;
				message?: string;
			};
			if (!res.ok) {
				throw new Error(data.message ?? `Unlink failed: ${res.status}`);
			}
			if (isStandalone) {
				standaloneEmailStatus = data.emailStatus;
			} else if (data.campaign) {
				campaign = data.campaign;
			} else {
				await loadCampaign();
			}
			ajoPushStatus = 'idle';
			ajoUnlinkStatus = 'idle';
		} catch (e) {
			ajoActionMessage = e instanceof Error ? e.message : 'Unlink failed';
			ajoUnlinkStatus = 'error';
			setTimeout(() => (ajoUnlinkStatus = 'idle'), 5000);
		}
	}

	function closeAjoActions() {
		ajoActionsOpen = false;
	}

	async function handleAjoPush() {
		if (!campaignId && !standaloneTemplateId) return;
		ajoPushStatus = 'exporting';
		ajoActionMessage = '';
		ajoErrorDialogOpen = false;
		try {
			const ajoTemplateId = remoteTemplateId();
			const res = isStandalone
				? await fetch('/api/export/ajo/standalone', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							push: true,
							templateId: selectedTemplateId || standaloneTemplateId,
							mjml: mjmlCode,
							templateName: standaloneName || standaloneTemplateId,
							ajoTemplateId
						})
					})
				: await fetch(`/api/export/ajo?campaignId=${encodeURIComponent(campaignId)}`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							push: true,
							templateId: selectedTemplateId,
							mjml: mjmlCode,
							templateName: campaign?.name ?? campaignId,
							ajoTemplateId
						})
					});
			const data = (await res.json()) as {
				ok?: boolean;
				templateId?: string;
				pushMethod?: 'create' | 'update';
				remoteTemplateIdSaved?: boolean;
				message?: string;
				failure?: AjoRequestFailure;
				validationErrors?: Array<{ message: string; details?: string[] }>;
			};
			if (!res.ok || !data.ok) {
				const fullError = formatAjoPushError({
					message: data.message ?? `Push failed: ${res.status}`,
					failure: data.failure,
					validationErrors: data.validationErrors
				});
				openAjoErrorDialog(fullError);
				ajoActionMessage =
					data.message ??
					(Array.isArray(data.validationErrors)
						? data.validationErrors.map((e) => e.message).join('; ')
						: `Push failed: ${res.status}`);
				ajoPushStatus = 'error';
				setTimeout(() => (ajoPushStatus = 'idle'), 5000);
				return;
			}
			if (data.templateId && isStandalone) {
				standaloneEmailStatus = {
					syncStatus: 'synced',
					remoteTemplateId: data.templateId,
					lastPushedAt: new Date().toISOString()
				};
			} else if (data.templateId && campaign) {
				campaign = {
					...campaign,
					status: 'synced',
					emailStatus: {
						syncStatus: 'synced',
						remoteTemplateId: data.templateId,
						lastPushedAt: new Date().toISOString()
					}
				};
			}
			const action = data.pushMethod === 'update' ? 'Updated' : 'Created';
			ajoActionMessage = data.templateId
				? `${action} ${formatAjoTemplateLabel(data.templateId)}`
				: 'Sent';
			if (data.templateId && data.remoteTemplateIdSaved === false && !isStandalone) {
				ajoActionMessage += ' (id not saved — missing CF UUID)';
			}
			ajoPushStatus = 'done';
			if (isStandalone) {
				await loadStandaloneTemplate();
			} else {
				void loadCampaign();
			}
			setTimeout(() => (ajoPushStatus = 'idle'), 5000);
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Push failed';
			openAjoErrorDialog(msg);
			ajoActionMessage = msg;
			ajoPushStatus = 'error';
			setTimeout(() => (ajoPushStatus = 'idle'), 5000);
		}
	}

	function fitIframe() {
		if (!iframeEl?.contentDocument) return;
		const body = iframeEl.contentDocument.body;
		if (!body) return;
		iframeEl.style.height = body.scrollHeight + 'px';
	}

	function extractPreviewWarnings() {
		const doc = iframeEl?.contentDocument;
		if (!doc) {
			previewWarnings = [];
			return;
		}
		const found: string[] = [];
		const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT);
		let node = walker.nextNode();
		while (node) {
			const text = node.textContent ?? '';
			const marker = 'FRAGMENT_MAILER_WARNING:';
			const idx = text.indexOf(marker);
			if (idx >= 0) {
				found.push(text.slice(idx + marker.length).trim());
			}
			node = walker.nextNode();
		}
		previewWarnings = found;
		if (found.length === 0) {
			previewWarningsExpanded = false;
		}
	}

	function extractPreviewEnvelope() {
		const doc = iframeEl?.contentDocument;
		if (!doc) {
			previewEnvelope = null;
			return;
		}
		const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT);
		let node = walker.nextNode();
		while (node) {
			const parsed = parseEnvelopeHtmlComment(node.textContent ?? '');
			if (parsed) {
				previewEnvelope = parsed;
				return;
			}
			node = walker.nextNode();
		}
		previewEnvelope = null;
	}

	function onPreviewIframeLoad() {
		fitIframe();
		extractPreviewWarnings();
		extractPreviewEnvelope();
	}

	function personaChipLabel(persona: Persona): string {
		const paren = persona.label.match(/\(([^)]+)\)/);
		if (paren?.[1]) return paren[1];
		const first = persona.person?.name?.firstName;
		if (first) return first;
		return persona.label.split(/\s+/)[0] ?? persona.label;
	}

	function setPreviewViewport(viewport: 'desktop' | 'mobile') {
		previewViewport = viewport;
		localStorage.setItem(PREVIEW_VIEWPORT_KEY, viewport);
	}

	function setPreviewChrome(chrome: 'light' | 'dark') {
		if (previewChrome === chrome) return;
		previewChrome = chrome;
		localStorage.setItem(PREVIEW_CHROME_KEY, chrome);
		iframeKey += 1;
	}

	// ─── Structure tree ───────────────────────────────────────────────────────────
	function buildTree(mjml: string): FlatNode[] {
		if (!mjml.trim() || typeof DOMParser === 'undefined') return [];
		try {
			const parser = new DOMParser();
			// Wrap in a known element; DOMParser (HTML mode) handles unknown elements correctly.
			const doc = parser.parseFromString(`<x-root>${mjml}</x-root>`, 'text/html');
			const nodes: FlatNode[] = [];
			const tagCounts = new Map<string, number>();

			function walk(el: Element, depth: number, path: string) {
				const tag = el.tagName.toLowerCase();
				if (!tag.startsWith('mj-') && tag !== 'mjml') return;

				const occ = (tagCounts.get(tag) ?? 0) + 1;
				tagCounts.set(tag, occ);

				const mjmlChildren = [...el.children].filter((c) => {
					const t = c.tagName.toLowerCase();
					return t.startsWith('mj-') || t === 'mjml';
				});

				nodes.push({ tag, depth, path, childCount: mjmlChildren.length, closingOccurrence: occ });

				mjmlChildren.forEach((child, i) => walk(child, depth + 1, `${path}.${i}`));
			}

			const wrapper = doc.body.querySelector('x-root') ?? doc.body;
			[...wrapper.children].forEach((child, i) => {
				const tag = child.tagName.toLowerCase();
				if (tag.startsWith('mj-') || tag === 'mjml') walk(child, 0, String(i));
			});

			return nodes;
		} catch {
			return [];
		}
	}

	function isHidden(node: FlatNode): boolean {
		const parts = node.path.split('.');
		for (let i = 1; i < parts.length; i++) {
			if (collapsedPaths.has(parts.slice(0, i).join('.'))) return true;
		}
		return false;
	}

	function toggleCollapse(path: string) {
		const next = new Set(collapsedPaths);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		collapsedPaths = next;
	}

	function openAddMenu(e: MouseEvent, node: FlatNode) {
		e.stopPropagation();
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		addMenuNode = { node, x: rect.right + 6, y: rect.top };
	}

	/** Find the index of `</tag>` that closes the element at `targetPath` (matches buildTree paths). */
	function findClosingTagIndexForPath(mjml: string, targetPath: string): number {
		const tagRe = /<\/?([a-z][a-z0-9-]*)\b[^>]*\/?>/gi;
		type Frame = { tag: string; path: string; mjChildIndex: number };
		const stack: Frame[] = [];
		let rootMjIndex = 0;

		let match: RegExpExecArray | null;
		while ((match = tagRe.exec(mjml))) {
			const full = match[0];
			const tag = match[1].toLowerCase();
			if (!tag.startsWith('mj-') && tag !== 'mjml') continue;

			const isClose = full.startsWith('</');
			const selfClosing = !isClose && /\/>\s*$/.test(full);

			if (isClose) {
				for (let i = stack.length - 1; i >= 0; i--) {
					if (stack[i].tag !== tag) continue;
					const frame = stack[i];
					if (frame.path === targetPath) return match.index;
					stack.splice(i, 1);
					break;
				}
				continue;
			}

			const parent = stack[stack.length - 1];
			const path = parent ? `${parent.path}.${parent.mjChildIndex++}` : String(rootMjIndex++);

			if (selfClosing) continue;

			stack.push({ tag, path, mjChildIndex: 0 });
		}

		return -1;
	}

	async function focusEditorAt(position: number) {
		await mjmlEditor?.focusAt(position);
	}

	function insertChildComponent(node: FlatNode, snippet: string) {
		addMenuNode = null;

		const insertIdx = findClosingTagIndexForPath(mjmlCode, node.path);
		let newCode = mjmlCode;
		let cursorAt = newCode.length;

		if (insertIdx >= 0) {
			const lineStart = newCode.lastIndexOf('\n', insertIdx - 1) + 1;
			const existingIndent = newCode.slice(lineStart, insertIdx).match(/^(\s*)/)?.[1] ?? '';
			const childIndent = existingIndent + '  ';
			const indentedSnippet = snippet
				.split('\n')
				.map((line) => childIndent + line)
				.join('\n');
			newCode = newCode.slice(0, insertIdx) + indentedSnippet + '\n' + newCode.slice(insertIdx);
			cursorAt = insertIdx + indentedSnippet.length + 1;
		} else {
			newCode = `${mjmlCode}\n${snippet}`;
			cursorAt = newCode.length;
		}

		mjmlCode = newCode;
		isDirty = true;

		const next = new Set(collapsedPaths);
		const parts = node.path.split('.');
		for (let i = 1; i <= parts.length; i++) {
			next.delete(parts.slice(0, i).join('.'));
		}
		collapsedPaths = next;

		if (activeTab === 'code') {
			void focusEditorAt(cursorAt);
		}
	}

	function closeTemplatePickers() {
		familyPickerOpen = false;
		versionPickerOpen = false;
		templateActionsOpen = false;
	}

	async function persistCampaignTemplateSelection(templateId: string) {
		if (isStandalone || !campaignId || !templateId) return;
		try {
			await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/template-preference`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ templateId })
			});
			if (campaign) {
				campaign = { ...campaign, selectedTemplateId: templateId };
			}
		} catch (err) {
			console.error('Failed to persist template selection:', err);
		}
	}

	function applyTemplateSelection(templateId: string) {
		if (!templateId || selectedTemplateId === templateId) return;
		selectedTemplateId = templateId;
		isDirty = false;
		iframeKey += 1;
		void persistCampaignTemplateSelection(templateId);
	}

	function selectFamily(familyId: string) {
		const versions = templates
			.filter((t) => t.familyId === familyId)
			.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
		if (versions[0]) applyTemplateSelection(versions[0].id);
		closeTemplatePickers();
	}

	function selectVersion(id: string) {
		applyTemplateSelection(id);
		closeTemplatePickers();
	}

	async function handleRenameFamily() {
		if (!selectedFamilyId || !renameTemplateName.trim() || renameFamilyStatus === 'renaming') return;
		const family = templateFamilies.find((f) => f.familyId === selectedFamilyId);
		if (!family || selectedTemplate?.isBuiltin) return;

		templateActionsOpen = false;
		renameFamilyStatus = 'renaming';
		try {
			const res = await fetch(`/api/templates/families/${encodeURIComponent(selectedFamilyId)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: renameTemplateName.trim() })
			});
			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { message?: string };
				throw new Error(data.message ?? `${res.status}`);
			}
			await loadTemplates();
			if (isStandalone) {
				standaloneName = renameTemplateName.trim();
			}
			showRenameForm = false;
			renameTemplateName = '';
			renameFamilyStatus = 'idle';
		} catch (err) {
			console.error('Failed to rename template:', err);
			renameFamilyStatus = 'error';
			setTimeout(() => (renameFamilyStatus = 'idle'), 3000);
		}
	}

	async function handleDeleteFamily() {
		if (!selectedFamilyId || !canDeleteFamily || deleteFamilyStatus === 'deleting') return;
		const family = templateFamilies.find((f) => f.familyId === selectedFamilyId);
		if (!family) return;
		if (!confirm(`Delete template "${family.name}" and all its versions? This cannot be undone.`)) {
			return;
		}

		templateActionsOpen = false;
		deleteFamilyStatus = 'deleting';
		try {
			const res = await fetch(`/api/templates/families/${encodeURIComponent(selectedFamilyId)}`, {
				method: 'DELETE'
			});
			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { message?: string };
				throw new Error(data.message ?? `${res.status}`);
			}
			await loadTemplates();
			if (isStandalone) {
				await goto('/templates');
				return;
			}
			const fallback =
				templates.find((t) => t.familyId === campaign?.templateId)?.id ??
				templates.find((t) => !t.isBuiltin)?.id ??
				templates[0]?.id ??
				'';
			if (fallback) applyTemplateSelection(fallback);
			deleteFamilyStatus = 'idle';
		} catch (err) {
			console.error('Failed to delete template:', err);
			deleteFamilyStatus = 'error';
			setTimeout(() => (deleteFamilyStatus = 'idle'), 3000);
		}
	}

	function handleDropdownKeydown(
		e: KeyboardEvent,
		isOpen: boolean,
		setOpen: (open: boolean) => void
	) {
		if (e.key === 'Escape') {
			setOpen(false);
			return;
		}
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			setOpen(!isOpen);
		}
	}

	function stopEventPropagation(e: Event) {
		e.stopPropagation();
	}

	function selectPersona(id: string) {
		if (selectedPersonaId === id) return;
		selectedPersonaId = id;
		iframeKey += 1;
	}

	function closePreviewPickers() {
		previewActionsOpen = false;
		closeAjoActions();
	}

	function openPreviewManager() {
		previewActionsOpen = false;
		previewManagerOpen = true;
	}

	function openTemplateFieldsManager() {
		templateActionsOpen = false;
		templateFieldsManagerOpen = true;
	}

	type PreviewResourceItem = PersonaListItem;

	function handlePersonasChange(detail: { items: PreviewResourceItem[]; selectedId: string }) {
		personas = detail.items as PersonaListItem[];
		if (detail.selectedId && detail.selectedId !== selectedPersonaId) {
			selectedPersonaId = detail.selectedId;
			iframeKey += 1;
		} else if (!personas.some((p) => p.id === selectedPersonaId) && detail.selectedId) {
			selectedPersonaId = detail.selectedId;
			iframeKey += 1;
		} else if (detail.items.length) {
			iframeKey += 1;
		}
	}

	// ─── Derived ─────────────────────────────────────────────────────────────────
	const selectedTemplate = $derived(templates.find((t) => t.id === selectedTemplateId) ?? null);
	const selectedFamilyId = $derived(selectedTemplate?.familyId ?? '');

	const templateFamilies = $derived.by((): TemplateFamily[] => {
		const seen = new Map<string, TemplateFamily>();
		for (const t of templates) {
			if (!seen.has(t.familyId)) {
				seen.set(t.familyId, { familyId: t.familyId, name: t.name });
			}
		}
		return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
	});

	const familyVersions = $derived(
		templates
			.filter((t) => t.familyId === selectedFamilyId)
			.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
	);

	const canDeleteVersion = $derived(
		Boolean(selectedTemplate && !selectedTemplate.isBuiltin && familyVersions.length > 1)
	);

	const canDeleteFamily = $derived(
		Boolean(selectedTemplate && !selectedTemplate.isBuiltin && selectedFamilyId)
	);

	const canRenameFamily = $derived(Boolean(selectedTemplate && !selectedTemplate.isBuiltin));

	const selectedPersona = $derived(personas.find((p) => p.id === selectedPersonaId) ?? null);

	const aemAuthorUrl = $derived($page.data?.aem?.authorUrl ?? $page.data?.ue?.aemBaseUrl ?? null);
	const cfEditorTenant = $derived($page.data?.aem?.cfEditorTenant ?? 'psc');
	const ajoSandbox = $derived($page.data?.aem?.ajoSandboxName ?? 'prod');

	const cfAuthorUrl = $derived.by(() => {
		if (isStandalone || !campaign?.cfUuid) return null;
		return cfExperienceCloudEditorUrl(campaign.cfUuid, aemAuthorUrl, cfEditorTenant);
	});

	const ueCanvasUrl = $derived.by(() => {
		if (isStandalone || !campaignId || !aemAuthorUrl) return null;
		return universalEditorCanvasUrl(campaignId, $page.url.origin, aemAuthorUrl, cfEditorTenant);
	});

	const ajoTemplateUrl = $derived.by(() => {
		const remoteId = remoteTemplateId();
		if (!remoteId || !aemAuthorUrl) return null;
		return ajoExperienceCloudTemplateUrl(remoteId, aemAuthorUrl, cfEditorTenant, ajoSandbox);
	});

	const editorTitle = $derived(
		isStandalone ? (standaloneName || standaloneTemplateId) : (campaign?.name ?? campaignId)
	);

	const backHref = $derived(isStandalone ? '/templates' : '/');
	const backLabel = $derived(isStandalone ? 'Templates' : 'Emails');

	const ajoSyncStatus = $derived(
		isStandalone
			? (standaloneEmailStatus?.syncStatus ?? 'never_pushed')
			: (campaign?.status ?? campaign?.emailStatus?.syncStatus ?? 'never_pushed')
	);

	const ajoSyncChipTitle = $derived.by(() => {
		const hint = displayStatusHint(ajoSyncStatus);
		const remoteId = isStandalone
			? standaloneEmailStatus?.remoteTemplateId
			: campaign?.emailStatus?.remoteTemplateId;
		if (!remoteId) return hint;
		const pushed = isStandalone
			? standaloneEmailStatus?.lastPushedAt
			: campaign?.emailStatus?.lastPushedAt;
		const pushedLine = pushed ? `Last pushed: ${new Date(pushed).toLocaleString()}` : '';
		return [hint, `AJO template: ${remoteId}`, pushedLine].filter(Boolean).join('\n');
	});

	const pushButtonLabel = $derived.by(() => {
		if (ajoPushStatus === 'exporting') return 'Sending…';
		if (ajoPushStatus === 'done') return 'Sent ✓';
		if (ajoPushStatus === 'error') return 'Send failed';
		switch (ajoSyncStatus) {
			case 'stale':
				return 'Update AJO';
			case 'synced':
				return 'Send to AJO';
			default:
				return 'Send to AJO';
		}
	});

	// Clear warnings and envelope while the preview iframe reloads
	$effect(() => {
		void iframeKey;
		previewWarnings = [];
		previewEnvelope = null;
	});

	const previewUrl = $derived.by(() => {
		const params = new URLSearchParams({
			templateId: selectedTemplateId || 'promo',
			personaId: selectedPersonaId,
			colorScheme: previewChrome,
			t: String(iframeKey)
		});
		if (selectedPersona) {
			params.set('persona', JSON.stringify(selectedPersona));
		}
		if (isStandalone) {
			return `/preview/standalone/${encodeURIComponent(standaloneTemplateId)}?${params}`;
		}
		return `/preview/${campaignId}?${params}`;
	});
</script>

<!-- Close floating menus on outside click -->
<svelte:window
	onclick={(e) => {
		const target = e.target;
		if (target instanceof Element && target.closest('.add-menu, .add-child-btn, .template-actions, .preview-actions, .ajo-actions')) return;
		addMenuNode = null;
		cfInsertMenuOpen = false;
		closeTemplatePickers();
		closePreviewPickers();
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape') {
			closeTemplatePickers();
			closePreviewPickers();
			closeAjoActions();
		}
		if (e.key === 'Escape' && previewManagerOpen) {
			previewManagerOpen = false;
		}
		if (e.key === 'Escape' && templateFieldsManagerOpen) {
			templateFieldsManagerOpen = false;
		}
	}}
/>

<div class="editor-layout">
	<!-- ─── Topbar ─────────────────────────────────────────────────────────── -->
	<header class="topbar">
		<a href={backHref} class="back-link">
			<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
				<path
					d="M9 11L5 7l4-4"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			{backLabel}
		</a>
		<div class="topbar-divider"></div>
		<div class="campaign-name">{editorTitle}</div>
		{#if !isStandalone && (cfAuthorUrl || ueCanvasUrl)}
			<div class="author-links">
				{#if cfAuthorUrl}
					<a
						href={cfAuthorUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="open-cf-link"
						title="Open this content fragment in the AEM CF editor (Experience Cloud)"
					>
						<svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
							<path
								d="M9 2h3v3M12 2 7 7M5 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9"
								stroke="currentColor"
								stroke-width="1.25"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						CF Editor
					</a>
				{/if}
				{#if ueCanvasUrl}
					<a
						href={ueCanvasUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="open-cf-link"
						title="Open this email preview in Universal Editor ({$page.url.host})"
					>
						<svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
							<path
								d="M9 2h3v3M12 2 7 7M5 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9"
								stroke="currentColor"
								stroke-width="1.25"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						Universal Editor
					</a>
				{/if}
			</div>
		{/if}
		<div class="topbar-spacer"></div>
		<div class="ajo-group">
			<div class="ajo-html-actions">
				<button
					type="button"
					class="ajo-html-btn"
					class:loading={ajoHtmlDownloadStatus === 'exporting'}
					class:done={ajoHtmlDownloadStatus === 'done'}
					class:error={ajoHtmlDownloadStatus === 'error'}
					onclick={handleAjoHtmlDownload}
					disabled={ajoPushStatus === 'exporting' || ajoHtmlBusy}
					title="Download AJO-ready HTML"
					aria-label="Download AJO HTML"
				>
					{#if ajoHtmlDownloadStatus === 'done'}
						<svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
							<path
								d="M2.5 7.25 5.5 10.25 11.5 3.75"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					{:else}
						<svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
							<path
								d="M7 2.5v6.5M4.5 7.5 7 10l2.5-2.5M3 11.5h8"
								stroke="currentColor"
								stroke-width="1.25"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					{/if}
				</button>
				<button
					type="button"
					class="ajo-html-btn"
					class:loading={ajoHtmlCopyStatus === 'exporting'}
					class:done={ajoHtmlCopyStatus === 'done'}
					class:error={ajoHtmlCopyStatus === 'error'}
					onclick={handleAjoHtmlCopy}
					disabled={ajoPushStatus === 'exporting' || ajoHtmlBusy}
					title="Copy AJO-ready HTML to clipboard"
					aria-label="Copy AJO HTML"
				>
					{#if ajoHtmlCopyStatus === 'done'}
						<svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
							<path
								d="M2.5 7.25 5.5 10.25 11.5 3.75"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					{:else}
						<svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
							<rect
								x="4.5"
								y="4.5"
								width="7"
								height="7"
								rx="1"
								stroke="currentColor"
								stroke-width="1.25"
							/>
							<path
								d="M3 9.5V3.5a1 1 0 0 1 1-1H9"
								stroke="currentColor"
								stroke-width="1.25"
								stroke-linecap="round"
							/>
						</svg>
					{/if}
				</button>
			</div>
			<div class="ajo-push-group">
				{#if ajoTemplateUrl}
					<a
						href={ajoTemplateUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="open-cf-link"
						title="Open this email content template in Journey Optimizer (Experience Cloud)"
					>
						<svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
							<path
								d="M9 2h3v3M12 2 7 7M5 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9"
								stroke="currentColor"
								stroke-width="1.25"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						Open in AJO
					</a>
				{/if}
				<span
					class="sync-chip sync-{ajoSyncStatus.replace('_', '-')}"
					title={ajoSyncChipTitle}
				>
					<span class="sync-dot" aria-hidden="true"></span>
					{displayStatusLabel(ajoSyncStatus)}
				</span>
				<button
					class="export-btn"
					class:loading={ajoPushStatus === 'exporting'}
					class:done={ajoPushStatus === 'done'}
					class:error={ajoPushStatus === 'error'}
					onclick={handleAjoPush}
					disabled={ajoPushStatus === 'exporting' || ajoHtmlBusy || ajoUnlinkStatus === 'unlinking'}
					title="Send to AJO Content Templates API"
				>
					{pushButtonLabel}
				</button>
				{#if remoteTemplateId()}
					<div class="ajo-actions" class:open={ajoActionsOpen}>
						<button
							type="button"
							class="ajo-actions-btn"
							aria-haspopup="menu"
							aria-expanded={ajoActionsOpen}
							aria-label="AJO actions"
							disabled={ajoPushStatus === 'exporting' || ajoUnlinkStatus === 'unlinking'}
							onclick={(e) => {
								e.stopPropagation();
								ajoActionsOpen = !ajoActionsOpen;
							}}
						>
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
								<circle cx="7" cy="3" r="1" fill="currentColor" />
								<circle cx="7" cy="7" r="1" fill="currentColor" />
								<circle cx="7" cy="11" r="1" fill="currentColor" />
							</svg>
						</button>
						{#if ajoActionsOpen}
							<ul class="ajo-actions-menu" role="menu" onclick={stopEventPropagation} onkeydown={stopEventPropagation}>
								<li role="none">
									<button
										type="button"
										class="ajo-actions-item"
										role="menuitem"
										disabled={ajoUnlinkStatus === 'unlinking'}
										onclick={handleAjoUnlink}
									>
										Unlink AJO template
									</button>
								</li>
							</ul>
						{/if}
					</div>
				{/if}
			</div>
		</div>
		{#if ajoActionMessage && (ajoPushStatus === 'done' || ajoPushStatus === 'error' || ajoHtmlDownloadStatus === 'error' || ajoHtmlCopyStatus === 'error')}
			{#if ajoPushStatus === 'error' && ajoErrorDialogText}
				<button
					type="button"
					class="export-error-hint"
					title="View full error"
					onclick={() => (ajoErrorDialogOpen = true)}
				>
					{ajoActionMessage} — details
				</button>
			{:else if ajoPushStatus === 'done'}
				<span class="export-success-hint" title={isStandalone ? standaloneEmailStatus?.remoteTemplateId ?? ajoActionMessage : campaign?.emailStatus?.remoteTemplateId ?? ajoActionMessage}>
					{ajoActionMessage}
				</span>
			{:else}
				<span class="export-error-hint" title={ajoActionMessage}>{ajoActionMessage}</span>
			{/if}
		{/if}
	</header>

	<div class="panels" class:resizing={isResizingPanel}>
		<!-- ─── Left panel ──────────────────────────────────────────────────── -->
		<aside class="left-panel" style:width={`${leftPanelWidth}px`}>
			<!-- Template + version pickers -->
			<div class="picker-bar">
				<div class="picker-row">
					<div class="dropdown dropdown-compact" class:open={familyPickerOpen}>
						<button
							type="button"
							class="dropdown-trigger dropdown-trigger-compact"
							class:placeholder={!selectedTemplate && templates.length > 0}
							aria-haspopup="listbox"
							aria-expanded={familyPickerOpen}
							aria-label="Template"
							disabled={templates.length === 0}
							onclick={(e) => {
								e.stopPropagation();
								versionPickerOpen = false;
								templateActionsOpen = false;
								familyPickerOpen = !familyPickerOpen;
							}}
							onkeydown={(e) =>
								handleDropdownKeydown(e, familyPickerOpen, (open) => (familyPickerOpen = open))}
						>
							<span class="dropdown-value">
								{#if templates.length === 0}
									<span class="dropdown-primary">…</span>
								{:else if selectedTemplate}
									<span class="dropdown-primary">{selectedTemplate.name}</span>
								{:else}
									<span class="dropdown-primary">Template</span>
								{/if}
							</span>
							<svg class="dropdown-chevron" width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
								<path d="M3.5 5.25 7 8.75l3.5-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</button>
						{#if familyPickerOpen && templateFamilies.length > 0}
							<ul class="dropdown-menu" role="listbox" onclick={stopEventPropagation} onkeydown={stopEventPropagation}>
								{#each templateFamilies as family (family.familyId)}
									<li role="none">
										<button
											type="button"
											class="dropdown-option dropdown-option-compact"
											class:selected={selectedFamilyId === family.familyId}
											role="option"
											aria-selected={selectedFamilyId === family.familyId}
											onclick={() => selectFamily(family.familyId)}
										>
											<span class="dropdown-option-primary">{family.name}</span>
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>

					<div class="dropdown dropdown-compact dropdown-version" class:open={versionPickerOpen}>
						<button
							type="button"
							class="dropdown-trigger dropdown-trigger-compact"
							aria-haspopup="listbox"
							aria-expanded={versionPickerOpen}
							aria-label="Version"
							disabled={familyVersions.length === 0}
							onclick={(e) => {
								e.stopPropagation();
								familyPickerOpen = false;
								templateActionsOpen = false;
								versionPickerOpen = !versionPickerOpen;
							}}
							onkeydown={(e) =>
								handleDropdownKeydown(e, versionPickerOpen, (open) => (versionPickerOpen = open))}
						>
							<span class="dropdown-value">
								<span class="dropdown-primary mono">
									{selectedTemplate ? `v${selectedTemplate.version}` : 'v—'}
								</span>
							</span>
							<svg class="dropdown-chevron" width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
								<path d="M3.5 5.25 7 8.75l3.5-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</button>
						{#if versionPickerOpen && familyVersions.length > 0}
							<ul class="dropdown-menu" role="listbox" onclick={stopEventPropagation} onkeydown={stopEventPropagation}>
								{#each familyVersions as v (v.id)}
									<li role="none">
										<button
											type="button"
											class="dropdown-option dropdown-option-compact"
											class:selected={selectedTemplateId === v.id}
											role="option"
											aria-selected={selectedTemplateId === v.id}
											onclick={() => selectVersion(v.id)}
										>
											<span class="dropdown-option-primary mono">v{v.version}</span>
											{#if v.isBuiltin}
												<span class="dropdown-option-tag">built-in</span>
											{/if}
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>

					<div class="template-actions" class:open={templateActionsOpen}>
						<button
							type="button"
							class="dropdown-trigger dropdown-trigger-compact template-actions-btn"
							aria-haspopup="menu"
							aria-expanded={templateActionsOpen}
							aria-label="Template actions"
							disabled={!selectedTemplateId}
							onclick={(e) => {
								e.stopPropagation();
								familyPickerOpen = false;
								versionPickerOpen = false;
								templateActionsOpen = !templateActionsOpen;
							}}
						>
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
								<circle cx="7" cy="3" r="1" fill="currentColor" />
								<circle cx="7" cy="7" r="1" fill="currentColor" />
								<circle cx="7" cy="11" r="1" fill="currentColor" />
							</svg>
						</button>
						{#if templateActionsOpen}
							<ul class="dropdown-menu template-actions-menu" role="menu" onclick={stopEventPropagation} onkeydown={stopEventPropagation}>
								{#if !isStandalone}
									<li role="none">
										<button
											type="button"
											class="dropdown-option dropdown-option-compact"
											role="menuitem"
											disabled={!selectedTemplateId}
											onclick={openTemplateFieldsManager}
										>
											Content model
										</button>
									</li>
								{/if}
								<li role="none">
									<button
										type="button"
										class="dropdown-option dropdown-option-compact"
										role="menuitem"
										disabled={!canRenameFamily || renameFamilyStatus === 'renaming'}
										onclick={() => {
											templateActionsOpen = false;
											showRenameForm = true;
											renameTemplateName = selectedTemplate?.name ?? '';
										}}
									>
										Rename template
									</button>
								</li>
								<li role="none">
									<button
										type="button"
										class="dropdown-option dropdown-option-compact"
										role="menuitem"
										disabled={saveVersionStatus === 'saving' || !selectedTemplateId}
										onclick={handleSaveAsNewVersion}
									>
										{saveVersionStatus === 'saving' ? 'Saving new version…' : 'Save as new version'}
									</button>
								</li>
								<li role="none">
									<button
										type="button"
										class="dropdown-option dropdown-option-compact dropdown-option-danger"
										role="menuitem"
										disabled={!canDeleteVersion || deleteVersionStatus === 'deleting'}
										title={canDeleteVersion
											? 'Remove this version permanently'
											: selectedTemplate?.isBuiltin
												? 'Built-in versions cannot be deleted'
												: 'Keep at least one version'}
										onclick={handleDeleteVersion}
									>
										{deleteVersionStatus === 'deleting' ? 'Deleting…' : 'Delete this version'}
									</button>
								</li>
								<li role="none">
									<button
										type="button"
										class="dropdown-option dropdown-option-compact dropdown-option-danger"
										role="menuitem"
										disabled={!canDeleteFamily || deleteFamilyStatus === 'deleting'}
										title={canDeleteFamily
											? 'Delete this template and all versions'
											: 'Built-in templates cannot be deleted'}
										onclick={handleDeleteFamily}
									>
										{deleteFamilyStatus === 'deleting' ? 'Deleting…' : 'Delete template'}
									</button>
								</li>
							</ul>
						{/if}
					</div>

					<button
						class="picker-action-btn picker-action-btn-compact accent"
						onclick={() => {
							showNewForm = !showNewForm;
							newTemplateName = '';
						}}
						title="Create new template"
					>
						+ New
					</button>
				</div>
			</div>

			{#if showRenameForm}
				<div class="new-form">
					<input
						class="new-form-input"
						bind:value={renameTemplateName}
						placeholder="Template name…"
						onkeydown={(e) => e.key === 'Enter' && handleRenameFamily()}
					/>
					<div class="new-form-actions">
						<button
							class="btn-create"
							onclick={handleRenameFamily}
							disabled={!renameTemplateName.trim() || renameFamilyStatus === 'renaming'}
						>
							{renameFamilyStatus === 'renaming' ? 'Renaming…' : 'Rename'}
						</button>
						<button
							class="btn-cancel"
							onclick={() => {
								showRenameForm = false;
								renameTemplateName = '';
							}}
						>
							Cancel
						</button>
					</div>
				</div>
			{/if}

			<!-- New template inline form -->
			{#if showNewForm}
				<div class="new-form">
					<input
						class="new-form-input"
						bind:value={newTemplateName}
						placeholder="Template name…"
						onkeydown={(e) => e.key === 'Enter' && handleCreateTemplate()}
					/>
					{#if newTemplateName}
						<div class="new-form-id">id: <code>{isStandalone ? `ajo-${newTemplateId}` : newTemplateId}</code></div>
					{/if}
					<div class="new-form-actions">
						<button
							class="btn-create"
							onclick={handleCreateTemplate}
							disabled={!newTemplateId || newTemplateCreating}
						>
							{newTemplateCreating ? 'Creating…' : 'Create'}
						</button>
						<button
							class="btn-cancel"
							onclick={() => {
								showNewForm = false;
								newTemplateName = '';
							}}
						>
							Cancel
						</button>
					</div>
				</div>
			{/if}

			<!-- Tab bar -->
			<div class="tab-bar">
				<button
					type="button"
					class="tab"
					class:active={activeTab === 'code'}
					onclick={() => (activeTab = 'code')}
				>
					Code
				</button>
				<button type="button" class="tab" class:active={activeTab === 'tree'} onclick={() => (activeTab = 'tree')}>
					Structure
				</button>
				<button type="button" class="tab" class:active={activeTab === 'html'} onclick={() => (activeTab = 'html')}>
					HTML
				</button>
			</div>

			<!-- Panel content -->
			<div class="panel-content">
				{#if activeTab === 'code'}
					<div class="editor-wrap">
						{#if !isStandalone && contentModelFields.length > 0}
							<div class="cf-insert-wrap">
								<button
									type="button"
									class="cf-insert-btn"
									aria-expanded={cfInsertMenuOpen}
									onmousedown={(e) => e.preventDefault()}
									onclick={(e) => {
										e.stopPropagation();
										cfInsertMenuOpen = !cfInsertMenuOpen;
									}}
								>
									+ Insert field
								</button>
								{#if cfInsertMenuOpen}
									<div class="cf-insert-menu" onclick={stopEventPropagation} onkeydown={stopEventPropagation}>
										{#each contentModelFields as field (field.name)}
											<button
												type="button"
												class="cf-insert-item"
												onmousedown={(e) => e.preventDefault()}
												onclick={() => insertCfField(field)}
											>
												<span class="cf-insert-label">{field.label}</span>
												<code class="cf-insert-token">{formatCfInsertToken(field)}</code>
											</button>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
						{#if templateLoadError}
							<div class="editor-error">{templateLoadError}</div>
						{:else}
							<MjmlCodeEditor
								bind:this={mjmlEditor}
								class="mjml-editor"
								bind:value={mjmlCode}
								ondirty={() => (isDirty = true)}
								onsave={handleSave}
							/>
						{/if}
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
						<div class="html-panel-hint">Read-only · compiled from MJML with current persona</div>
						{#if !mjmlCode.trim()}
							<div class="html-empty">No MJML to compile</div>
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
								{mjmlCode.trim() ? 'No MJML structure detected' : 'No template loaded'}
							</div>
						{:else}
							<div class="tree-scroll">
								{#each treeNodes as node (node.path)}
									{#if !isHidden(node)}
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
											<span class="node-tag node-{nodeColor(node.tag)}">{node.tag}</span>
											{#if (CHILD_COMPONENTS[node.tag]?.length ?? 0) > 0}
												<button
													type="button"
													class="add-child-btn"
													onmousedown={(e) => e.stopPropagation()}
													onclick={(e) => openAddMenu(e, node)}
													title={`Add child to <${node.tag}>`}
												>+</button>
											{/if}
										</div>
									{/if}
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="panel-footer">
				<div class="footer-actions">
					{#if isDirty}
						<span class="dirty-indicator" title="Unsaved changes">●</span>
					{/if}
					{#if saveVersionStatus === 'saved'}
						<span class="footer-hint" title="New version created">New version ✓</span>
					{/if}
					<button
						type="button"
						class="save-btn"
						class:saving={saveStatus === 'saving'}
						class:saved={saveStatus === 'saved'}
						class:save-error={saveStatus === 'error'}
						onclick={handleSave}
						disabled={saveStatus === 'saving' || saveVersionStatus === 'saving' || !selectedTemplateId}
						title="Update the current template version in place"
					>
						{#if saveStatus === 'saving'}Saving…
						{:else if saveStatus === 'saved'}Saved ✓
						{:else if saveStatus === 'error'}Save failed
						{:else}Save{/if}
					</button>
				</div>
			</div>
		</aside>

		<button
			type="button"
			class="panel-resize-handle"
			aria-label="Resize editor panel (use arrow keys)"
			onmousedown={startPanelResize}
			onkeydown={(e) => {
				if (e.key === 'ArrowLeft') {
					leftPanelWidth = clampLeftPanelWidth(leftPanelWidth - 16);
					localStorage.setItem(LEFT_PANEL_WIDTH_KEY, String(leftPanelWidth));
				} else if (e.key === 'ArrowRight') {
					leftPanelWidth = clampLeftPanelWidth(leftPanelWidth + 16);
					localStorage.setItem(LEFT_PANEL_WIDTH_KEY, String(leftPanelWidth));
				}
			}}
		></button>

		<!-- ─── Preview ─────────────────────────────────────────────────────── -->
		<main
			class="preview-area"
			class:preview-chrome-dark={previewChrome === 'dark'}
			class:preview-viewport-mobile={previewViewport === 'mobile'}
		>
			{#if !isLoading}
				<header class="preview-toolbar">
					<div class="preview-toolbar-section preview-toolbar-profiles">
						<div class="preview-toolbar-section">
							<label class="preview-toolbar-label" for="preview-persona-select">Persona</label>
							<select
								id="preview-persona-select"
								class="preview-toolbar-select"
								value={selectedPersonaId}
								disabled={personas.length === 0}
								onchange={(e) => selectPersona(e.currentTarget.value)}
							>
								{#each personas as p (p.id)}
									<option value={p.id} title={p.label}>{personaChipLabel(p)}</option>
								{/each}
							</select>
						</div>

						<div class="preview-actions" class:open={previewActionsOpen}>
							<button
								type="button"
								class="preview-actions-btn"
								aria-haspopup="menu"
								aria-expanded={previewActionsOpen}
								aria-label="Preview data actions"
								disabled={personas.length === 0}
								onclick={(e) => {
									e.stopPropagation();
									previewActionsOpen = !previewActionsOpen;
								}}
							>
								<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
									<circle cx="7" cy="3" r="1" fill="currentColor" />
									<circle cx="7" cy="7" r="1" fill="currentColor" />
									<circle cx="7" cy="11" r="1" fill="currentColor" />
								</svg>
							</button>
							{#if previewActionsOpen}
								<ul class="preview-actions-menu" role="menu" onclick={stopEventPropagation} onkeydown={stopEventPropagation}>
									<li role="none">
										<button
											type="button"
											class="preview-actions-item"
											role="menuitem"
											onclick={openPreviewManager}
										>
											Manage
										</button>
									</li>
								</ul>
							{/if}
						</div>
					</div>

					<div class="preview-toolbar-spacer"></div>

					<div class="preview-toolbar-section preview-toolbar-controls">
						<div class="preview-icon-toggle-group" role="group" aria-label="Preview viewport">
							<button
								type="button"
								class="preview-icon-toggle"
								class:pressed={previewViewport === 'desktop'}
								aria-pressed={previewViewport === 'desktop'}
								title="Desktop width (600px)"
								onclick={() => setPreviewViewport('desktop')}
							>
								<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
									<rect
										x="1.5"
										y="3"
										width="11"
										height="8"
										rx="1"
										stroke="currentColor"
										stroke-width="1.25"
									/>
								</svg>
							</button>
							<button
								type="button"
								class="preview-icon-toggle"
								class:pressed={previewViewport === 'mobile'}
								aria-pressed={previewViewport === 'mobile'}
								title="Mobile width (375px)"
								onclick={() => setPreviewViewport('mobile')}
							>
								<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
									<rect
										x="4"
										y="1.5"
										width="6"
										height="11"
										rx="1"
										stroke="currentColor"
										stroke-width="1.25"
									/>
								</svg>
							</button>
						</div>

						<div class="preview-icon-toggle-group" role="group" aria-label="Preview background">
							<button
								type="button"
								class="preview-icon-toggle"
								class:pressed={previewChrome === 'light'}
								aria-pressed={previewChrome === 'light'}
								title="Light mode — typical webmail + light prefers-color-scheme"
								onclick={() => setPreviewChrome('light')}
							>
								<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
									<circle cx="7" cy="7" r="3" stroke="currentColor" stroke-width="1.25" />
									<path
										d="M7 1.5v1.25M7 11.25V12.5M1.5 7h1.25M11.25 7H12.5M3.4 3.4l.9.9M9.7 9.7l.9.9M10.6 3.4l-.9.9M4.3 9.7l-.9.9"
										stroke="currentColor"
										stroke-width="1.1"
										stroke-linecap="round"
									/>
								</svg>
							</button>
							<button
								type="button"
								class="preview-icon-toggle"
								class:pressed={previewChrome === 'dark'}
								aria-pressed={previewChrome === 'dark'}
								title="Dark mode — simulates prefers-color-scheme: dark in the email (not Outlook/Gmail-specific)"
								onclick={() => setPreviewChrome('dark')}
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</button>
						</div>

						{#if previewWarnings.length > 0}
							<button
								type="button"
								class="preview-warnings-badge"
								class:expanded={previewWarningsExpanded}
								aria-expanded={previewWarningsExpanded}
								title="Content validation issues"
								onclick={() => (previewWarningsExpanded = !previewWarningsExpanded)}
							>
								<svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
									<path
										d="M7 2.5 11.5 10.5H2.5L7 2.5z"
										stroke="currentColor"
										stroke-width="1.25"
										stroke-linejoin="round"
									/>
									<path
										d="M7 5.25v2.75M7 9.75h.01"
										stroke="currentColor"
										stroke-width="1.25"
										stroke-linecap="round"
									/>
								</svg>
								{previewWarnings.length}
								{previewWarnings.length === 1 ? 'issue' : 'issues'}
							</button>
						{/if}
					</div>
				</header>

				{#if previewWarningsExpanded && previewWarnings.length > 0}
					<div class="preview-warnings-panel" role="region" aria-label="Validation warnings">
						<ul class="preview-warnings-list">
							{#each previewWarnings as warning, i (i)}
								<li>{warning}</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/if}

			{#if isLoading}
				<div class="preview-loading">
					<div class="loading-dot"></div>
					<span>Loading…</span>
				</div>
			{:else}
				<div class="preview-stage" class:preview-stage-with-envelope={!!previewEnvelope}>
					<div
						class="preview-column"
						style:width="{previewViewport === 'mobile'
							? PREVIEW_MOBILE_WIDTH
							: PREVIEW_DESKTOP_WIDTH}px"
					>
						{#if previewEnvelope}
							<div
								class="preview-envelope"
								class:preview-envelope-warn={previewEnvelope.unresolved.length > 0}
								role="group"
								aria-label="Email envelope preview"
							>
								<p class="preview-envelope-subject" title={previewEnvelope.subject}>
									{previewEnvelope.subject || '—'}
								</p>
								<p class="preview-envelope-sender" title={previewEnvelope.from}>
									{previewEnvelope.from || '—'}
								</p>
								{#if previewEnvelope.preheader}
									<p class="preview-envelope-preheader" title={previewEnvelope.preheader}>
										{previewEnvelope.preheader}
									</p>
								{/if}
								{#if previewEnvelope.unresolved.length > 0}
									<p class="preview-envelope-hint">
										Unresolved:
										{previewEnvelope.unresolved.map((p) => `{{${p}}}`).join(', ')}
									</p>
								{/if}
							</div>
						{/if}
						<div class="preview-frame-shell">
							<iframe
								bind:this={iframeEl}
								src={previewUrl}
								title="Email preview"
								allow="same-origin"
								scrolling="no"
								class="preview-iframe"
								onload={onPreviewIframeLoad}
							></iframe>
						</div>
					</div>
				</div>
			{/if}
		</main>
	</div>
</div>

<!-- Add-component context menu (fixed-positioned) -->
<PreviewProfilesManager
	open={previewManagerOpen}
	personas={personas}
	selectedPersonaId={selectedPersonaId}
	onclose={() => (previewManagerOpen = false)}
	onpersonaschange={handlePersonasChange}
/>

{#if !isStandalone}
<TemplateFieldsManager
	open={templateFieldsManagerOpen}
	campaignId={campaignId}
	templateId={selectedTemplateId}
	authorUrl={$page.data.aem.authorUrl}
	cfEditorTenant={$page.data.aem.cfEditorTenant}
	onclose={() => (templateFieldsManagerOpen = false)}
/>
{/if}

{#if ajoErrorDialogOpen}
	<div class="persona-dialog-layer" role="presentation">
		<button
			type="button"
			class="persona-dialog-backdrop"
			aria-label="Close dialog"
			onclick={closeAjoErrorDialog}
		></button>
		<div
			class="persona-dialog ajo-error-dialog"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			aria-labelledby="ajo-error-dialog-title"
		>
			<header class="persona-dialog-header">
				<div>
					<h2 id="ajo-error-dialog-title" class="persona-dialog-title">AJO send failed</h2>
					<p class="persona-dialog-subtitle">Full response from the AJO API — select or copy below</p>
				</div>
				<div class="dialog-header-actions">
					<button
						type="button"
						class="persona-dialog-icon-btn"
						class:done={ajoErrorCopyStatus === 'done'}
						onclick={copyAjoErrorDialog}
						title="Copy to clipboard"
						aria-label={ajoErrorCopyStatus === 'done' ? 'Copied' : 'Copy to clipboard'}
					>
						{#if ajoErrorCopyStatus === 'done'}
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
								<path
									d="M2.5 7.25 5.5 10.25 11.5 3.75"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						{:else}
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
								<rect
									x="4.5"
									y="4.5"
									width="7"
									height="7"
									rx="1"
									stroke="currentColor"
									stroke-width="1.25"
								/>
								<path
									d="M3 9.5V3.5a1 1 0 0 1 1-1H9"
									stroke="currentColor"
									stroke-width="1.25"
									stroke-linecap="round"
								/>
							</svg>
						{/if}
					</button>
					<button
						type="button"
						class="persona-dialog-close"
						onclick={closeAjoErrorDialog}
						aria-label="Close"
					>
						×
					</button>
				</div>
			</header>

			<textarea
				class="ajo-error-detail"
				readonly
				value={ajoErrorDialogText}
				spellcheck={false}
				aria-label="AJO error details"
			></textarea>

			<footer class="persona-dialog-footer">
				<button type="button" class="btn-create" onclick={closeAjoErrorDialog}>OK</button>
			</footer>
		</div>
	</div>
{/if}

{#if addMenuNode}
	<div class="add-menu" style:left={`${addMenuNode.x}px`} style:top={`${addMenuNode.y}px`}>
		<div class="add-menu-title">Add to &lt;{addMenuNode.node.tag}&gt;</div>
		{#each CHILD_COMPONENTS[addMenuNode.node.tag] ?? [] as opt}
			<button
				class="add-menu-item"
				onclick={() => insertChildComponent(addMenuNode!.node, opt.snippet)}
			>
				<span class="add-menu-tag">&lt;{opt.tag}&gt;</span>
				<span class="add-menu-label">{opt.label}</span>
			</button>
		{/each}
	</div>
{/if}

<style>
	/* ── Layout ─────────────────────────────────────────────────────────────── */
	.editor-layout {
		height: 100vh;
		background: #fafafa;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* ── Topbar ──────────────────────────────────────────────────────────────── */
	.topbar {
		position: sticky;
		top: 0;
		z-index: 200;
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
		transition: color 0.1s;
	}
	.back-link:hover {
		color: #fff;
	}

	.topbar-divider {
		width: 1px;
		height: 14px;
		background: rgba(255, 255, 255, 0.1);
		flex-shrink: 0;
	}

	.campaign-name {
		font-size: 13px;
		font-weight: 500;
		color: #e4e4e7;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 300px;
	}

	.sync-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 11px;
		font-weight: 500;
		padding: 5px 10px;
		border-radius: 6px;
		letter-spacing: 0.1px;
		flex-shrink: 0;
	}

	.sync-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.sync-never-pushed {
		background: rgba(255, 255, 255, 0.06);
		color: #a1a1aa;
	}

	.sync-never-pushed .sync-dot {
		background: #71717a;
	}

	.sync-synced {
		background: rgba(74, 222, 128, 0.12);
		color: #86efac;
	}

	.sync-synced .sync-dot {
		background: #4ade80;
	}

	.sync-stale {
		background: rgba(251, 146, 60, 0.14);
		color: #fdba74;
	}

	.sync-stale .sync-dot {
		background: #fb923c;
	}

	.author-links {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}

	.open-cf-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		font-weight: 500;
		color: #a1a1aa;
		text-decoration: none;
		padding: 5px 8px;
		border-radius: 6px;
		border: none;
		white-space: nowrap;
		flex-shrink: 0;
		transition:
			color 0.12s,
			background 0.12s;
	}
	.open-cf-link:hover {
		color: #e4e4e7;
		background: rgba(255, 255, 255, 0.08);
	}

	.topbar-spacer {
		flex: 1;
	}

	.ajo-group {
		display: flex;
		align-items: center;
		gap: 14px;
		flex-shrink: 0;
	}

	.ajo-html-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.ajo-html-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border-radius: 6px;
		border: none;
		background: transparent;
		color: #a1a1aa;
		cursor: pointer;
		flex-shrink: 0;
		transition:
			color 0.12s,
			background 0.12s;
	}

	.ajo-html-btn:hover:not(:disabled) {
		color: #e4e4e7;
		background: rgba(255, 255, 255, 0.08);
	}

	.ajo-html-btn:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.ajo-html-btn.loading {
		opacity: 0.55;
	}

	.ajo-html-btn.done {
		color: #4ade80;
		background: rgba(74, 222, 128, 0.12);
	}

	.ajo-html-btn.error {
		color: #fca5a5;
		background: rgba(248, 113, 113, 0.12);
	}

	.ajo-push-group {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.ajo-actions {
		position: relative;
		flex-shrink: 0;
	}

	.ajo-actions-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: #fff;
		cursor: pointer;
		flex-shrink: 0;
		transition:
			color 0.12s,
			background 0.12s;
	}

	.ajo-actions-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
	}

	.ajo-actions-btn:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.ajo-actions-menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: 60;
		margin: 0;
		padding: 6px;
		list-style: none;
		background: #fff;
		border-radius: 10px;
		box-shadow:
			0 2px 8px rgba(0, 0, 0, 0.06),
			0 12px 32px rgba(0, 0, 0, 0.1);
		min-width: 188px;
		white-space: nowrap;
	}

	.ajo-actions-item {
		display: block;
		width: 100%;
		padding: 8px 10px;
		border: none;
		border-radius: 6px;
		background: transparent;
		text-align: left;
		font-size: 13px;
		font-weight: 500;
		color: #18181b;
		cursor: pointer;
	}

	.ajo-actions-item:hover:not(:disabled) {
		background: #f4f4f5;
	}

	.ajo-actions-item:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.export-btn {
		background: #5b5bd6;
		color: #fff;
		border: none;
		border-radius: 8px;
		padding: 7px 14px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		letter-spacing: 0.1px;
		transition:
			background 0.12s,
			transform 0.12s;
	}
	.export-btn:hover:not(:disabled) {
		background: #6d6ce0;
	}
	.export-btn:active:not(:disabled) {
		transform: scale(0.98);
	}
	.export-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.export-btn.loading {
		background: #444;
	}
	.export-btn.done {
		background: #16a34a;
	}
	.export-btn.error {
		background: #dc2626;
	}
	.export-success-hint {
		font-size: 11px;
		color: #16a34a;
		max-width: 280px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.export-error-hint {
		font-size: 11px;
		color: #dc2626;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	button.export-error-hint {
		border: none;
		padding: 0;
		margin: 0;
		background: none;
		font: inherit;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	button.export-error-hint:hover {
		color: #b91c1c;
	}

	/* ── Panels ──────────────────────────────────────────────────────────────── */
	.panels {
		display: flex;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.panels.resizing {
		cursor: col-resize;
		user-select: none;
	}

	.panels.resizing .left-panel,
	.panels.resizing .preview-area {
		pointer-events: none;
	}

	/* ── Left panel ──────────────────────────────────────────────────────────── */
	.left-panel {
		flex: 0 0 auto;
		align-self: stretch;
		background: #fff;
		border-right: none;
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
	}

	.panel-resize-handle {
		flex: 0 0 auto;
		align-self: stretch;
		width: 5px;
		margin-left: -2px;
		margin-right: -2px;
		padding: 0;
		border: none;
		cursor: col-resize;
		background: transparent;
		position: relative;
		z-index: 10;
		touch-action: none;
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
		transition: background 0.1s, width 0.1s;
	}

	.panel-resize-handle:hover::after,
	.panel-resize-handle:focus-visible::after,
	.panels.resizing .panel-resize-handle::after {
		width: 3px;
		background: #5b5bd6;
	}

	.panel-resize-handle:focus-visible {
		outline: none;
	}

	/* Template picker */
	.picker-bar {
		padding: 8px 12px;
		border-bottom: 1px solid #f0f0f1;
		flex-shrink: 0;
		position: relative;
		z-index: 30;
		background: #fff;
	}

	.picker-row {
		display: flex;
		gap: 6px;
		align-items: center;
		min-width: 0;
	}

	.dropdown {
		position: relative;
		flex: 1;
		min-width: 0;
	}

	.dropdown-compact {
		flex: 1;
		min-width: 0;
	}

	.dropdown-version {
		flex: 0 0 88px;
		max-width: 108px;
	}

	.dropdown-trigger {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		height: 36px;
		padding: 0 10px 0 12px;
		border: none;
		border-radius: 8px;
		background: #f4f4f5;
		color: #111;
		font-size: 13px;
		text-align: left;
		cursor: pointer;
		outline: none;
		transition: background 0.12s, color 0.12s;
	}

	.dropdown-trigger-compact {
		height: 30px;
		padding: 0 8px;
		font-size: 12px;
		border-radius: 6px;
		background: transparent;
	}

	.dropdown-trigger-compact:hover:not(:disabled) {
		background: rgba(0, 0, 0, 0.04);
	}

	.dropdown-trigger-compact:focus-visible,
	.dropdown.open .dropdown-trigger-compact {
		background: rgba(0, 0, 0, 0.04);
		box-shadow: none;
	}

	.dropdown-trigger:hover:not(:disabled) {
		background: #ececed;
	}

	.dropdown-trigger:focus-visible,
	.dropdown.open .dropdown-trigger:not(.dropdown-trigger-compact) {
		background: #ececed;
		box-shadow: inset 0 0 0 1px #d4d4d8;
	}

	.dropdown-trigger:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.dropdown-trigger.placeholder .dropdown-primary {
		color: #a1a1aa;
	}

	.dropdown-value {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: baseline;
		gap: 8px;
		overflow: hidden;
	}

	.dropdown-primary {
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.dropdown-chevron {
		flex-shrink: 0;
		color: #71717a;
		transition: transform 0.15s ease;
	}

	.dropdown.open .dropdown-chevron {
		transform: rotate(180deg);
	}

	.dropdown-option-compact {
		padding: 6px 10px;
		gap: 6px;
	}

	.dropdown-option-compact .dropdown-option-primary {
		font-size: 12px;
	}

	.dropdown-option-tag {
		margin-left: auto;
		font-size: 10px;
		font-weight: 500;
		color: #a1a1aa;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.dropdown-option-danger {
		color: #dc2626;
	}

	.dropdown-option-danger:hover:not(:disabled) {
		background: #fef2f2;
	}

	.dropdown-option-danger:disabled {
		color: #d4d4d8;
	}

	.template-actions {
		position: relative;
		flex-shrink: 0;
	}

	.template-actions-btn {
		width: 28px;
		min-width: 28px;
		flex-shrink: 0;
		padding: 0;
		justify-content: center;
		color: #71717a;
	}

	.template-actions-menu {
		left: auto;
		right: 0;
		width: max-content;
		min-width: 168px;
		max-width: min(240px, 90vw);
		white-space: nowrap;
	}

	.dropdown-version .dropdown-menu {
		left: 0;
		right: auto;
		width: max-content;
		min-width: 100%;
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		z-index: 60;
		margin: 0;
		padding: 6px;
		list-style: none;
		background: #fff;
		border: none;
		border-radius: 10px;
		box-shadow:
			0 2px 8px rgba(0, 0, 0, 0.06),
			0 12px 32px rgba(0, 0, 0, 0.1);
		max-height: 220px;
		overflow-y: auto;
	}

	.dropdown-option {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 8px 10px;
		border: none;
		border-radius: 6px;
		background: transparent;
		text-align: left;
		cursor: pointer;
		transition: background 0.08s;
	}

	.dropdown-option:hover {
		background: #f4f4f5;
	}

	.dropdown-option.selected {
		background: #ededfc;
	}

	.dropdown-option-muted {
		font-size: 12px;
		color: #71717a;
	}

	.dropdown-option-muted:hover:not(:disabled) {
		color: #3f3f46;
	}

	.dropdown-divider {
		height: 1px;
		margin: 4px 6px;
		background: #f0f0f1;
		list-style: none;
	}

	.dropdown-option.selected:hover {
		background: #e4e4fa;
	}

	.dropdown-option-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.dropdown-option-primary {
		font-size: 13px;
		font-weight: 500;
		color: #18181b;
		line-height: 1.2;
	}

	.dropdown-option.selected .dropdown-option-primary {
		color: #5b5bd6;
	}

	.dropdown-option-secondary {
		font-size: 11px;
		color: #a1a1aa;
		line-height: 1.2;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dropdown-option-secondary.mono {
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 10px;
	}

	.dropdown-option-check {
		flex-shrink: 0;
		color: #5b5bd6;
	}

	.picker-action-btn-compact {
		height: 30px;
		padding: 0 10px;
		font-size: 11px;
		border-radius: 6px;
		background: transparent;
		flex-shrink: 0;
	}

	.picker-action-btn-compact.accent {
		background: transparent;
		color: #5b5bd6;
	}

	.picker-action-btn-compact.accent:hover:not(:disabled) {
		background: rgba(91, 91, 214, 0.08);
		color: #4f4ec9;
	}

	.picker-action-btn {
		height: 36px;
		padding: 0 12px;
		border: none;
		border-radius: 8px;
		font-size: 12px;
		font-weight: 600;
		color: #52525b;
		background: transparent;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.12s, color 0.12s;
	}

	.picker-action-btn:hover:not(:disabled) {
		background: #f0f0f1;
		color: #18181b;
	}

	.picker-action-btn:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.picker-action-btn.accent {
		color: #5b5bd6;
		background: rgba(91, 91, 214, 0.1);
	}

	.picker-action-btn.accent:hover:not(:disabled) {
		background: rgba(91, 91, 214, 0.16);
		color: #4f4ec9;
	}

	/* Persona edit dialog */
	.persona-dialog-layer {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
	}

	.persona-dialog-backdrop {
		position: absolute;
		inset: 0;
		border: none;
		padding: 0;
		margin: 0;
		background: rgba(0, 0, 0, 0.4);
		cursor: default;
	}

	.persona-dialog {
		position: relative;
		z-index: 1;
		width: min(520px, 100%);
		max-height: min(640px, 100%);
		background: #fff;
		border-radius: 12px;
		box-shadow: 0 20px 48px rgba(0, 0, 0, 0.18);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.persona-dialog-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 16px 16px 12px;
		border-bottom: 1px solid #f4f4f5;
	}

	.persona-dialog-title {
		font-size: 15px;
		font-weight: 600;
		color: #111;
		margin: 0;
	}

	.persona-dialog-subtitle {
		font-size: 12px;
		color: #71717a;
		margin: 4px 0 0;
	}

	.persona-dialog-subtitle code {
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 11px;
		color: #5b5bd6;
	}

	.persona-dialog-close {
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

	.persona-dialog-close:hover {
		background: #f4f4f5;
		color: #111;
	}

	.dialog-header-actions {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.persona-dialog-icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: #71717a;
		cursor: pointer;
		transition:
			background 0.12s,
			color 0.12s;
	}

	.persona-dialog-icon-btn:hover {
		background: #f4f4f5;
		color: #111;
	}

	.persona-dialog-icon-btn.done {
		color: #16a34a;
	}

	.persona-dialog.ajo-error-dialog {
		width: min(720px, 100%);
		max-height: min(85vh, 100%);
	}

	.ajo-error-detail {
		flex: 1;
		min-height: 240px;
		max-height: 50vh;
		margin: 0;
		padding: 14px 16px;
		border: none;
		border-bottom: 1px solid #f4f4f5;
		outline: none;
		resize: vertical;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 11px;
		line-height: 1.5;
		color: #1a1a1a;
		background: #fafafa;
		white-space: pre;
		overflow: auto;
	}

	.persona-json-editor {
		flex: 1;
		min-height: 280px;
		margin: 0;
		padding: 14px 16px;
		border: none;
		border-bottom: 1px solid #f4f4f5;
		outline: none;
		resize: none;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 12px;
		line-height: 1.6;
		color: #1a1a1a;
		background: #fafafa;
		tab-size: 2;
	}

	.persona-dialog-error {
		padding: 8px 16px;
		font-size: 12px;
		color: #dc2626;
		background: #fef2f2;
		border-bottom: 1px solid #fecaca;
	}

	.persona-dialog-footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 12px 16px;
		background: #fafafa;
	}

	/* New template form */
	.new-form {
		padding: 10px 16px 12px;
		border-bottom: 1px solid #f4f4f5;
		background: #fafafe;
		flex-shrink: 0;
	}

	.new-form-input {
		width: 100%;
		height: 30px;
		border: 1px solid #e4e4e7;
		border-radius: 5px;
		padding: 0 10px;
		font-size: 13px;
		outline: none;
		box-sizing: border-box;
		transition: border-color 0.1s;
	}
	.new-form-input:focus {
		border-color: #5b5bd6;
	}

	.new-form-id {
		font-size: 11px;
		color: #71717a;
		margin-top: 4px;
	}
	.new-form-id code {
		font-family: 'SF Mono', 'Fira Code', monospace;
		color: #5b5bd6;
	}

	.new-form-actions {
		display: flex;
		gap: 6px;
		margin-top: 8px;
	}

	.btn-create {
		height: 28px;
		padding: 0 12px;
		background: #5b5bd6;
		color: #fff;
		border: none;
		border-radius: 5px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-create:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.btn-cancel {
		height: 28px;
		padding: 0 10px;
		background: transparent;
		color: #71717a;
		border: none;
		border-radius: 6px;
		font-size: 12px;
		cursor: pointer;
		transition: background 0.12s, color 0.12s;
	}
	.btn-cancel:hover {
		background: #f0f0f1;
		color: #3f3f46;
	}

	/* Tabs */
	.tab-bar {
		display: flex;
		align-items: stretch;
		border-bottom: 1px solid #e4e4e7;
		flex-shrink: 0;
		background: #fafafa;
	}

	.tab {
		flex: 1;
		height: 34px;
		border: none;
		background: transparent;
		font-size: 12px;
		font-weight: 500;
		color: #71717a;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		transition: color 0.1s, border-color 0.1s;
	}
	.tab:hover {
		color: #111;
	}
	.tab.active {
		color: #5b5bd6;
		border-bottom-color: #5b5bd6;
	}

	/* Panel content */
	.panel-content {
		flex: 1 1 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	/* Code tab */
	.editor-wrap {
		position: relative;
		flex: 1 1 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.mjml-docs-link {
		position: absolute;
		right: 14px;
		bottom: 2px;
		z-index: 5;
		font-size: 11px;
		font-weight: 500;
		color: rgba(113, 113, 122, 0.45);
		text-decoration: none;
		white-space: nowrap;
		padding: 4px 0;
		pointer-events: auto;
		transition: color 0.12s;
	}

	.mjml-docs-link:hover {
		color: #5b5bd6;
	}

	.cf-insert-wrap {
		position: absolute;
		right: 14px;
		top: 8px;
		z-index: 6;
	}

	.cf-insert-btn {
		padding: 0;
		border: none;
		background: transparent;
		font-size: 11px;
		font-weight: 500;
		color: rgba(113, 113, 122, 0.55);
		cursor: pointer;
		transition: color 0.12s;
	}

	.cf-insert-btn:hover {
		color: #5b5bd6;
	}

	.cf-insert-menu {
		position: absolute;
		right: 0;
		top: calc(100% + 6px);
		min-width: 220px;
		max-width: 320px;
		max-height: 240px;
		overflow: auto;
		padding: 4px;
		border: 1px solid #e4e4e7;
		border-radius: 8px;
		background: #fff;
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
	}

	.cf-insert-item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		width: 100%;
		padding: 6px 8px;
		border: none;
		border-radius: 5px;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}

	.cf-insert-item:hover {
		background: #f4f4f5;
	}

	.cf-insert-label {
		font-size: 12px;
		font-weight: 500;
		color: #18181b;
	}

	.cf-insert-token {
		font-size: 10px;
		color: #71717a;
	}

	.mjml-editor {
		flex: 1 1 0;
		min-height: 0;
	}

	.editor-error {
		padding: 20px 16px;
		font-size: 13px;
		color: #dc2626;
		background: #fff8f8;
	}

	.html-panel {
		position: relative;
	}

	.html-panel-hint {
		flex-shrink: 0;
		padding: 8px 16px;
		font-size: 11px;
		color: #71717a;
		background: #f4f4f5;
		border-bottom: 1px solid #e4e4e7;
	}

	.html-empty {
		padding: 24px 16px;
		font-size: 13px;
		color: #a1a1aa;
		text-align: center;
	}

	.html-output {
		color: #3f3f46;
		background: #fff;
		cursor: default;
	}

	/* Tree tab */
	.tree-view {
		flex: 1 1 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-height: 0;
	}

	.tree-scroll {
		flex: 1;
		overflow-y: auto;
		padding: 8px 0;
	}

	.tree-empty {
		padding: 24px 16px;
		font-size: 13px;
		color: #a1a1aa;
		text-align: center;
	}

	.tree-node {
		display: flex;
		align-items: center;
		gap: 4px;
		height: 26px;
		padding-right: 8px;
	}
	.tree-node:hover {
		background: #f4f4f5;
	}

	.collapse-btn {
		width: 16px;
		height: 16px;
		border: none;
		background: transparent;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: default;
		font-size: 9px;
		color: #a1a1aa;
		flex-shrink: 0;
	}
	.collapse-btn.has-children {
		cursor: pointer;
		color: #71717a;
	}
	.collapse-btn.has-children:hover {
		color: #111;
	}

	.node-tag {
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 11px;
		font-weight: 500;
		padding: 1px 6px;
		border-radius: 3px;
		flex-shrink: 0;
	}
	.node-structure {
		background: #ededfc;
		color: #5b5bd6;
	}
	.node-head {
		background: #e0f2fe;
		color: #0369a1;
	}
	.node-content {
		background: #dcfce7;
		color: #15803d;
	}

	.add-child-btn {
		margin-left: auto;
		width: 20px;
		height: 20px;
		border: 1px solid #e4e4e7;
		border-radius: 4px;
		background: #fff;
		color: #5b5bd6;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		opacity: 0;
		transition: opacity 0.1s;
	}
	.tree-node:hover .add-child-btn {
		opacity: 1;
	}
	.add-child-btn:hover {
		background: #ededfc;
		border-color: #5b5bd6;
	}

	/* Footer */
	.panel-footer {
		border-top: 1px solid #e4e4e7;
		background: #fafafa;
		flex-shrink: 0;
	}

	.footer-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		padding: 10px 16px;
	}

	.dirty-indicator {
		font-size: 10px;
		color: #f59e0b;
		flex-shrink: 0;
		line-height: 1;
	}

	.footer-hint {
		font-size: 11px;
		font-weight: 500;
		color: #16a34a;
		flex-shrink: 0;
	}

	.save-btn {
		height: 32px;
		padding: 0 16px;
		white-space: nowrap;
		background: #5b5bd6;
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.1s;
	}
	.save-btn:hover:not(:disabled) {
		background: #4f4ec9;
	}
	.save-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.save-btn.saving {
		background: #71717a;
	}
	.save-btn.saved {
		background: #16a34a;
	}
	.save-btn.save-error {
		background: #dc2626;
	}

	.dropdown-primary.mono {
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 11px;
	}

	/* ── Preview area ────────────────────────────────────────────────────────── */
	.preview-area {
		flex: 1;
		min-width: 0;
		background: #f4f4f5;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		transition: background 0.2s ease;
	}

	.preview-area.preview-chrome-dark {
		background: #18181b;
	}

	.preview-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 16px;
		padding: 8px 16px;
		flex-shrink: 0;
		border-bottom: 1px solid #e4e4e7;
		background: #fafafa;
	}

	.preview-chrome-dark .preview-toolbar {
		background: #27272a;
		border-bottom-color: #3f3f46;
	}

	.preview-toolbar-section {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.preview-toolbar-profiles {
		gap: 10px;
	}

	.preview-toolbar-controls {
		flex-wrap: wrap;
		gap: 8px;
	}

	.preview-toolbar-label {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #a1a1aa;
		user-select: none;
		flex-shrink: 0;
	}

	.preview-chrome-dark .preview-toolbar-label {
		color: #71717a;
	}

	.preview-toolbar-divider {
		width: 1px;
		height: 20px;
		background: #e4e4e7;
		flex-shrink: 0;
	}

	.preview-chrome-dark .preview-toolbar-divider {
		background: #3f3f46;
	}

	.preview-toolbar-spacer {
		flex: 1;
		min-width: 12px;
	}

	.preview-toolbar-select {
		max-width: 160px;
		padding: 2px 20px 2px 0;
		border: none;
		border-radius: 0;
		background: transparent;
		color: #3f3f46;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		outline: none;
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 14 14' fill='none'%3E%3Cpath d='M3.5 5.25 7 8.75l3.5-3.5' stroke='%2371717a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0 center;
	}

	.preview-chrome-dark .preview-toolbar-select {
		color: #e4e4e7;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 14 14' fill='none'%3E%3Cpath d='M3.5 5.25 7 8.75l3.5-3.5' stroke='%23a1a1aa' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
	}

	.preview-toolbar-select:focus-visible {
		color: #4338ca;
	}

	.preview-chrome-dark .preview-toolbar-select:focus-visible {
		color: #c7d2fe;
	}

	.preview-toolbar-select:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.preview-actions {
		position: relative;
		flex-shrink: 0;
	}

	.preview-actions-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: #71717a;
		cursor: pointer;
	}

	.preview-actions-btn:hover:not(:disabled) {
		background: rgba(0, 0, 0, 0.06);
		color: #3f3f46;
	}

	.preview-chrome-dark .preview-actions-btn {
		color: #a1a1aa;
	}

	.preview-chrome-dark .preview-actions-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
		color: #e4e4e7;
	}

	.preview-actions-btn:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.preview-actions-menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: 60;
		margin: 0;
		padding: 6px;
		list-style: none;
		background: #fff;
		border-radius: 10px;
		box-shadow:
			0 2px 8px rgba(0, 0, 0, 0.06),
			0 12px 32px rgba(0, 0, 0, 0.1);
		min-width: 168px;
		white-space: nowrap;
	}

	.preview-actions-item {
		display: block;
		width: 100%;
		padding: 8px 10px;
		border: none;
		border-radius: 6px;
		background: transparent;
		text-align: left;
		font-size: 13px;
		font-weight: 500;
		color: #18181b;
		cursor: pointer;
	}

	.preview-actions-item:hover {
		background: #f4f4f5;
	}

	.preview-icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		padding: 0;
		flex-shrink: 0;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: #a1a1aa;
		cursor: pointer;
	}

	.preview-icon-btn:hover:not(:disabled) {
		color: #52525b;
		background: #f0f0f1;
	}

	.preview-chrome-dark .preview-icon-btn:hover:not(:disabled) {
		color: #e4e4e7;
		background: #3f3f46;
	}

	.preview-icon-toggle-group {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}

	.preview-icon-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: #a1a1aa;
		cursor: pointer;
		transition:
			background 0.12s,
			color 0.12s;
	}

	.preview-icon-toggle svg {
		display: block;
		flex-shrink: 0;
		overflow: visible;
	}

	.preview-icon-toggle:hover {
		color: #52525b;
		background: #f0f0f1;
	}

	.preview-chrome-dark .preview-icon-toggle:hover {
		color: #e4e4e7;
		background: #3f3f46;
	}

	.preview-icon-toggle.pressed {
		color: #4338ca;
		background: #ededfc;
	}

	.preview-chrome-dark .preview-icon-toggle.pressed {
		color: #c7d2fe;
		background: #3f3f46;
	}

	.preview-warnings-badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 5px 10px;
		border: 1px solid #fecaca;
		border-radius: 7px;
		background: #fef2f2;
		color: #b91c1c;
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
	}

	.preview-warnings-badge.expanded {
		background: #fee2e2;
	}

	.preview-warnings-panel {
		flex-shrink: 0;
		padding: 8px 16px 10px;
		background: #fffbeb;
		border-bottom: 1px solid #fde68a;
	}

	.preview-chrome-dark .preview-warnings-panel {
		background: #422006;
		border-bottom-color: #92400e;
	}

	.preview-warnings-list {
		margin: 0;
		padding: 0 0 0 18px;
		font-size: 12px;
		line-height: 1.5;
		color: #92400e;
	}

	.preview-chrome-dark .preview-warnings-list {
		color: #fde68a;
	}

	.preview-warnings-list li + li {
		margin-top: 4px;
	}

	.preview-envelope {
		padding: 0 0 14px;
	}

	.preview-envelope-subject {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		line-height: 1.35;
		letter-spacing: -0.01em;
		color: #18181b;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.preview-chrome-dark .preview-envelope-subject {
		color: #fafafa;
	}

	.preview-envelope-sender {
		margin: 4px 0 0;
		font-size: 13px;
		line-height: 1.4;
		color: #52525b;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.preview-chrome-dark .preview-envelope-sender {
		color: #d4d4d8;
	}

	.preview-envelope-preheader {
		margin: 2px 0 0;
		font-size: 13px;
		line-height: 1.4;
		color: #a1a1aa;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.preview-chrome-dark .preview-envelope-preheader {
		color: #71717a;
	}

	.preview-envelope-warn .preview-envelope-subject,
	.preview-envelope-warn .preview-envelope-sender,
	.preview-envelope-warn .preview-envelope-preheader {
		color: #b45309;
	}

	.preview-chrome-dark .preview-envelope-warn .preview-envelope-subject,
	.preview-chrome-dark .preview-envelope-warn .preview-envelope-sender,
	.preview-chrome-dark .preview-envelope-warn .preview-envelope-preheader {
		color: #fbbf24;
	}

	.preview-envelope-hint {
		margin: 10px 0 0;
		font-size: 11px;
		line-height: 1.4;
		color: #b45309;
	}

	.preview-chrome-dark .preview-envelope-hint {
		color: #d97706;
	}

	.preview-loading {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		color: #a1a1aa;
		font-size: 13px;
	}

	.loading-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #5b5bd6;
		animation: pulse 1.2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.3;
			transform: scale(0.8);
		}
		50% {
			opacity: 1;
			transform: scale(1);
		}
	}

	.preview-stage {
		flex: 1;
		width: 100%;
		display: flex;
		justify-content: center;
		padding: 24px;
	}

	.preview-stage-with-envelope {
		padding-top: 20px;
	}

	.preview-column {
		max-width: 100%;
	}

	.preview-frame-shell {
		max-width: 100%;
		transition: width 0.2s ease;
	}

	.preview-iframe {
		display: block;
		width: 100%;
		height: 150px;
		overflow: hidden;
		border: none;
		background: #fff;
		border-radius: 4px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 24px rgba(0, 0, 0, 0.06);
	}

	.preview-chrome-dark .preview-iframe {
		box-shadow:
			0 1px 3px rgba(0, 0, 0, 0.3),
			0 4px 24px rgba(0, 0, 0, 0.25);
	}

	/* ── Add-component context menu ──────────────────────────────────────────── */
	.add-menu {
		position: fixed;
		z-index: 999;
		background: #fff;
		border: 1px solid #e4e4e7;
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
		min-width: 180px;
		padding: 4px;
		overflow: hidden;
	}

	.add-menu-title {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #a1a1aa;
		padding: 6px 10px 4px;
	}

	.add-menu-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 7px 10px;
		border: none;
		background: transparent;
		cursor: pointer;
		border-radius: 5px;
		text-align: left;
		transition: background 0.08s;
	}
	.add-menu-item:hover {
		background: #ededfc;
	}

	.add-menu-tag {
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 11px;
		color: #5b5bd6;
		font-weight: 500;
	}

	.add-menu-label {
		font-size: 12px;
		color: #3f3f46;
	}
</style>
