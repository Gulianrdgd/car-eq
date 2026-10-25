<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import Screen, { BIG, MID } from '#lib/components/eq/screen.svelte';
	import EqValues from '#lib/components/eq/eq-values.svelte';
	import ResponseChart, { type ChartLine } from '#lib/components/eq/response-chart.svelte';
	import ChartLegend, { type LegendItem } from '#lib/components/eq/chart-legend.svelte';
	import SoundDemo, { type DemoCurve } from '#lib/components/eq/sound-demo.svelte';
	import HeadphonesIcon from 'phosphor-svelte/lib/Headphones';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { session } from '#lib/eq/session.svelte.js';
	import { R_GRID, toThird } from '#lib/eq/ceq.js';
	import { targetAt } from '#lib/eq/dsp.js';

	const finished = $derived(session.next.kind === 'done');

	/** Every iteration that has a measured response, the current one last. */
	const measured = $derived(
		[
			...session.history.map((h) => ({ it: h.it, fit: h.fit, resp: h.resp })),
			{ it: session.it, fit: session.fit, resp: session.basis && toThird(session.basis.resp) }
		].filter((m) => m.resp)
	);
	const before = $derived(measured[0] ?? null);
	const after = $derived(measured.length > 1 ? measured.at(-1)! : null);
	const fits = $derived(measured.flatMap((m) => (m.fit != null ? [{ it: m.it, fit: m.fit }] : [])));
	const worstFit = $derived(Math.max(...fits.map((f) => f.fit)));
	const target = $derived(R_GRID.map((f) => targetAt(f, session.preset, session.bass, session.treble)));
	const start = $derived(session.history[0]?.cur ?? session.cur.map(() => 0));

	const lines = $derived<ChartLine[]>([
		{ curve: target, freqs: R_GRID, class: 'stroke-foreground', width: 1.5, dash: '5 4' },
		...(before ? [{ curve: before.resp!, freqs: R_GRID, class: after ? 'stroke-muted-foreground/60' : 'stroke-chart-1' }] : []),
		...(after ? [{ curve: after.resp!, freqs: R_GRID, class: 'stroke-chart-1' }] : [])
	]);
	const legend = $derived<LegendItem[]>([
		{ label: 'Target', swatch: '', kind: 'dash' },
		...(before ? [{ label: `Iteration ${before.it}`, swatch: after ? 'bg-muted-foreground/60' : 'bg-chart-1' }] : []),
		...(after ? [{ label: `Iteration ${after.it}`, swatch: 'bg-chart-1' }] : [])
	]);

	/** A curve as filter gains: level-matched over 100 Hz to 10 kHz, kept within ±12 dB. */
	function gainsOf(curve: (number | null)[]) {
		const mid = R_GRID.flatMap((f, i) => (f >= 100 && f <= 10000 && curve[i] != null ? [curve[i]!] : []));
		const mean = mid.reduce((a, b) => a + b, 0) / Math.max(1, mid.length);
		return curve.map((v) => (v == null ? 0 : Math.max(-12, Math.min(12, v - mean))));
	}

	const demo = $derived<DemoCurve[]>([
		...(before
			? [{ key: 'before', label: 'Before', detail: `How the car measured in iteration ${before.it}.`, gains: gainsOf(before.resp!) }]
			: []),
		...(after
			? [{ key: 'after', label: 'After', detail: `How the car measured in iteration ${after.it}.`, gains: gainsOf(after.resp!) }]
			: []),
		{ key: 'target', label: 'Target', detail: 'The target curve you are tuning toward.', gains: gainsOf(target) }
	]);
</script>

<Screen title={finished ? 'Tuning finished' : 'Overview'} eyebrow={session.car || undefined}>
	{#if before && after && before.fit != null && after.fit != null}
		<div class="grid gap-1">
			<p class="text-muted-foreground text-sm">Fit, iteration {before.it} to {after.it}</p>
			<p class="font-mono text-4xl font-semibold tracking-tight tabular-nums">
				±{before.fit.toFixed(1)} <span class="text-muted-foreground">→</span> ±{after.fit.toFixed(1)} dB
			</p>
			<p class="text-muted-foreground text-sm">Lower is closer to the target. Under ±2 dB is very good for a car.</p>
		</div>
	{:else if !before}
		<p class="text-muted-foreground text-base/relaxed">Nothing measured yet. Measure once to see how the car compares with the target.</p>
	{/if}

	{#if before}
		<section class="grid gap-3">
			<h2 class="text-lg font-semibold">Frequency response</h2>
			<ResponseChart label="First and latest measured response compared with target" {lines} bands={session.bands} />
			<ChartLegend items={legend} />
		</section>
	{/if}

	{#if fits.length > 1}
		<section class="grid gap-2">
			<h2 class="text-lg font-semibold">Fit per iteration</h2>
			<ol class="grid gap-1.5">
				{#each fits as f (f.it)}
					<li class="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-2 text-sm">
						<span class="text-muted-foreground">Iteration {f.it}</span>
						<span class="bg-muted h-2"><span class="bg-primary block h-full" style:width="{(f.fit / worstFit) * 100}%"></span></span>
						<span class="text-right font-mono tabular-nums">±{f.fit.toFixed(1)}</span>
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	<section class="grid gap-3">
		<h2 class="text-lg font-semibold">{finished ? 'Final slider values' : 'Slider values now'}</h2>
		<EqValues bands={session.bands} values={session.cur} prev={start} />
		{#if session.note}
			<blockquote class="border-primary border-l-2 pl-3 text-base/relaxed">{session.note}</blockquote>
		{/if}
	</section>

	{#if before}
		<section class="grid gap-3">
			<h2 class="flex items-center gap-2 text-lg font-semibold"><HeadphonesIcon class="size-5" /> Hear the difference</h2>
			<p class="text-muted-foreground text-sm/relaxed">
				Plays sound shaped like each measurement, so you can switch between them. Use headphones. Phone mics miss some bass, so
				the low end will sound thinner than it is in the car.
			</p>
			<SoundDemo curves={demo} />
		</section>
	{/if}

	{#snippet actions()}
		<Button class={BIG} onclick={() => goto(resolve('/prepare'))}>Measure once more</Button>
		<div class="grid grid-cols-2 gap-2">
			<Button variant="outline" class={MID} onclick={() => goto(resolve('/history'))}>History</Button>
			<Button variant="outline" class={MID} onclick={() => goto(resolve('/cars'))}>All cars</Button>
		</div>
	{/snippet}
</Screen>
