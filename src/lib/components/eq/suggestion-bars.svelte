<script lang="ts">
	import { fmtF, signed, type BandResult } from '#lib/eq/dsp.js';

	let { out, range }: { out: BandResult[]; range: number } = $props();

	const SOURCE_NAMES = { M: 'measured', E: 'ear', T: 'target only' };
</script>

<div class="overflow-x-auto">
	<div class="grid min-w-max gap-1 sm:min-w-0" style:grid-template-columns="repeat({Math.max(1, out.length)}, minmax(2rem, 1fr))">
		{#each out as o (o.fc)}
			{@const frac = Math.min(1, Math.abs(o.g) / range) * 50}
			<div class="grid justify-items-center gap-1.5" title="{fmtF(o.fc)} Hz: {signed(o.g)} dB ({SOURCE_NAMES[o.src]})">
				<span class="text-xs font-medium tabular-nums">{signed(o.g)}</span>
				<div class="bg-muted/60 border-border relative h-28 w-2.5 border">
					<div class="bg-muted-foreground absolute inset-x-[-5px] top-1/2 h-px"></div>
					<div class="absolute inset-x-px {o.g < 0 ? 'bg-chart-2 top-1/2' : 'bg-primary bottom-1/2'}" style:height="{frac}%"></div>
				</div>
				<span class="text-muted-foreground text-[10px] whitespace-nowrap">{fmtF(o.fc)}</span>
				<span class="text-muted-foreground text-[9.5px]">{o.src}</span>
			</div>
		{/each}
	</div>
</div>
