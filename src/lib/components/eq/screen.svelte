<script lang="ts" module>
	/** Button sizes for a phone held in one hand. */
	export const BIG = 'h-14 w-full text-base font-semibold';
	export const MID = 'h-12 w-full text-sm';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeft';

	let {
		title,
		eyebrow,
		back,
		children,
		actions
	}: {
		title: string;
		eyebrow?: string;
		/** where the back link goes; screens off the main loop should always have one */
		back?: { href: string; label: string };
		children: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<svelte:head>
	<title>{title} · Car EQ Bench</title>
</svelte:head>

<main id="main" class="mx-auto grid w-full max-w-xl flex-1 content-start gap-6 px-4 pt-4 pb-10 *:[p]:max-w-prose">
	<div class="grid gap-1.5">
		{#if back}
			<a
				href={back.href}
				class="text-muted-foreground hover:text-foreground focus-visible:ring-ring -ml-1 mb-1 inline-flex w-fit items-center gap-1 py-1 pr-2 text-sm transition-colors outline-none focus-visible:ring-1"
			>
				<CaretLeftIcon class="size-4" />{back.label}
			</a>
		{/if}
		{#if eyebrow}
			<p class="text-primary text-sm font-medium">{eyebrow}</p>
		{/if}
		<h1 class="text-3xl/[1.1] font-bold tracking-[-0.025em]">{title}</h1>
	</div>
	{@render children()}
</main>

{#if actions}
	<!-- one primary action per screen, in thumb reach -->
	<div class="bg-background/90 sticky bottom-0 z-10 border-t backdrop-blur-md">
		<div class="mx-auto grid max-w-xl gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
			{@render actions()}
		</div>
	</div>
{/if}
