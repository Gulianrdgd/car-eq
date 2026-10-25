<script lang="ts" module>
	export type LegendItem = { label: string; swatch: string; kind?: 'line' | 'dash' | 'dot' };
</script>

<script lang="ts">
	import { cn } from '#lib/utils.js';

	let { items }: { items: LegendItem[] } = $props();

	const swatch = {
		line: 'h-0.75 w-4.5',
		dash: 'h-0.5 w-4.5 bg-[repeating-linear-gradient(90deg,var(--foreground)_0_4px,transparent_4px_7px)]',
		dot: 'size-2 rounded-full'
	};
</script>

<ul class="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
	{#each items as item (item.label)}
		<li class="inline-flex items-center gap-1.5">
			<i class={cn('inline-block', swatch[item.kind ?? 'line'], item.swatch)}></i>
			{item.label}
		</li>
	{/each}
</ul>
