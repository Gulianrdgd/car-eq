<script lang="ts">
	import * as Collapsible from '#lib/components/ui/collapsible/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import Screen, { BIG } from '#lib/components/eq/screen.svelte';
	import ResponseChart, { type ChartLine } from '#lib/components/eq/response-chart.svelte';
	import ChartLegend, { type LegendItem } from '#lib/components/eq/chart-legend.svelte';
	import SuggestionBars from '#lib/components/eq/suggestion-bars.svelte';
	import TargetControls from '#lib/components/eq/target-controls.svelte';
	import CopyIcon from 'phosphor-svelte/lib/Copy';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDown';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRight';
	import ClipboardIcon from 'phosphor-svelte/lib/ClipboardText';
	import EarIcon from 'phosphor-svelte/lib/Ear';
	import SeatIcon from 'phosphor-svelte/lib/Armchair';
	import WaveformIcon from 'phosphor-svelte/lib/Waveform';
	import { toast } from 'svelte-sonner';
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SEATS, SEAT_COLORS, SEAT_NAMES, session } from '#lib/eq/session.svelte.js';
	import { R_GRID } from '#lib/eq/ceq.js';
	import { earEstimate } from '#lib/eq/dsp.js';
	import { cn } from '#lib/utils.js';

	let showText = $state(false);
	/** after copying, the next step (pasting the reply) becomes the primary action */
	let copied = $state(false);
	let pre = $state<HTMLPreElement>();

	const measuredSeats = $derived(SEATS.filter((s) => session.recs[s].length));
	const prev = $derived(session.prev);

	const lines = $derived<ChartLine[]>([
		{ curve: session.target, class: 'stroke-foreground', width: 1.5, dash: '5 4' },
		...(prev?.resp ? [{ curve: prev.resp, freqs: R_GRID, class: 'stroke-muted-foreground/50', width: 2 }] : []),
		...measuredSeats.map((s) => ({ curve: session.responses[s]!, class: SEAT_COLORS[s].stroke }))
	]);
	const legend = $derived<LegendItem[]>([
		{ label: 'Target', swatch: '', kind: 'dash' },
		...(prev?.resp ? [{ label: `Iteration ${prev.it}`, swatch: 'bg-muted-foreground/50' }] : []),
		...measuredSeats.map((s) => ({ label: SEAT_NAMES[s], swatch: SEAT_COLORS[s].bg })),
		...(Object.keys(session.ear).length ? [{ label: 'Ear estimate', swatch: 'bg-chart-4', kind: 'dot' as const }] : [])
	]);
	const dots = $derived(Object.entries(session.ear).map(([k, g]) => ({ f: +k, v: earEstimate(+k, g) })));

	const delta = $derived.by(() => {
		const a = prev?.fit, b = session.fit;
		if (a == null || b == null) return null;
		const d = b - a;
		const verdict = Math.abs(d) < 0.15 ? 'about the same' : d < 0 ? 'better' : 'worse';
		return { text: `${a.toFixed(1)} → ${b.toFixed(1)} dB, ${verdict}`, tone: verdict === 'better' ? 'text-ok' : verdict === 'worse' ? 'text-warn' : 'text-muted-foreground' };
	});

	const LEVEL_TEXT = { quiet: 'very quiet, turn the volume up', clip: 'clipping, lower the volume' };

	async function copy() {
		try {
			await navigator.clipboard.writeText(session.exportText);
			copied = true;
			toast.success('Copied. Paste it into a Claude chat.');
		} catch {
			// clipboard blocked: show and select the text so it can be copied by hand
			showText = true;
			await tick();
			const r = document.createRange();
			r.selectNodeContents(pre!);
			getSelection()?.removeAllRanges();
			getSelection()?.addRange(r);
			copied = true;
			toast('Text selected, copy it from the box.');
		}
	}
</script>

