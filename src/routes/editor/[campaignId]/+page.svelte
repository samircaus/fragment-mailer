<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, tick } from 'svelte';
	import {
		type Persona,
		SAMPLE_PERSONAS,
		PERSONAS_STORAGE_KEY,
		mergeStoredPersonas,
		personaSubtitle,
		validatePersonaData
	} from '$lib/personas/samples.js';

	// ─── Types ──────────────────────────────────────────────────────────────────
	interface Campaign {
		id: string;
		name: string;
		templateId: string;
		cfPath: string;
		status: string;
	}

	interface TemplateInfo {
		id: string;
		name: string;
		version: string;
	}

	interface FlatNode {
		tag: string;
		depth: number;
		path: string;
		childCount: number;
		closingOccurrence: number;
	}

	// ─── State ──────────────────────────────────────────────────────────────────
	const campaignId = $derived($page.params.campaignId);

	let campaign = $state<Campaign | null>(null);
	let isLoading = $state(true);

	// Template
	let templates = $state<TemplateInfo[]>([]);
	let selectedTemplateId = $state('');
	let mjmlCode = $state('');
	let isDirty = $state(false);
	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let templateLoadError = $state('');

	// Template picker
	let templatePickerOpen = $state(false);

	// Persona picker
	let personas = $state<Persona[]>([]);
	let personaPickerOpen = $state(false);
	let personaEditOpen = $state(false);
	let personaEditJson = $state('');
	let personaEditError = $state('');
	const COMPANY_OPTIONS = ['Acme Corp', 'Globex Corporation', 'Wayne Enterprises', 'Stark Industries'];
	let selectedCompanyName = $state(COMPANY_OPTIONS[0]);
	let companyPickerOpen = $state(false);

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
	const LEFT_PANEL_MAX = 720;
	const LEFT_PANEL_DEFAULT = 480;

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
	let selectedPersonaId = $state('persona-1');
	let iframeKey = $state(0);
	let iframeEl = $state<HTMLIFrameElement | null>(null);
	let exportStatus = $state<'idle' | 'exporting' | 'done' | 'error'>('idle');
	let ajoExportStatus = $state<'idle' | 'exporting' | 'done' | 'error'>('idle');
	let ajoExportMessage = $state('');
	let exportCfMode = $state<'preserve-refs' | 'baked-content'>('preserve-refs');

	const AJO_TEMPLATE_ID_KEY = 'fm-ajo-template-id';

	// Textarea ref (for Tab/cursor handling)
	let textareaEl = $state<HTMLTextAreaElement | null>(null);

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
				leftPanelWidth = Math.min(LEFT_PANEL_MAX, Math.max(LEFT_PANEL_MIN, parsed));
			}
		}

		const storedPersonas = localStorage.getItem(PERSONAS_STORAGE_KEY);
		if (storedPersonas) {
			try {
				personas = mergeStoredPersonas(JSON.parse(storedPersonas) as Persona[]);
			} catch {
				personas = JSON.parse(JSON.stringify(SAMPLE_PERSONAS)) as Persona[];
			}
		} else {
			personas = JSON.parse(JSON.stringify(SAMPLE_PERSONAS)) as Persona[];
		}

		await Promise.all([loadCampaign(), loadTemplates()]);
	});

	function startPanelResize(e: MouseEvent) {
		e.preventDefault();
		const startX = e.clientX;
		const startWidth = leftPanelWidth;
		isResizingPanel = true;

		function onMove(moveEvent: MouseEvent) {
			leftPanelWidth = Math.min(
				LEFT_PANEL_MAX,
				Math.max(LEFT_PANEL_MIN, startWidth + (moveEvent.clientX - startX))
			);
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
		const id = campaignId;
		const templateId = selectedTemplateId;
		const personaId = selectedPersonaId;
		const company = selectedCompanyName;
		const persona = selectedPersona;

		if (tab !== 'html' || !id || !templateId || !mjml.trim()) {
			return;
		}

		htmlCompileStatus = 'loading';
		htmlCompileError = '';

		const timer = setTimeout(() => {
			const requestId = ++htmlCompileRequestId;
			void compileHtmlPreview(mjml, id, templateId, personaId, company, persona, requestId);
		}, 400);

		return () => clearTimeout(timer);
	});

	// ─── Data loading ────────────────────────────────────────────────────────────
	async function loadCampaign() {
		isLoading = true;
		try {
			const res = await fetch(`/api/campaigns/${campaignId}`);
			if (!res.ok) throw new Error(`${res.status}`);
			const data = (await res.json()) as { campaign: Campaign };
			campaign = data.campaign;
			if (data.campaign.templateId && !selectedTemplateId) {
				selectedTemplateId = data.campaign.templateId;
			}
		} catch (err) {
			console.error('Failed to load campaign:', err);
		} finally {
			isLoading = false;
		}
	}

	async function loadTemplates() {
		try {
			const res = await fetch('/api/templates');
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
		companyName: string,
		persona: Persona | null | undefined,
		requestId: number
	) {
		try {
			const res = await fetch('/api/compile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mjml,
					campaignId: id,
					templateId,
					personaId,
					companyName,
					persona: persona ?? undefined
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

	async function handleCreateTemplate() {
		if (!newTemplateId || !newTemplateName || newTemplateCreating) return;
		newTemplateCreating = true;
		try {
			const res = await fetch('/api/templates', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: newTemplateId, name: newTemplateName })
			});
			if (!res.ok) throw new Error(`${res.status}`);
			await loadTemplates();
			selectedTemplateId = newTemplateId;
			showNewForm = false;
			newTemplateName = '';
		} catch (err) {
			console.error('Failed to create template:', err);
		} finally {
			newTemplateCreating = false;
		}
	}

	async function handleTextareaKeydown(e: KeyboardEvent) {
		if (e.key === 'Tab') {
			e.preventDefault();
			const el = e.currentTarget as HTMLTextAreaElement;
			const start = el.selectionStart;
			const end = el.selectionEnd;
			mjmlCode = mjmlCode.slice(0, start) + '  ' + mjmlCode.slice(end);
			isDirty = true;
			await tick();
			el.setSelectionRange(start + 2, start + 2);
		} else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
			e.preventDefault();
			await handleSave();
		}
	}

	async function handleExport() {
		if (!campaignId) return;
		exportStatus = 'exporting';
		try {
			const params = new URLSearchParams({
				campaignId,
				personaId: selectedPersonaId,
				companyName: selectedCompanyName,
				cfMode: exportCfMode
			});
			const res = await fetch(`/api/export?${params.toString()}`);
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
		} catch {
			exportStatus = 'error';
			setTimeout(() => (exportStatus = 'idle'), 3000);
		}
	}

	function storedAjoTemplateId(): string | undefined {
		if (!campaignId || typeof localStorage === 'undefined') return undefined;
		try {
			const raw = localStorage.getItem(AJO_TEMPLATE_ID_KEY);
			if (!raw) return undefined;
			const map = JSON.parse(raw) as Record<string, string>;
			return map[campaignId];
		} catch {
			return undefined;
		}
	}

	function saveAjoTemplateId(templateId: string) {
		if (!campaignId || typeof localStorage === 'undefined') return;
		try {
			const raw = localStorage.getItem(AJO_TEMPLATE_ID_KEY);
			const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
			map[campaignId] = templateId;
			localStorage.setItem(AJO_TEMPLATE_ID_KEY, JSON.stringify(map));
		} catch {
			// ignore quota / private mode
		}
	}

	async function handleAjoHtmlExport() {
		if (!campaignId) return;
		ajoExportStatus = 'exporting';
		ajoExportMessage = '';
		try {
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
			const blob = new Blob([payload.html], { type: 'text/html;charset=utf-8' });
			const downloadUrl = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = downloadUrl;
			a.download = `${campaignId}-ajo.html`;
			a.click();
			URL.revokeObjectURL(downloadUrl);
			ajoExportStatus = 'done';
			setTimeout(() => (ajoExportStatus = 'idle'), 3000);
		} catch (e) {
			ajoExportMessage = e instanceof Error ? e.message : 'Export failed';
			ajoExportStatus = 'error';
			setTimeout(() => (ajoExportStatus = 'idle'), 5000);
		}
	}

	async function handleAjoPush() {
		if (!campaignId) return;
		ajoExportStatus = 'exporting';
		ajoExportMessage = '';
		try {
			const ajoTemplateId = storedAjoTemplateId();
			const res = await fetch(`/api/export/ajo?campaignId=${encodeURIComponent(campaignId)}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					push: true,
					mjml: mjmlCode,
					templateName: campaign?.name ?? campaignId,
					ajoTemplateId
				})
			});
			const data = (await res.json()) as {
				ok?: boolean;
				templateId?: string;
				message?: string;
				validationErrors?: Array<{ message: string }>;
			};
			if (!res.ok || !data.ok) {
				const details = Array.isArray(data.validationErrors)
					? data.validationErrors.map((e) => e.message).join('; ')
					: (data.message ?? `Push failed: ${res.status}`);
				throw new Error(details);
			}
			if (data.templateId) saveAjoTemplateId(data.templateId);
			ajoExportMessage = data.templateId ? `Template ${data.templateId}` : 'Pushed';
			ajoExportStatus = 'done';
			setTimeout(() => (ajoExportStatus = 'idle'), 4000);
		} catch (e) {
			ajoExportMessage = e instanceof Error ? e.message : 'Push failed';
			ajoExportStatus = 'error';
			setTimeout(() => (ajoExportStatus = 'idle'), 5000);
		}
	}

	function fitIframe() {
		if (!iframeEl?.contentDocument) return;
		const body = iframeEl.contentDocument.body;
		if (!body) return;
		iframeEl.style.height = body.scrollHeight + 'px';
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
		await tick();
		const el = textareaEl;
		if (!el) return;
		el.focus();
		el.setSelectionRange(position, position);
		const lineNumber = mjmlCode.slice(0, position).split('\n').length - 1;
		const lineHeight = Number.parseInt(getComputedStyle(el).lineHeight, 10) || 20;
		el.scrollTop = Math.max(0, lineNumber * lineHeight - el.clientHeight / 2);
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

	function selectTemplate(id: string) {
		selectedTemplateId = id;
		templatePickerOpen = false;
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

	function persistPersonas() {
		localStorage.setItem(PERSONAS_STORAGE_KEY, JSON.stringify(personas));
	}

	function selectPersona(id: string) {
		selectedPersonaId = id;
		personaPickerOpen = false;
		iframeKey += 1;
	}

	function selectCompany(companyName: string) {
		selectedCompanyName = companyName;
		companyPickerOpen = false;
		iframeKey += 1;
	}

	function openPersonaEdit() {
		const persona = personas.find((p) => p.id === selectedPersonaId);
		if (!persona) return;
		personaPickerOpen = false;
		personaEditError = '';
		const { id: _id, ...editable } = persona;
		personaEditJson = JSON.stringify(editable, null, 2);
		personaEditOpen = true;
	}

	function closePersonaEdit() {
		personaEditOpen = false;
		personaEditError = '';
	}

	function savePersonaEdit() {
		personaEditError = '';
		let parsed: unknown;
		try {
			parsed = JSON.parse(personaEditJson);
		} catch {
			personaEditError = 'Invalid JSON syntax';
			return;
		}

		const result = validatePersonaData(parsed, selectedPersonaId);
		if (!result.ok) {
			personaEditError = result.error;
			return;
		}

		personas = personas.map((p) => (p.id === selectedPersonaId ? result.persona : p));
		persistPersonas();
		personaEditOpen = false;
		iframeKey += 1;
	}

	// ─── Derived ─────────────────────────────────────────────────────────────────
	const selectedTemplate = $derived(templates.find((t) => t.id === selectedTemplateId) ?? null);
	const selectedPersona = $derived(personas.find((p) => p.id === selectedPersonaId) ?? null);

	const previewUrl = $derived.by(() => {
		const params = new URLSearchParams({
			templateId: selectedTemplateId || 'promo',
			personaId: selectedPersonaId,
			companyName: selectedCompanyName,
			t: String(iframeKey)
		});
		if (selectedPersona) {
			params.set('persona', JSON.stringify(selectedPersona));
		}
		return `/preview/${campaignId}?${params}`;
	});
</script>

<!-- Close floating menus on outside click -->
<svelte:window
	onclick={(e) => {
		const target = e.target;
		if (target instanceof Element && target.closest('.add-menu, .add-child-btn')) return;
		addMenuNode = null;
		templatePickerOpen = false;
		personaPickerOpen = false;
		companyPickerOpen = false;
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape' && personaEditOpen) {
			closePersonaEdit();
		}
	}}
/>

<div class="editor-layout">
	<!-- ─── Topbar ─────────────────────────────────────────────────────────── -->
	<header class="topbar">
		<a href="/" class="back-link">
			<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
				<path
					d="M9 11L5 7l4-4"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			Campaigns
		</a>
		<div class="topbar-divider"></div>
		<div class="campaign-name">{campaign?.name ?? campaignId}</div>
		<div class="topbar-spacer"></div>
		<label class="export-mode">
			<span>CF mode</span>
			<select bind:value={exportCfMode} disabled={exportStatus === 'exporting'}>
				<option value="preserve-refs">Preserve refs</option>
				<option value="baked-content">Baked content</option>
			</select>
		</label>
		<button
			class="export-btn secondary"
			class:loading={ajoExportStatus === 'exporting'}
			class:done={ajoExportStatus === 'done'}
			class:error={ajoExportStatus === 'error'}
			onclick={handleAjoHtmlExport}
			disabled={ajoExportStatus === 'exporting' || exportStatus === 'exporting'}
			title="Download AJO-ready HTML with let/fragment bindings"
		>
			{#if ajoExportStatus === 'exporting'}AJO…
			{:else if ajoExportStatus === 'done'}HTML ✓
			{:else if ajoExportStatus === 'error'}AJO failed
			{:else}AJO HTML{/if}
		</button>
		<button
			class="export-btn"
			class:loading={ajoExportStatus === 'exporting'}
			onclick={handleAjoPush}
			disabled={ajoExportStatus === 'exporting' || exportStatus === 'exporting'}
			title="Push to AJO Content Templates API"
		>
			Push AJO
		</button>
		<button
			class="export-btn secondary"
			class:loading={exportStatus === 'exporting'}
			class:done={exportStatus === 'done'}
			class:error={exportStatus === 'error'}
			onclick={handleExport}
			disabled={exportStatus === 'exporting' || ajoExportStatus === 'exporting'}
		>
			{#if exportStatus === 'exporting'}Exporting…
			{:else if exportStatus === 'done'}Exported ✓
			{:else if exportStatus === 'error'}Export failed
			{:else}Manifest export{/if}
		</button>
		{#if ajoExportMessage && ajoExportStatus === 'error'}
			<span class="export-error-hint" title={ajoExportMessage}>{ajoExportMessage}</span>
		{/if}
	</header>

	<div class="panels" class:resizing={isResizingPanel}>
		<!-- ─── Left panel ──────────────────────────────────────────────────── -->
		<aside class="left-panel" style:width={`${leftPanelWidth}px`}>
			<!-- Template & persona pickers -->
			<div class="picker-bar">
				<div class="picker-section">
					<div class="picker-label">Template</div>
					<div class="picker-controls">
						<div class="dropdown" class:open={templatePickerOpen}>
							<button
								type="button"
								class="dropdown-trigger"
								class:placeholder={!selectedTemplate && templates.length > 0}
								aria-haspopup="listbox"
								aria-expanded={templatePickerOpen}
								disabled={templates.length === 0}
								onclick={(e) => {
									e.stopPropagation();
									personaPickerOpen = false;
									companyPickerOpen = false;
									templatePickerOpen = !templatePickerOpen;
								}}
								onkeydown={(e) =>
									handleDropdownKeydown(e, templatePickerOpen, (open) => (templatePickerOpen = open))}
							>
								<span class="dropdown-value">
									{#if templates.length === 0}
										<span class="dropdown-primary">Loading templates…</span>
									{:else if selectedTemplate}
										<span class="dropdown-primary">{selectedTemplate.name}</span>
										<span class="dropdown-meta">v{selectedTemplate.version}</span>
									{:else}
										<span class="dropdown-primary">Select template…</span>
									{/if}
								</span>
								<svg
									class="dropdown-chevron"
									width="14"
									height="14"
									viewBox="0 0 14 14"
									fill="none"
									aria-hidden="true"
								>
									<path
										d="M3.5 5.25 7 8.75l3.5-3.5"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</button>

							{#if templatePickerOpen && templates.length > 0}
								<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
								<ul class="dropdown-menu" role="listbox" onclick={(e) => e.stopPropagation()}>
									{#each templates as t (t.id)}
										<li role="none">
											<button
												type="button"
												class="dropdown-option"
												class:selected={selectedTemplateId === t.id}
												role="option"
												aria-selected={selectedTemplateId === t.id}
												onclick={() => selectTemplate(t.id)}
											>
												<span class="dropdown-option-body">
													<span class="dropdown-option-primary">{t.name}</span>
													<span class="dropdown-option-secondary mono">{t.id}</span>
												</span>
												{#if selectedTemplateId === t.id}
													<svg
														class="dropdown-option-check"
														width="14"
														height="14"
														viewBox="0 0 14 14"
														fill="none"
														aria-hidden="true"
													>
														<path
															d="M2.5 7.25 5.5 10.25 11.5 3.75"
															stroke="currentColor"
															stroke-width="1.5"
															stroke-linecap="round"
															stroke-linejoin="round"
														/>
													</svg>
												{/if}
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
						<button
							class="picker-action-btn accent"
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

				<div class="picker-section">
					<div class="picker-label">Persona</div>
					<div class="picker-controls">
						<div class="dropdown" class:open={personaPickerOpen}>
							<button
								type="button"
								class="dropdown-trigger"
								class:placeholder={!selectedPersona}
								aria-haspopup="listbox"
								aria-expanded={personaPickerOpen}
								disabled={personas.length === 0}
								onclick={(e) => {
									e.stopPropagation();
									templatePickerOpen = false;
									companyPickerOpen = false;
									personaPickerOpen = !personaPickerOpen;
								}}
								onkeydown={(e) =>
									handleDropdownKeydown(e, personaPickerOpen, (open) => (personaPickerOpen = open))}
							>
								<span class="dropdown-value">
									{#if selectedPersona}
										<span class="dropdown-primary">{selectedPersona.label}</span>
										<span class="dropdown-meta">{personaSubtitle(selectedPersona)}</span>
									{:else}
										<span class="dropdown-primary">Select persona…</span>
									{/if}
								</span>
								<svg
									class="dropdown-chevron"
									width="14"
									height="14"
									viewBox="0 0 14 14"
									fill="none"
									aria-hidden="true"
								>
									<path
										d="M3.5 5.25 7 8.75l3.5-3.5"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</button>

							{#if personaPickerOpen && personas.length > 0}
								<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
								<ul class="dropdown-menu" role="listbox" onclick={(e) => e.stopPropagation()}>
									{#each personas as p (p.id)}
										<li role="none">
											<button
												type="button"
												class="dropdown-option"
												class:selected={selectedPersonaId === p.id}
												role="option"
												aria-selected={selectedPersonaId === p.id}
												onclick={() => selectPersona(p.id)}
											>
												<span class="dropdown-option-body">
													<span class="dropdown-option-primary">{p.label}</span>
													<span class="dropdown-option-secondary">{personaSubtitle(p)}</span>
												</span>
												{#if selectedPersonaId === p.id}
													<svg
														class="dropdown-option-check"
														width="14"
														height="14"
														viewBox="0 0 14 14"
														fill="none"
														aria-hidden="true"
													>
														<path
															d="M2.5 7.25 5.5 10.25 11.5 3.75"
															stroke="currentColor"
															stroke-width="1.5"
															stroke-linecap="round"
															stroke-linejoin="round"
														/>
													</svg>
												{/if}
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
						<button
							class="picker-action-btn"
							onclick={openPersonaEdit}
							disabled={!selectedPersona}
							title="Edit persona profile JSON"
						>
							Edit
						</button>
						<div class="dropdown company-dropdown" class:open={companyPickerOpen}>
							<button
								type="button"
								class="dropdown-trigger"
								aria-haspopup="listbox"
								aria-expanded={companyPickerOpen}
								onclick={(e) => {
									e.stopPropagation();
									templatePickerOpen = false;
									personaPickerOpen = false;
									companyPickerOpen = !companyPickerOpen;
								}}
								onkeydown={(e) =>
									handleDropdownKeydown(e, companyPickerOpen, (open) => (companyPickerOpen = open))}
							>
								<span class="dropdown-value">
									<span class="dropdown-primary">{selectedCompanyName}</span>
								</span>
								<svg
									class="dropdown-chevron"
									width="14"
									height="14"
									viewBox="0 0 14 14"
									fill="none"
									aria-hidden="true"
								>
									<path
										d="M3.5 5.25 7 8.75l3.5-3.5"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</button>

							{#if companyPickerOpen}
								<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
								<ul class="dropdown-menu" role="listbox" onclick={(e) => e.stopPropagation()}>
									{#each COMPANY_OPTIONS as companyName (companyName)}
										<li role="none">
											<button
												type="button"
												class="dropdown-option"
												class:selected={selectedCompanyName === companyName}
												role="option"
												aria-selected={selectedCompanyName === companyName}
												onclick={() => selectCompany(companyName)}
											>
												<span class="dropdown-option-body">
													<span class="dropdown-option-primary">{companyName}</span>
												</span>
												{#if selectedCompanyName === companyName}
													<svg
														class="dropdown-option-check"
														width="14"
														height="14"
														viewBox="0 0 14 14"
														fill="none"
														aria-hidden="true"
													>
														<path
															d="M2.5 7.25 5.5 10.25 11.5 3.75"
															stroke="currentColor"
															stroke-width="1.5"
															stroke-linecap="round"
															stroke-linejoin="round"
														/>
													</svg>
												{/if}
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					</div>
				</div>
			</div>

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
						<div class="new-form-id">id: <code>{newTemplateId}</code></div>
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
				<button class="tab" class:active={activeTab === 'code'} onclick={() => (activeTab = 'code')}>
					Code
				</button>
				<button class="tab" class:active={activeTab === 'tree'} onclick={() => (activeTab = 'tree')}>
					Structure
				</button>
				<button class="tab" class:active={activeTab === 'html'} onclick={() => (activeTab = 'html')}>
					HTML
				</button>
			</div>

			<!-- Panel content -->
			<div class="panel-content">
				{#if activeTab === 'code'}
					<div class="editor-wrap">
						{#if templateLoadError}
							<div class="editor-error">{templateLoadError}</div>
						{:else}
							<textarea
								bind:this={textareaEl}
								class="mjml-editor"
								bind:value={mjmlCode}
								onkeydown={handleTextareaKeydown}
								oninput={() => (isDirty = true)}
								spellcheck={false}
								autocomplete="off"
								autocapitalize="off"
								placeholder="<mjml>…</mjml>"
							></textarea>
						{/if}
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
					<button
						class="save-btn"
						class:saving={saveStatus === 'saving'}
						class:saved={saveStatus === 'saved'}
						class:save-error={saveStatus === 'error'}
						onclick={handleSave}
						disabled={saveStatus === 'saving' || !selectedTemplateId}
					>
						{#if saveStatus === 'saving'}Saving…
						{:else if saveStatus === 'saved'}Saved ✓
						{:else if saveStatus === 'error'}Save failed
						{:else}Save & Preview{/if}
					</button>
				</div>
			</div>
		</aside>

		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="panel-resize-handle"
			role="separator"
			aria-orientation="vertical"
			aria-valuenow={leftPanelWidth}
			aria-valuemin={LEFT_PANEL_MIN}
			aria-valuemax={LEFT_PANEL_MAX}
			tabindex="0"
			onmousedown={startPanelResize}
			onkeydown={(e) => {
				if (e.key === 'ArrowLeft') {
					leftPanelWidth = Math.max(LEFT_PANEL_MIN, leftPanelWidth - 16);
					localStorage.setItem(LEFT_PANEL_WIDTH_KEY, String(leftPanelWidth));
				} else if (e.key === 'ArrowRight') {
					leftPanelWidth = Math.min(LEFT_PANEL_MAX, leftPanelWidth + 16);
					localStorage.setItem(LEFT_PANEL_WIDTH_KEY, String(leftPanelWidth));
				}
			}}
		></div>

		<!-- ─── Preview ─────────────────────────────────────────────────────── -->
		<main class="preview-area">
			{#if isLoading}
				<div class="preview-loading">
					<div class="loading-dot"></div>
					<span>Loading…</span>
				</div>
			{:else}
				<div class="preview-stage">
					<iframe
						bind:this={iframeEl}
						src={previewUrl}
						title="Email preview"
						allow="same-origin"
						scrolling="no"
						class="preview-iframe"
						onload={fitIframe}
					></iframe>
				</div>
			{/if}
		</main>
	</div>
</div>

<!-- Add-component context menu (fixed-positioned) -->
{#if personaEditOpen}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events -->
	<div
		class="persona-dialog-backdrop"
		role="presentation"
		onclick={closePersonaEdit}
	>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events -->
		<div
			class="persona-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="persona-dialog-title"
			onclick={(e) => e.stopPropagation()}
		>
			<header class="persona-dialog-header">
				<div>
					<h2 id="persona-dialog-title" class="persona-dialog-title">Edit persona</h2>
					<p class="persona-dialog-subtitle">
						Profile fields used for <code>{'{{profile.*}}'}</code> preview tokens
					</p>
				</div>
				<button type="button" class="persona-dialog-close" onclick={closePersonaEdit} aria-label="Close">
					×
				</button>
			</header>

			<textarea
				class="persona-json-editor"
				bind:value={personaEditJson}
				spellcheck={false}
				autocomplete="off"
				autocapitalize="off"
			></textarea>

			{#if personaEditError}
				<div class="persona-dialog-error">{personaEditError}</div>
			{/if}

			<footer class="persona-dialog-footer">
				<button type="button" class="btn-cancel" onclick={closePersonaEdit}>Cancel</button>
				<button type="button" class="btn-create" onclick={savePersonaEdit}>Save & Preview</button>
			</footer>
		</div>
	</div>
{/if}

{#if addMenuNode}
	<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
	<div
		class="add-menu"
		style:left={`${addMenuNode.x}px`}
		style:top={`${addMenuNode.y}px`}
		onmousedown={(e) => e.stopPropagation()}
		onclick={(e) => e.stopPropagation()}
	>
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
		gap: 12px;
		padding: 0 20px;
		height: 48px;
		background: #111;
		border-bottom: 1px solid #222;
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
		height: 16px;
		background: #2e2e2e;
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

	.topbar-spacer {
		flex: 1;
	}

	.export-mode {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		font-weight: 600;
		color: #a1a1aa;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.export-mode select {
		height: 30px;
		border: 1px solid #3f3f46;
		border-radius: 6px;
		background: #18181b;
		color: #e4e4e7;
		padding: 0 8px;
		font-size: 12px;
		text-transform: none;
		letter-spacing: 0;
	}

	.export-btn {
		background: #5b5bd6;
		color: #fff;
		border: none;
		border-radius: 6px;
		padding: 6px 14px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		letter-spacing: 0.1px;
		transition: background 0.1s;
	}
	.export-btn:hover:not(:disabled) {
		background: #4f4ec9;
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
	.export-btn.secondary {
		background: #fff;
		color: #333;
		border: 1px solid #ccc;
	}
	.export-btn.secondary:hover:not(:disabled) {
		background: #f5f5f5;
	}
	.export-error-hint {
		font-size: 11px;
		color: #dc2626;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
		overflow: hidden;
		min-height: 0;
		min-width: 0;
	}

	.panel-resize-handle {
		flex: 0 0 auto;
		align-self: stretch;
		width: 5px;
		margin-left: -2px;
		margin-right: -2px;
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

	/* Pickers (template + persona) */
	.picker-bar {
		padding: 12px 16px;
		border-bottom: 1px solid #f4f4f5;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.picker-section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.picker-label {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: #a1a1aa;
	}

	.picker-controls {
		display: flex;
		gap: 8px;
		align-items: stretch;
	}

	.dropdown {
		position: relative;
		flex: 1;
		min-width: 0;
	}

	.dropdown-trigger {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		height: 36px;
		padding: 0 10px 0 12px;
		border: 1px solid #e4e4e7;
		border-radius: 8px;
		background: #fff;
		color: #111;
		font-size: 13px;
		text-align: left;
		cursor: pointer;
		outline: none;
		transition:
			border-color 0.12s,
			box-shadow 0.12s,
			background 0.12s;
	}

	.dropdown-trigger:hover:not(:disabled) {
		border-color: #d4d4d8;
		background: #fafafa;
	}

	.dropdown-trigger:focus-visible,
	.dropdown.open .dropdown-trigger {
		border-color: #5b5bd6;
		box-shadow: 0 0 0 3px rgba(91, 91, 214, 0.14);
	}

	.dropdown-trigger:disabled {
		opacity: 0.65;
		cursor: default;
		background: #f4f4f5;
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

	.dropdown-meta {
		flex-shrink: 0;
		font-size: 11px;
		font-weight: 500;
		color: #a1a1aa;
	}

	.dropdown-chevron {
		flex-shrink: 0;
		color: #71717a;
		transition: transform 0.15s ease;
	}

	.dropdown.open .dropdown-chevron {
		transform: rotate(180deg);
		color: #5b5bd6;
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		z-index: 50;
		margin: 0;
		padding: 4px;
		list-style: none;
		background: #fff;
		border: 1px solid #e4e4e7;
		border-radius: 8px;
		box-shadow:
			0 4px 6px -1px rgba(0, 0, 0, 0.06),
			0 10px 24px -4px rgba(0, 0, 0, 0.1);
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

	.picker-action-btn {
		height: 36px;
		padding: 0 12px;
		border: 1px solid #e4e4e7;
		border-radius: 8px;
		font-size: 12px;
		font-weight: 600;
		color: #3f3f46;
		background: #fff;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.1s, border-color 0.1s, color 0.1s;
	}

	.picker-action-btn:hover:not(:disabled) {
		background: #f4f4f5;
		border-color: #d4d4d8;
	}

	.picker-action-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.picker-action-btn.accent {
		color: #5b5bd6;
		background: #ededfc;
		border-color: #e4e4e7;
	}

	.picker-action-btn.accent:hover:not(:disabled) {
		background: #ddddf8;
	}

	.company-dropdown {
		flex: 0 0 190px;
	}

	/* Persona edit dialog */
	.persona-dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
	}

	.persona-dialog {
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
		border: 1px solid #e4e4e7;
		border-radius: 5px;
		font-size: 12px;
		cursor: pointer;
	}
	.btn-cancel:hover {
		background: #f4f4f5;
	}

	/* Tabs */
	.tab-bar {
		display: flex;
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
		flex: 1 1 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.mjml-editor {
		display: block;
		width: 100%;
		height: 100%;
		min-height: 0;
		resize: none;
		border: none;
		outline: none;
		padding: 14px 16px;
		box-sizing: border-box;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 12px;
		line-height: 1.6;
		color: #1a1a1a;
		background: #fafafa;
		tab-size: 2;
		overflow-y: auto;
		white-space: pre;
		overflow-x: auto;
	}
	.mjml-editor::placeholder {
		color: #c4c4c4;
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
		gap: 8px;
		padding: 10px 16px;
	}

	.dirty-indicator {
		font-size: 10px;
		color: #f59e0b;
		flex-shrink: 0;
		line-height: 1;
	}

	.save-btn {
		flex: 1;
		height: 32px;
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

	/* ── Preview area ────────────────────────────────────────────────────────── */
	.preview-area {
		flex: 1;
		min-width: 0;
		background: #f4f4f5;
		padding: 32px 24px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.preview-loading {
		display: flex;
		align-items: center;
		gap: 10px;
		color: #a1a1aa;
		font-size: 13px;
		margin-top: 80px;
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
		width: 100%;
		display: flex;
		justify-content: center;
	}

	.preview-iframe {
		width: 600px;
		height: 150px;
		overflow: hidden;
		border: none;
		background: #fff;
		border-radius: 4px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 24px rgba(0, 0, 0, 0.06);
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
