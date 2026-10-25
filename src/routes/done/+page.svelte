<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import Screen, { BIG, MID } from '#lib/components/eq/screen.svelte';
	import EqValues from '#lib/components/eq/eq-values.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { session } from '#lib/eq/session.svelte.js';

	const bestFit = $derived(Math.min(...session.history.flatMap((h) => (h.fit != null ? [h.fit] : []))));
</script>

<Screen title="Tuning finished" eyebrow={session.car || undefined}>
	<p class="text-base">These are your final slider values.</p>
	<EqValues bands={session.bands} values={session.cur} />
	{#if isFinite(bestFit)}
		<p class="text-muted-foreground text-sm">Best measured fit: ±{bestFit.toFixed(1)} dB over {session.history.length} iterations.</p>
	{/if}
	{#if session.note}
		<blockquote class="border-primary border-l-2 pl-3 text-base/relaxed">{session.note}</blockquote>
	{/if}

	{#snippet actions()}
		<Button class={BIG} onclick={() => goto(resolve('/prepare'))}>Measure once more</Button>
		<Button variant="outline" class={MID} onclick={() => goto(resolve('/history'))}>History</Button>
	{/snippet}
</Screen>
