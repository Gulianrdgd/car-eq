<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import Screen, { BIG } from '#lib/components/eq/screen.svelte';
	import CarIcon from 'phosphor-svelte/lib/Car';
	import PlusIcon from 'phosphor-svelte/lib/Plus';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { bandsOf, carFits, session, type CarSnapshot } from '#lib/eq/session.svelte.js';
	import { fmtF, gain } from '#lib/eq/dsp.js';

	let cars = $state(session.cars());
	/** id of the car waiting for a second tap on delete */
	let confirming = $state<string | null>(null);

	const fmtDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' });

	function open(c: CarSnapshot, href: '/' | '/done') {
		if (c.id !== session.id) session.openCar(c.id);
		goto(resolve(href));
	}

	function remove(id: string) {
		if (confirming !== id) return void (confirming = id);
		session.removeCar(id);
		cars = session.cars();
		confirming = null;
	}

	function add() {
		session.newCar();
		goto(resolve('/setup'));
	}
</script>

<Screen title="Your cars" back={{ href: resolve('/'), label: 'Back to tuning' }}>
	{#if !cars.length}
		<div class="grid justify-items-start gap-2 border border-dashed p-5">
			<CarIcon class="text-muted-foreground size-7" />
			<p class="text-sm font-semibold">No cars yet</p>
			<p class="text-muted-foreground text-sm/relaxed">A car shows up here once you finish its setup.</p>
		</div>
	{/if}

	<ul class="grid gap-2">
		{#each cars as c (c.id)}
			{@const fits = carFits(c)}
			{@const current = c.id === session.id}
			<li class={['bg-card grid gap-3 p-3', current ? 'ring-primary ring-2' : 'ring-foreground/10 ring-1']}>
				<div class="flex items-baseline justify-between gap-3">
					<span class="min-w-0 truncate font-semibold">{c.car || 'Unnamed car'}</span>
					<span class="text-muted-foreground shrink-0 text-xs">{current ? 'open now' : fmtDate(c.updated)}</span>
				</div>
				<dl class="grid grid-cols-3 gap-2 text-sm">
					<div>
						<dt class="text-muted-foreground text-xs">Fit</dt>
						<dd class="font-mono tabular-nums">
							{#if fits.best == null}–{:else if fits.first !== fits.best}±{fits.first?.toFixed(1)} → ±{fits.best.toFixed(1)}{:else}±{fits.best.toFixed(1)}{/if}
						</dd>
					</div>
					<div>
						<dt class="text-muted-foreground text-xs">Iterations</dt>
						<dd class="font-mono tabular-nums">{c.it}</dd>
					</div>
					<div>
						<dt class="text-muted-foreground text-xs">Status</dt>
						<dd>{c.next.kind === 'done' ? 'Finished' : 'Tuning'}</dd>
					</div>
				</dl>
				<p class="text-muted-foreground flex flex-wrap gap-x-3 font-mono text-xs tabular-nums">
					{#each bandsOf(c.bandsText) as f, i (f)}
						<span class="whitespace-nowrap">{fmtF(f)} <span class="text-foreground">{gain(c.cur[i] ?? 0)}</span></span>
					{/each}
				</p>
				<div class="flex flex-wrap gap-2">
					<Button variant="outline" class="h-11" onclick={() => open(c, '/done')}>Overview</Button>
					{#if !current}
						<Button variant="outline" class="h-11" onclick={() => open(c, '/')}>Continue tuning</Button>
						<Button variant="ghost" class="text-destructive h-11" onclick={() => remove(c.id)} onblur={() => (confirming = null)}>
							{confirming === c.id ? 'Tap again to delete' : 'Delete'}
						</Button>
					{/if}
				</div>
			</li>
		{/each}
	</ul>

	{#snippet actions()}
		<Button class={BIG} onclick={add}><PlusIcon /> Add a car</Button>
	{/snippet}
</Screen>
