<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { EditorState, type Extension } from '@codemirror/state';
	import { html } from '@codemirror/lang-html';
	import { defaultKeymap, indentWithTab } from '@codemirror/commands';
	import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
	import { tags } from '@lezer/highlight';
	import {
		Decoration,
		EditorView,
		MatchDecorator,
		ViewPlugin,
		keymap,
		placeholder
	} from '@codemirror/view';

	interface Props {
		value?: string;
		class?: string;
		placeholder?: string;
		onsave?: () => void | Promise<void>;
		ondirty?: () => void;
	}

	let {
		value = $bindable(''),
		class: className = '',
		placeholder: placeholderText = '<mjml>…</mjml>',
		onsave,
		ondirty
	}: Props = $props();

	let hostEl = $state<HTMLDivElement | null>(null);
	let view: EditorView | null = null;
	let syncingFromOutside = false;
	let lastSelection = { from: 0, to: 0 };

	const mjmlHighlight = HighlightStyle.define([
		{ tag: tags.tagName, color: '#8250df', fontWeight: '600' },
		{ tag: tags.angleBracket, color: '#6e7781' },
		{ tag: tags.attributeName, color: '#0550ae' },
		{ tag: tags.attributeValue, color: '#0a3069' },
		{ tag: tags.string, color: '#0a3069' },
		{ tag: tags.comment, color: '#6e7781', fontStyle: 'italic' },
		{ tag: tags.meta, color: '#6e7781' },
		{ tag: tags.propertyName, color: '#953800' },
		{ tag: tags.keyword, color: '#cf222e' }
	]);

	const editorTheme = EditorView.theme(
		{
			'&': {
				height: '100%',
				backgroundColor: '#fafafa'
			},
			'.cm-scroller': {
				fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
				fontSize: '12px',
				lineHeight: '1.6'
			},
			'&.cm-focused': { outline: 'none' },
			'.cm-content': {
				padding: '14px 16px',
				caretColor: '#1a1a1a',
				color: '#1a1a1a'
			},
			'.cm-cursor': { borderLeftColor: '#1a1a1a' },
			'.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
				backgroundColor: 'rgba(91, 91, 214, 0.2) !important'
			},
			'.cm-activeLine': { backgroundColor: '#f0f0f0' },
			'.cm-mustache': { color: '#bf3989' },
			'.cm-ajo-tag': { color: '#953800', fontWeight: '500' }
		},
		{ dark: false }
	);

	function templateDecorations(): Extension {
		const templateTokens = new MatchDecorator({
			regexp: /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g,
			decoration: (match) =>
				match[0].startsWith('{%')
					? Decoration.mark({ class: 'cm-ajo-tag' })
					: Decoration.mark({ class: 'cm-mustache' })
		});

		return ViewPlugin.fromClass(
			class {
				decorations: ReturnType<MatchDecorator['createDeco']>;
				constructor(view: EditorView) {
					this.decorations = templateTokens.createDeco(view);
				}
				update(update: import('@codemirror/view').ViewUpdate) {
					this.decorations = templateTokens.updateDeco(update, this.decorations);
				}
			},
			{ decorations: (plugin) => plugin.decorations }
		);
	}

	function buildExtensions(): Extension[] {
		return [
			html(),
			syntaxHighlighting(mjmlHighlight, { fallback: true }),
			templateDecorations(),
			editorTheme,
			EditorView.lineWrapping,
			placeholder(placeholderText),
			EditorView.updateListener.of((update) => {
				if (update.selectionSet) {
					const main = update.state.selection.main;
					lastSelection = { from: main.from, to: main.to };
				}
				if (!update.docChanged || syncingFromOutside) return;
				const next = update.state.doc.toString();
				if (next !== value) {
					value = next;
					ondirty?.();
				}
			}),
			keymap.of([
				indentWithTab,
				...defaultKeymap,
				{
					key: 'Mod-s',
					run: () => {
						void onsave?.();
						return true;
					}
				}
			])
		];
	}

	onMount(() => {
		if (!hostEl) return;

		view = new EditorView({
			parent: hostEl,
			state: EditorState.create({
				doc: value,
				extensions: buildExtensions()
			})
		});

		return () => {
			view?.destroy();
			view = null;
		};
	});

	$effect(() => {
		if (!view) return;
		const current = view.state.doc.toString();
		if (value === current) return;

		syncingFromOutside = true;
		view.dispatch({
			changes: { from: 0, to: current.length, insert: value }
		});
		syncingFromOutside = false;
	});

	export async function insertAtCursor(text: string) {
		await tick();
		if (!view) return;
		const main = view.state.selection.main;
		const from = view.hasFocus ? main.from : lastSelection.from;
		const to = view.hasFocus ? main.to : lastSelection.to;
		view.dispatch({
			changes: { from, to, insert: text },
			selection: { anchor: from + text.length },
			scrollIntoView: true
		});
		view.focus();
	}

	export async function focusAt(position: number) {
		await tick();
		if (!view) return;
		const clamped = Math.max(0, Math.min(position, view.state.doc.length));
		view.dispatch({
			selection: { anchor: clamped },
			scrollIntoView: true,
			effects: EditorView.scrollIntoView(clamped, { y: 'center' })
		});
		view.focus();
	}
</script>

<div class="mjml-cm-host {className}" bind:this={hostEl} role="textbox" aria-label="MJML source"></div>

<style>
	.mjml-cm-host {
		flex: 1 1 0;
		min-height: 0;
		overflow: hidden;
	}

	.mjml-cm-host :global(.cm-editor) {
		height: 100%;
	}

	.mjml-cm-host :global(.cm-gutters) {
		display: none;
	}

	.mjml-cm-host :global(.cm-scroller) {
		scrollbar-width: thin;
		scrollbar-color: rgba(0, 0, 0, 0.14) transparent;
	}

	.mjml-cm-host :global(.cm-scroller::-webkit-scrollbar) {
		width: 5px;
		height: 5px;
	}

	.mjml-cm-host :global(.cm-scroller::-webkit-scrollbar-track) {
		background: transparent;
	}

	.mjml-cm-host :global(.cm-scroller::-webkit-scrollbar-thumb) {
		background: rgba(0, 0, 0, 0.12);
		border-radius: 999px;
	}

	.mjml-cm-host :global(.cm-scroller::-webkit-scrollbar-thumb:hover) {
		background: rgba(0, 0, 0, 0.22);
	}
</style>
