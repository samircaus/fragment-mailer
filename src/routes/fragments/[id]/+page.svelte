<script lang="ts">
	import { page } from '$app/stores';
	import EmailEditor from '$lib/components/EmailEditor.svelte';

	const fragmentId = $derived($page.params.id ?? '');
</script>

<EmailEditor mode="fragment" entityId={fragmentId} />
