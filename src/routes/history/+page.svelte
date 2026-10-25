<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import Screen from '#lib/components/eq/screen.svelte';
	import HistoryIcon from 'phosphor-svelte/lib/ClockCounterClockwise';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { session, type Iteration } from '#lib/eq/session.svelte.js';
	import { PRESETS, signed } from '#lib/eq/dsp.js';

	const rows = $derived([...session.history].reverse());
	const fmtDate = (ts: number) => new Date(ts).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

	function restore(h: Iteration) {
		session.restore(h);
		goto(resolve('/apply'));
	}
</script>

<Screen title="History" back={{ href: resolve('/'), label: 'Back to tuning' }}>
	<div class="bg-card ring-primary grid gap-1 p-3 ring-2">
		<div class="flex justify-between text-sm font-semibold">
			<span>Iteration {session.it} · now</span>
			<span class="font-mono tabular-nums">{session.fit != null ? `±${session.fit.toFixed(1)} dB` : 'not measured'}</span>
		</div>
		<p class="text-muted-foreground font-mono text-xs tabular-nums">{session.cur.map(signed).join(' ')}</p>
	</div>

	{#if !rows.length}
		<div class="grid justify-items-start gap-2 border border-dashed p-5">
			<HistoryIcon class="text-muted-foreground size-7" />
			<p class="text-sm font-semibold">No earlier iterations</p>
			<p class="text-muted-foreground text-sm/relaxed">
				Each time you apply new slider values, this page keeps the old ones and their fit, so you can go back to them.
			</p>
		</div>
	{/if}

	<ul class="grid gap-2">
		{#each rows as h (h.it)}
			<li class="bg-card ring-foreground/10 grid gap-2 p-3 ring-1">
				<div class="flex justify-between gap-3 text-sm">
					<span class="font-semibold">Iteration {h.it}</span>
					<span class="font-mono tabular-nums">{h.fit != null ? `±${h.fit.toFixed(1)} dB` : 'not measured'}</span>
				</div>
				<p class="text-muted-foreground text-xs">
					{fmtDate(h.ts)} · {PRESETS[h.preset].label}, bass {signed(h.bass)}, treble {signed(h.treble)}
				</p>
				<p class="font-mono text-xs tabular-nums">{h.cur.map(signed).join(' ')}</p>
				{#if h.note}<p class="text-muted-foreground text-xs/relaxed">{h.note}</p>{/if}
				<Button variant="outline" class="h-11 justify-self-start" onclick={() => restore(h)}>Restore these values</Button>
			</li>
		{/each}
	</ul>
</Screen>
