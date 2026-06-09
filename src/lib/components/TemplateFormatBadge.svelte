<script lang="ts">
	import type { TemplateSourceFormat } from '$lib/templates/types.js';

	interface Props {
		format?: TemplateSourceFormat;
		size?: 'sm' | 'md';
	}

	let { format = 'mjml', size = 'sm' }: Props = $props();
</script>

{#if format === 'html'}
	<span
		class="template-format-badge template-format-badge--html template-format-badge--{size}"
		title="HTML template"
		aria-label="HTML template"
	>
		<span class="html-code-badge" aria-hidden="true">
			{#if size === 'md'}
				<span class="html-code-label">HTML</span>
			{:else}
				<span class="html-code-bracket">&lt;</span>
				<span class="html-code-slash">/</span>
				<span class="html-code-bracket">&gt;</span>
			{/if}
		</span>
	</span>
{:else}
	<span
		class="template-format-badge template-format-badge--mjml template-format-badge--{size}"
		title="MJML template"
		aria-label="MJML template"
	>
		<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<rect x="3" y="3" width="18" height="18" rx="4" fill="#F45E43" />
			<text
				x="12"
				y="15"
				text-anchor="middle"
				fill="#fff"
				font-size={size === 'md' ? '5.5' : '7'}
				font-weight="700"
				font-family="Arial, Helvetica, sans-serif"
				letter-spacing="-0.15"
			>
				{size === 'md' ? 'MJML' : 'MJ'}
			</text>
		</svg>
	</span>
{/if}

<style>
	.template-format-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		line-height: 1;
		overflow: hidden;
	}

	.template-format-badge--sm {
		width: 16px;
		height: 16px;
	}

	.template-format-badge--md {
		width: 24px;
		height: 22px;
	}

	.html-code-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		gap: 0;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
		font-weight: 700;
		background: #ede9fe;
		color: #5b21b6;
		letter-spacing: -0.03em;
		border-radius: 4px;
	}

	.template-format-badge--sm .html-code-badge {
		font-size: 8px;
	}

	.template-format-badge--md .html-code-badge {
		font-size: 6.5px;
		border-radius: 5px;
	}

	.html-code-bracket {
		color: #6d28d9;
	}

	.html-code-slash {
		color: #7c3aed;
		opacity: 0.9;
	}

	.html-code-label {
		color: #5b21b6;
		letter-spacing: 0.02em;
	}

	.template-format-badge--mjml svg {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
