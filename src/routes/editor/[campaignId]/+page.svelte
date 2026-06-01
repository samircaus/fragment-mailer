<script lang="ts">
	import { page } from '$app/stores';
	import EmailEditor from '$lib/components/EmailEditor.svelte';

	const campaignId = $derived($page.params.campaignId);
</script>

<EmailEditor mode="campaign" entityId={campaignId ?? ''} />
