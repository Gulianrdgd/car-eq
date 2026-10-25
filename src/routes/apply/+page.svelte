<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import Screen, { BIG } from '#lib/components/eq/screen.svelte';
	import EqValues from '#lib/components/eq/eq-values.svelte';
	import { goto } from '$app/navigation';
	import { session } from '#lib/eq/session.svelte.js';
	import { NEXT_LABELS, nextHref } from '#lib/eq/nav.js';
	import { PRESETS, signed } from '#lib/eq/dsp.js';

	const changed = $derived(session.prev ? session.cur.filter((v, i) => v !== session.prev!.cur[i]).length : 0);
</script>

<Screen title="Set these in the car" eyebrow="Iteration {session.it}">
	<EqValues bands={session.bands} values={session.cur} prev={session.prev?.cur} />
	<p class="text-muted-foreground text-sm">
		{changed} slider{changed === 1 ? '' : 's'} changed · target {PRESETS[session.preset].label}, bass {signed(session.bass)},
		treble {signed(session.treble)}
	</p>
	{#if session.note}
		<blockquote class="border-primary border-l-2 pl-3 text-base/relaxed">{session.note}</blockquote>
	{/if}

	{#snippet actions()}
		<Button class={BIG} onclick={() => goto(nextHref(session.next))}>{NEXT_LABELS[session.next.kind]}</Button>
	{/snippet}
</Screen>
