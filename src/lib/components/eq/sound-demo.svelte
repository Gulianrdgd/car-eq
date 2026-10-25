<script lang="ts" module>
	/** A tonal balance to listen to, as one gain per R_GRID point. */
	export type DemoCurve = { key: string; label: string; detail: string; gains: number[] };
</script>

<script lang="ts">
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import { MID } from '#lib/components/eq/screen.svelte';
	import PlayIcon from 'phosphor-svelte/lib/Play';
	import StopIcon from 'phosphor-svelte/lib/Stop';
	import MusicNoteIcon from 'phosphor-svelte/lib/MusicNote';
	import { audio } from '#lib/eq/audio.svelte.js';
	import { cn } from '#lib/utils.js';

	let { curves }: { curves: DemoCurve[] } = $props();

	let picked = $state<string | null>(null);
	const active = $derived(curves.find((c) => c.key === picked) ?? curves[0]);
	let music = $state<{ name: string; buf: AudioBuffer } | null>(null);
	let error = $state('');

	// stop when leaving the page
	$effect(() => () => audio.stopDemo());

	function pick(key: string) {
		picked = key;
		audio.setDemoGains(active.gains);
	}

	function toggle() {
		if (audio.demoOn) audio.stopDemo();
		else audio.startDemo(active.gains, music?.buf);
	}

	async function upload(e: Event & { currentTarget: HTMLInputElement }) {
		const f = e.currentTarget.files?.[0];
		if (!f) return;
		error = '';
		try {
			music = { name: f.name, buf: await audio.decode(f) };
			if (audio.demoOn) audio.startDemo(active.gains, music.buf);
		} catch {
			error = `Could not read ${f.name}. Try an mp3, m4a or wav file.`;
		}
	}

	const toggleOn = 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 flex-1 text-sm';
</script>

<div class="grid gap-3">
	<ToggleGroup.Root type="single" variant="outline" value={active.key} onValueChange={(v) => v && pick(v)} class="w-full">
		{#each curves as c (c.key)}
			<ToggleGroup.Item value={c.key} class={toggleOn}>{c.label}</ToggleGroup.Item>
		{/each}
	</ToggleGroup.Root>
	<p class="text-muted-foreground text-sm/relaxed">{active.detail}</p>

	<Button class={MID} onclick={toggle}>
		{#if audio.demoOn}<StopIcon weight="fill" /> Stop{:else}<PlayIcon weight="fill" /> Play {music ? music.name : 'pink noise'}{/if}
	</Button>
	<label class={cn(buttonVariants({ variant: 'outline' }), MID, 'focus-within:ring-ring/50 cursor-pointer focus-within:ring-1')}>
		<MusicNoteIcon /> {music ? 'Pick another song' : 'Use a song from this phone'}
		<input type="file" class="sr-only" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac" onchange={upload} />
	</label>
	{#if error}<p class="text-destructive text-sm">{error}</p>{/if}
</div>