<Screen title="Results" eyebrow="Iteration {session.it}">
	{#if !session.measured}
		<div class="bg-card ring-foreground/10 grid justify-items-start gap-3 p-5 ring-1">
			<WaveformIcon class="text-primary size-8" />
			<h2 class="text-lg font-semibold">Nothing measured yet</h2>
			<p class="text-muted-foreground text-sm/relaxed">
				Measure the car with the slider values from iteration {session.it} on the head unit. The chart below shows only
				the target until then.
			</p>
		</div>
	{:else}
		<section class="grid gap-2">
			<p class="text-muted-foreground text-sm font-medium">Fit to target</p>
			<p class="text-6xl/none font-semibold tracking-tight tabular-nums">
				{session.fit != null ? `±${session.fit.toFixed(1)}` : '–'}<span class="text-muted-foreground text-xl font-normal"> dB</span>
			</p>
			{#if delta}<p class={cn('font-mono text-base font-medium', delta.tone)}>{delta.text}</p>{/if}
			<p class="text-muted-foreground text-sm">Typical deviation from 100 Hz to 10 kHz. Under ±2 dB is very good for a car.</p>
		</section>

		<div class="flex flex-wrap gap-2">
			{#each measuredSeats as s (s)}
				{@const lvl = session.lvls[s]}
				<Badge variant="outline" class="h-7 gap-1.5 px-2.5 font-mono tabular-nums">
					<i class="size-2 {SEAT_COLORS[s].bg}"></i>
					{SEAT_NAMES[s]} ×{session.recs[s].length}{session.fits[s] != null ? ` · ±${session.fits[s]!.toFixed(1)}` : ''}
				</Badge>
				{#if lvl !== 'ok'}
					<Badge variant="outline" class="border-warn text-warn h-7 px-2.5">{LEVEL_TEXT[lvl]}</Badge>
				{/if}
			{/each}
		</div>
	{/if}

	<ResponseChart label="Measured frequency response compared with target" {lines} {dots} bands={session.bands} />
	<ChartLegend items={legend} />
	<p class="text-muted-foreground text-xs/relaxed">
		Phone mics lose sensitivity in the shaded area below 80 Hz, so the real bass is stronger than the chart shows. Tune
		that range by ear.
	</p>

	<section class="grid gap-4 border-t pt-6">
		<h2 class="text-lg font-semibold tracking-tight">Target sound</h2>
		<TargetControls />
	</section>

	{#if session.measured}
		<section class="grid gap-4 border-t pt-6">
			<div class="grid gap-1">
				<h2 class="text-lg font-semibold tracking-tight">Tool suggestion</h2>
				<p class="text-muted-foreground text-sm/relaxed">
					What this page would set on its own. It cuts more than it boosts: boosts stop at +3, or +2 below 60 Hz unless
					you tuned that band by ear.
				</p>
			</div>
			<SuggestionBars out={session.suggestion} range={session.range} />
			<p class="text-muted-foreground text-xs">M measured · E by ear · T target only</p>
			<Button
				variant="link"
				class="h-11 justify-self-start px-0 text-sm"
				onclick={() => {
					session.applySuggestion();
					goto(resolve('/apply'));
				}}
			>
				Use the tool suggestion instead of asking Claude <CaretRightIcon />
			</Button>
		</section>
	{/if}

	<section class="grid gap-3 border-t pt-6">
		<h2 class="text-lg font-semibold tracking-tight">More measurements</h2>
		{#snippet more(Icon: typeof EarIcon, title: string, text: string, href: string)}
			<li>
				<a
					{href}
					class="bg-card ring-foreground/10 hover:bg-accent focus-visible:ring-ring flex min-h-16 items-center gap-3 px-4 py-3 ring-1 transition-colors outline-none focus-visible:ring-2 active:scale-[0.99]"
				>
					<Icon class="text-primary size-6 shrink-0" />
					<span class="grid flex-1 gap-0.5">
						<span class="text-sm font-semibold">{title}</span>
						<span class="text-muted-foreground text-xs">{text}</span>
					</span>
					<CaretRightIcon class="text-muted-foreground size-4" />
				</a>
			</li>
		{/snippet}
		<ul class="grid gap-2">
			{#if !session.recs.passenger.length}
				{@render more(SeatIcon, 'Measure the passenger seat', 'Optional. Claude can balance both front seats.', resolve('/prepare') + '?seat=passenger')}
			{/if}
			{@render more(EarIcon, 'Tune the bass by ear', 'Phone mics pick up little below 80 Hz, so you match those bands by ear.', resolve('/ear'))}
		</ul>
	</section>

	<Collapsible.Root bind:open={showText}>
		<Collapsible.Trigger class="text-muted-foreground hover:text-foreground group flex h-11 items-center gap-1 text-sm transition-colors">
			<CaretDownIcon class="size-4 transition-transform group-data-[state=open]:rotate-180" /> Text for Claude
		</Collapsible.Trigger>
		<Collapsible.Content>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<pre bind:this={pre} tabindex="0" class="bg-card mt-2 max-h-64 font-mono overflow-auto border p-3 text-[11px]/relaxed break-words whitespace-pre-wrap">{session.exportText}</pre>
		</Collapsible.Content>
	</Collapsible.Root>

	{#snippet actions()}
		{#if session.measured && !copied}
			<Button class={BIG} onclick={copy}><CopyIcon /> Copy for Claude</Button>
			<a href={resolve('/paste')} class="text-muted-foreground hover:text-foreground flex h-11 items-center justify-center text-sm transition-colors">
				Already have Claude's reply? Paste it
			</a>
		{:else if session.measured}
			<Button class={BIG} onclick={() => goto(resolve('/paste'))}><ClipboardIcon /> Paste Claude's reply</Button>
			<button type="button" class="text-muted-foreground hover:text-foreground h-11 text-sm transition-colors" onclick={copy}>
				Copy the text again
			</button>
		{:else}
			<Button class={BIG} onclick={() => goto(resolve('/prepare'))}>Measure</Button>
		{/if}
	{/snippet}
</Screen>
