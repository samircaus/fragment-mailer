<script lang="ts">
	import type { PageData } from './$types';
	import { cfUeResourceUrn } from '$lib/ue/context.js';

	let { data }: { data: PageData } = $props();

	const fragment = $derived(data.fragment);
	const model = $derived(data.model);
	const authorHost = $derived(data.authorHost);
	const previewUrl = $derived(data.previewUrl);

	const ueResource = $derived(cfUeResourceUrn(fragment.path));

	// Build a field-name → model metadata lookup for labels and types
	const fieldMeta = $derived(new Map(model?.fields.map((f) => [f.name, f]) ?? []));
</script>

<svelte:head>
	<link rel="preload" href="https://universal-editor-service.adobe.io/cors.js" as="script" />
	<!--
		Tells UE which AEM instance to connect to.
		Value format: aem:<authorHost>
	-->
	<meta name="urn:adobe:aue:system:aemconnection" content="aem:{authorHost}" />
	<meta name="urn:adobe:aue:config:preview" content={previewUrl} />

	<!-- Universal Editor CORS bridge — must load before any UE interaction -->
	<script src="https://universal-editor-service.adobe.io/cors.js"></script>
	<script type="application/vnd.adobe.aue.component+json" src="/component-definition.json"></script>
	<script type="application/vnd.adobe.aue.model+json" src="/component-models.json"></script>
</svelte:head>

<!--
	data-aue-resource — uniquely identifies this fragment in AEM JCR
	data-aue-type="component" — UE treats this block as a selectable component
-->
<main
	data-aue-resource={ueResource}
	data-aue-type="component"
	data-aue-label={fragment.title}
	class="ue-fragment-preview"
>
	{#each fragment.fields as field}
		{@const meta = fieldMeta.get(field.name)}
		{@const isRichText = field.type === 'text/html' || field.type === 'richtext'}
		{@const value = field.values[0]}

		{#if value != null}
			<div
				data-aue-prop={field.name}
				data-aue-type={isRichText ? 'richtext' : 'text'}
				data-aue-label={meta?.label ?? field.name}
				class="field field-{field.name}"
			>
				{#if isRichText && typeof value === 'string'}
					<!-- Richtext fields come back as HTML from the Author API -->
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html value}
				{:else}
					{value}
				{/if}
			</div>
		{/if}
	{/each}
</main>

<style>
	.ue-fragment-preview {
		font-family: sans-serif;
		max-width: 680px;
		margin: 2rem auto;
		padding: 1.5rem;
	}
	.field {
		margin-bottom: 1rem;
	}
</style>
