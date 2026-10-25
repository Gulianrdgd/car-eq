<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Slider } from '#lib/components/ui/slider/index.js';
	import Screen, { BIG } from '#lib/components/eq/screen.svelte';
	import Field from '#lib/components/eq/field.svelte';
	import PlayIcon from 'phosphor-svelte/lib/Play';
	import StopIcon from 'phosphor-svelte/lib/Stop';
	import CheckIcon from 'phosphor-svelte/lib/Check';
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { session } from '#lib/eq/session.svelte.js';
	import { audio } from '#lib/eq/audio.svelte.js';
	import { fmtF, gain, parseList } from '#lib/eq/dsp.js';
	import { cn } from '#lib/utils.js';

	/** ?bands=40,63 (from a CEQ-SET next=ear:…) limits the list; otherwise all bands. */
	const bands = $derived.by(() => {
		const asked = parseList(page.url.searchParams.get('bands') ?? '');
		const picked = session.bands.filter((b) => asked.includes(b));
		return picked.length ? picked : session.bands;
	});

	function setGain(key: string, db: number) {
		session.ear[key] = db;
		audio.setEarGain(key, db);
	}

	onDestroy(() => audio.stopEar());
</script>

<Screen title="Tune by ear" eyebrow="Iteration {session.it}" back={{ href: resolve('/results'), label: 'Results' }}>
	<p class="text-muted-foreground text-sm/relaxed">
		Phone mics pick up little below 80 Hz, so this step uses your ears. Each band alternates with a 1 kHz reference every
		second. Move the slider until both sound <b class="text-foreground">equally loud</b>, then go to the next band. Leave
		this iteration's slider values on the head unit. The page corrects for how hearing perceives bass and treble, but the
		results are approximate.
	</p>
	<div class="flex flex-wrap items-end justify-between gap-4">
		<Field label="Test level" value="{audio.earLevel} dB" class="w-48">
			<Slider type="single" value={audio.earLevel} onValueChange={(v) => audio.setEarLevel(v)} min={-30} max={0} step={1} class="h-11" aria-label="Test level" />
		</Field>
		<Button
			variant="outline"
			class="h-11"
			onclick={() => {
				audio.stopEar();
				session.ear = {};
			}}
		>
			Reset
		</Button>
	</div>

	<ul class="divide-border bg-card ring-foreground/10 divide-y ring-1">
		{#each bands as fc (fc)}
			{@const k = String(Math.round(fc))}
			{@const g = session.ear[k]}
			{@const playing = audio.earKey === k}
			<li class={cn('grid gap-2 px-3 py-3', playing && 'bg-muted/60')}>
				<div class="flex items-center justify-between gap-3">
					<span class="grid gap-0.5">
						<span class="inline-flex items-center gap-1.5 text-base font-semibold">
							{fmtF(fc)} Hz
							{#if g != null}<CheckIcon class="text-ok size-4" />{/if}
						</span>
						<span class={cn('text-sm tabular-nums', g == null && 'text-muted-foreground')}>{g != null ? `${gain(g)} dB` : 'not set'}</span>
					</span>
					<Button
						variant={playing ? 'default' : 'outline'}
						class="h-11 w-24"
						onclick={() => (playing ? audio.stopEar() : audio.startEar(fc, g ?? 0))}
					>
						{#if playing}<StopIcon weight="fill" /> Stop{:else}<PlayIcon weight="fill" /> Play{/if}
					</Button>
				</div>
				<Slider type="single" value={g ?? 0} onValueChange={(v) => setGain(k, v)} min={-24} max={24} step={1} class="h-11" aria-label="Test band level for {fmtF(fc)} Hz" />
			</li>
		{/each}
	</ul>

	{#snippet actions()}
		<Button class={BIG} onclick={() => goto(resolve('/results'))}>Done</Button>
	{/snippet}
</Screen>
