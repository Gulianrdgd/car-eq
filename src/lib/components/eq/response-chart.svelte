<script lang="ts" module>
	export type ChartLine = {
		curve: (number | null)[];
		/** x positions of curve points; defaults to the 1/6-octave grid */
		freqs?: number[];
		class: string;
		width?: number;
		dash?: string;
	};
	export type ChartDot = { f: number; v: number };
</script>

<script lang="ts">
	import { GRID, fmtF } from '#lib/eq/dsp.js';

	let {
		lines,
		dots = [],
		bands = [],
		label
	}: { lines: ChartLine[]; dots?: ChartDot[]; bands?: number[]; label: string } = $props();

	const PAD = { l: 34, r: 10, t: 10, b: 26 };
	const Y_MIN = -18, Y_MAX = 12;
	const F_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
	const DB_TICKS = [-18, -12, -6, 0, 6, 12];
	const LOG_SPAN = Math.log10(20000) - Math.log10(20);

	let width = $state(0);
	const height = $derived(Math.max(220, (width * 9) / 16));
	const w = $derived(width - PAD.l - PAD.r);
	const h = $derived(height - PAD.t - PAD.b);

	const x = (f: number) => PAD.l + ((Math.log10(f) - Math.log10(20)) / LOG_SPAN) * w;
	const y = (d: number) => PAD.t + ((Y_MAX - Math.max(Y_MIN, Math.min(Y_MAX, d))) / (Y_MAX - Y_MIN)) * h;

	/** SVG path through a curve, breaking at missing points. */
	function path(curve: (number | null)[], freqs: number[]) {
		let d = '', open = false;
		freqs.forEach((f, i) => {
			const v = curve[i];
			if (v == null) return void (open = false);
			d += `${open ? 'L' : 'M'}${x(f).toFixed(1)},${y(v).toFixed(1)}`;
			open = true;
		});
		return d;
	}
</script>

<div class="w-full" bind:clientWidth={width}>
	{#if width}
		<svg {width} {height} class="block font-mono text-[11px]" role="img" aria-label={label}>
			<!-- phone mics lose sensitivity below 80 Hz -->
			<rect x={x(20)} y={PAD.t} width={x(80) - x(20)} height={h} class="fill-muted/60" />

			{#each DB_TICKS as d (d)}
				<line
					x1={PAD.l}
					x2={PAD.l + w}
					y1={y(d)}
					y2={y(d)}
					class={d === 0 ? 'stroke-muted-foreground' : 'stroke-border'}
					shape-rendering="crispEdges"
				/>
				<text x={PAD.l - 6} y={y(d)} text-anchor="end" dominant-baseline="middle" class="fill-muted-foreground">
					{d > 0 ? '+' : ''}{d}
				</text>
			{/each}

			{#each F_TICKS as f (f)}
				<line x1={x(f)} x2={x(f)} y1={PAD.t} y2={PAD.t + h} class="stroke-border" shape-rendering="crispEdges" />
				<text
					x={x(f)}
					y={PAD.t + h + 16}
					text-anchor={f === 20 ? 'start' : f === 20000 ? 'end' : 'middle'}
					class="fill-muted-foreground"
				>
					{fmtF(f)}
				</text>
			{/each}

			<!-- EQ band positions -->
			{#each bands.filter((f) => f >= 20 && f <= 20000) as f (f)}
				<rect x={x(f) - 1} y={PAD.t + h - 6} width="2" height="6" class="fill-muted-foreground" />
			{/each}

			<g fill="none" stroke-linejoin="round">
				{#each lines as l, i (i)}
					<path d={path(l.curve, l.freqs ?? GRID)} class={l.class} stroke-width={l.width ?? 2.25} stroke-dasharray={l.dash} />
				{/each}
			</g>

			{#each dots as dot (dot.f)}
				<circle cx={x(dot.f)} cy={y(dot.v)} r="4" class="fill-chart-4" />
			{/each}
		</svg>
	{/if}
</div>
