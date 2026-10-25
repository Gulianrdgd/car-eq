<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Label } from '#lib/components/ui/label/index.js';
	import { cn } from '#lib/utils.js';

	let {
		label,
		for: id,
		value,
		class: className,
		children
	}: { label: string; for?: string; value?: string; class?: string; children: Snippet } = $props();
</script>

<div class={cn('grid min-w-0 gap-2', className)}>
	<Label for={id} class="text-foreground justify-between text-sm font-medium">
		{label}
		{#if value != null}<span class="text-muted-foreground font-mono text-xs tabular-nums">{value}</span>{/if}
	</Label>
	{@render children()}
</div>
