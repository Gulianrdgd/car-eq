<script lang="ts">
	import { fmtF, gain } from '#lib/eq/dsp.js';
	import { cn } from '#lib/utils.js';

	/** Slider values as big numbers, one tile per band; with `prev`, changes are highlighted. */
	let { bands, values, prev }: { bands: number[]; values: number[]; prev?: number[] | null } = $props();
</script>

<ol class="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
	{#each bands as fc, i (fc)}
		{@const v = values[i] ?? 0}
		{@const p = prev?.[i]}
		{@const changed = p != null && p !== v}
		<li
			class={cn(
				'ring-foreground/10 bg-card grid justify-items-center gap-0.5 px-1 py-2 ring-1',
				changed && 'ring-primary bg-primary/10 ring-2'
			)}
		>
			<span class="text-muted-foreground font-mono text-[11px]">{fmtF(fc)}</span>
			<span class="text-3xl font-semibold tracking-tight tabular-nums">{gain(v)}</span>
			{#if changed}
				<span class="text-primary font-mono text-[11px] tabular-nums">{gain(p)} → {gain(v)}</span>
			{:else if prev}
				<span class="text-muted-foreground text-[11px]">same</span>
			{/if}
		</li>
	{/each}
</ol>
