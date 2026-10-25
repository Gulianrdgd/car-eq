<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import Screen, { BIG } from '#lib/components/eq/screen.svelte';
	import EqValues from '#lib/components/eq/eq-values.svelte';
	import CheckIcon from 'phosphor-svelte/lib/Check';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { session } from '#lib/eq/session.svelte.js';
	import { cn } from '#lib/utils.js';

	const seat = $derived(page.url.searchParams.get('seat') === 'passenger' ? 'passenger' : 'driver');

	const CHECKS = [
		{ id: 'engine', label: 'Engine off' },
		{ id: 'closed', label: 'Doors and windows closed' },
		{ id: 'fan', label: 'Fan off' },
		{ id: 'effects', label: 'Loudness, bass boost and sound effects off' },
		{ id: 'balance', label: 'Balance and fader centered' }
	];
	const ticked = $derived(CHECKS.filter((c) => session.checklist[c.id]).length);
</script>

<Screen title="Prepare the car" eyebrow={seat === 'passenger' ? 'Passenger seat' : `Iteration ${session.it}`}>
	<ul class="grid gap-2">
		{#each CHECKS as c (c.id)}
			{@const on = !!session.checklist[c.id]}
			<li>
				<button
					type="button"
					role="checkbox"
					aria-checked={on}
					class={cn(
						'ring-foreground/10 bg-card hover:bg-accent focus-visible:ring-ring flex min-h-14 w-full items-center gap-3 px-4 text-left text-base ring-1 transition-[background-color,color,transform] duration-150 outline-none focus-visible:ring-2 active:scale-[0.99]',
						on && 'text-muted-foreground'
					)}
					onclick={() => (session.checklist[c.id] = !on)}
				>
					<span
						class={cn('grid size-6 shrink-0 place-items-center border transition-colors duration-150', on ? 'bg-primary border-primary text-primary-foreground' : 'border-input')}
					>
						{#if on}<CheckIcon weight="bold" class="size-4" />{/if}
					</span>
					<span class={cn(on && 'line-through')}>{c.label}</span>
				</button>
			</li>
		{/each}
	</ul>

	<section class="grid gap-3">
		<h2 class="text-lg font-semibold tracking-tight">Set these on the head unit now</h2>
		<EqValues bands={session.bands} values={session.cur} />
		{#if session.note}
			<p class="text-muted-foreground text-sm/relaxed">{session.note}</p>
		{/if}
	</section>

	{#snippet actions()}
		<Button class={BIG} onclick={() => goto(resolve('/measure') + (seat === 'passenger' ? '?seat=passenger' : ''))}>
			I'm set, start
		</Button>
		{#if ticked < CHECKS.length}
			<p class="text-muted-foreground text-center text-xs">{ticked} of {CHECKS.length} checked</p>
		{/if}
	{/snippet}
</Screen>
