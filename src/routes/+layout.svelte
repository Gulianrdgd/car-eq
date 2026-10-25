<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import GearIcon from 'phosphor-svelte/lib/Gear';
	import HistoryIcon from 'phosphor-svelte/lib/ClockCounterClockwise';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { session } from '#lib/eq/session.svelte.js';
	import { cn } from '#lib/utils.js';

	let { children }: LayoutProps = $props();

	$effect(() => session.save());

	const LOOP = [
		{ id: '/prepare', label: 'Prepare' },
		{ id: '/measure', label: 'Measure' },
		{ id: '/results', label: 'Results' },
		{ id: '/paste', label: 'Reply' },
		{ id: '/apply', label: 'Apply' }
	];
	const step = $derived(LOOP.findIndex((s) => s.id === page.route.id));
	const icon = (id: string) =>
		cn(buttonVariants({ variant: 'ghost', size: 'icon-lg' }), '[&_svg]:size-5', page.route.id === id && 'bg-muted text-primary');
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<meta name="description" content="Measure your car audio with your phone, compare it with a target sound and tune the head unit EQ, with Claude as a second opinion." />
	<meta name="theme-color" content="#f6f8f7" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#0f1513" media="(prefers-color-scheme: dark)" />
</svelte:head>

<ModeWatcher />
<Toaster position="top-center" />

<a href="#main" class="bg-primary text-primary-foreground sr-only z-20 px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
	Skip to content
</a>

<div class="bg-muted/40 flex min-h-dvh flex-col">
	<header class="bg-background border-b pt-[env(safe-area-inset-top)]">
		<div class="mx-auto flex max-w-xl items-center gap-2 px-4 py-2">
			<a href={resolve('/')} class="min-w-0 flex-1 py-1">
				<p class="truncate text-sm font-semibold">{session.car || 'Car EQ Bench'}</p>
				<p class="text-muted-foreground font-mono text-[11px]">iteration {session.it}</p>
			</a>
			<nav class="flex gap-1" aria-label="Pages">
				<a href={resolve('/history')} class={icon('/history')} aria-label="History" aria-current={page.route.id === '/history' ? 'page' : undefined}>
					<HistoryIcon />
				</a>
				<a href={resolve('/setup')} class={icon('/setup')} aria-label="Setup" aria-current={page.route.id === '/setup' ? 'page' : undefined}>
					<GearIcon />
				</a>
			</nav>
		</div>
		{#if step >= 0}
			<ol class="mx-auto flex max-w-xl gap-1 px-4 pb-2" aria-label="Tuning loop">
				{#each LOOP as s, i (s.id)}
					<li class="grid flex-1 gap-1" aria-current={i === step ? 'step' : undefined}>
						<span class={cn('h-1 transition-colors duration-300', i <= step ? 'bg-primary' : 'bg-muted')}></span>
						<span class={cn('text-[10px]', i === step ? 'text-foreground font-semibold' : 'text-muted-foreground')}>
							{s.label}
						</span>
					</li>
				{/each}
			</ol>
		{/if}
	</header>

	{@render children()}
</div>
