<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Screen, { BIG } from '#lib/components/eq/screen.svelte';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import { cn } from '#lib/utils.js';
</script>

<Screen title={page.status === 404 ? 'Page not found' : 'Something went wrong'} eyebrow="Error {page.status}">
	<p class="text-muted-foreground text-base/relaxed">
		{page.status === 404
			? 'This address is not part of the tuning loop. Your measurements and slider values are still saved.'
			: (page.error?.message ?? 'The page failed to load. Your measurements and slider values are still saved.')}
	</p>
	{#snippet actions()}
		<a href={resolve('/')} class={cn(buttonVariants(), BIG)}>Back to tuning</a>
	{/snippet}
</Screen>
