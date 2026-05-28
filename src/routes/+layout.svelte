<script lang="ts">
	import type { LayoutData } from './$types';

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();
</script>

<svelte:head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Fragment Mailer</title>
	<link rel="preload" href="https://universal-editor-service.adobe.io/cors.js" as="script" />
	{#if data.ue?.aemBaseUrl}
		<meta
			name="urn:adobe:aue:system:aemconnection"
			content={"aem:" + data.ue.aemBaseUrl}
		/>
	{/if}
	<meta name="urn:adobe:aue:config:preview" content={data.ue.previewUrl} />
	<script src="https://universal-editor-service.adobe.io/cors.js"></script>
	<script type="application/vnd.adobe.aue.component+json" src="/component-definition.json"></script>
	<script type="application/vnd.adobe.aue.model+json" src="/component-models.json"></script>
</svelte:head>

{@render children()}

<style>
	:global(*) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	:global(body) {
		font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
		font-size: 14px;
		-webkit-font-smoothing: antialiased;
		color: #111;
		background: #fafafa;
	}
</style>
