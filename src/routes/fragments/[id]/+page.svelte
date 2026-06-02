<script lang="ts">
	import { page } from '$app/stores';
	import FragmentEditor from '$lib/components/FragmentEditor.svelte';

	const fragmentId = $derived($page.params.id ?? '');
</script>

<FragmentEditor {fragmentId} />
