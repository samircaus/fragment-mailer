<script lang="ts">
	import { page } from '$app/stores';
	import EmailEditor from '$lib/components/EmailEditor.svelte';

	const templateId = $derived($page.params.id);
</script>

<EmailEditor mode="standalone" entityId={templateId ?? ''} />
