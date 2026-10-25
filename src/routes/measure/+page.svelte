<script lang="ts">
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import Screen, { BIG, MID } from '#lib/components/eq/screen.svelte';
	import ResponseChart from '#lib/components/eq/response-chart.svelte';
	import PlayIcon from 'phosphor-svelte/lib/Play';
	import StopIcon from 'phosphor-svelte/lib/Stop';
	import UploadIcon from 'phosphor-svelte/lib/UploadSimple';
	import DownloadIcon from 'phosphor-svelte/lib/DownloadSimple';
	import WarningIcon from 'phosphor-svelte/lib/Warning';
	import SpinnerIcon from 'phosphor-svelte/lib/Spinner';
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { SEAT_NAMES, lvlOf, session, type Seat } from '#lib/eq/session.svelte.js';
	import { Mic, audio } from '#lib/eq/audio.svelte.js';
	import { TooShortError, analyze, pinkNoise, type Recording } from '#lib/eq/dsp.js';
	import { encodeWav } from '#lib/eq/wav.js';
	import type { Lvl } from '#lib/eq/ceq.js';
	import { cn } from '#lib/utils.js';

	const SETTLE_MS = 2000, CAPTURE_MS = 5000;
	const SPOTS = [
		{ title: 'Center of your head', hint: 'Phone between your eyes, mic toward the dashboard.' },
		{ title: 'Left ear', hint: 'Phone next to your left ear.' },
		{ title: 'Right ear', hint: 'Phone next to your right ear.' },
		{ title: '10 cm higher', hint: 'Back to center, then one hand width up.' },
		{ title: '10 cm forward', hint: 'Back to center, then one hand width toward the windscreen.' }
	];
	const LEVEL_HELP: Record<Exclude<Lvl, 'ok'>, string> = {
		quiet: 'Very quiet. Turn the volume up, and check that the pink noise is playing in the car.',
		clip: 'Too loud, the mic is clipping. Turn the volume down a bit.'
	};

	const seat = $derived<Seat>(page.url.searchParams.get('seat') === 'passenger' ? 'passenger' : 'driver');

	let stage = $state<'intro' | 'run' | 'level' | 'upload'>('intro');
	let source = $state<'phone' | 'usb'>('phone');
	let idx = $state(0);
	let phase = $state<'settle' | 'capture'>('settle');
	let frac = $state(0);
	let warn = $state<Exclude<Lvl, 'ok'> | null>(null);
	let captures = $state.raw<Recording[]>([]);
	let note = $state('');
	let starting = $state(false);

	let mic: Mic | null = null;
	let ctrl: AbortController | null = null;
	let wake: WakeLockSentinel | null = null;

	const buzz = (ms = 120) => navigator.vibrate?.(ms);
	const left = $derived(Math.ceil(((1 - frac) * (phase === 'settle' ? SETTLE_MS : CAPTURE_MS)) / 1000));

	async function start() {
		starting = true;
		try {
			mic ??= await Mic.open();
		} catch {
			note = 'The microphone is not available. It needs https and your permission. You can upload recordings instead.';
			stage = 'upload';
			return;
		} finally {
			starting = false;
		}
		if (source === 'phone' && !audio.noiseOn) audio.toggleNoise();
		wake = (await navigator.wakeLock?.request('screen').catch(() => null)) ?? null;
		captures = [];
		idx = 0;
		runSpot();
	}

	/** Settle (with level check), then capture one position; continues to the next one. */
	async function runSpot(checkLevel = true) {
		if (!mic) return;
		stage = 'run';
		warn = null;
		ctrl = new AbortController();
		const { signal } = ctrl;
		try {
			phase = 'settle';
			frac = 0;
			const s = await mic.run(SETTLE_MS, signal, (f) => (frac = f));
			const lvl = lvlOf([s]);
			if (checkLevel && lvl !== 'ok') {
				warn = lvl;
				stage = 'level';
				buzz(400);
				return;
			}
			phase = 'capture';
			frac = 0;
			buzz();
			const c = await mic.run(CAPTURE_MS, signal, (f, resp) => {
				frac = f;
				session.live = resp;
			});
			buzz();
			session.live = null;
			captures = [...captures, { name: `mic: ${SPOTS[idx].title.toLowerCase()}`, ...c }];
			if (idx < SPOTS.length - 1) {
				idx++;
				runSpot();
			} else finish(captures);
		} catch (e) {
			if ((e as DOMException).name !== 'AbortError') throw e;
		}
	}

	function finish(recs: Recording[]) {
		session.setRecs(seat, recs);
		cleanup();
		goto(resolve('/results'));
	}

	function cancel() {
		ctrl?.abort();
		session.live = null;
		stage = 'intro';
	}

	function cleanup() {
		ctrl?.abort();
		mic?.close();
		mic = null;
		if (audio.noiseOn) audio.toggleNoise();
		session.live = null;
		wake?.release();
		wake = null;
	}
	onDestroy(cleanup);

	async function upload(e: Event & { currentTarget: HTMLInputElement }) {
		const input = e.currentTarget;
		const failed: string[] = [];
		for (const f of input.files ?? []) {
			note = `Analyzing ${f.name}…`;
			try {
				captures = [...captures, analyze(await audio.decode(f), f.name)];
			} catch (err) {
				failed.push(f.name + (err instanceof TooShortError ? ' (too short, needs 10+ s)' : ''));
			}
		}
		note = failed.length ? `Could not read: ${failed.join(', ')}. Try WAV or M4A.` : '';
		input.value = '';
	}

	function downloadWav() {
		const sr = 44100;
		const url = URL.createObjectURL(new Blob([encodeWav(pinkNoise(sr * 60), sr)], { type: 'audio/wav' }));
		const a = Object.assign(document.createElement('a'), { href: url, download: 'pink-noise-60s.wav' });
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	const toggleOn = 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 flex-1 text-sm';
</script>

<Screen
	title={stage === 'upload' ? 'Upload recordings' : 'Measure'}
	eyebrow={SEAT_NAMES[seat]}
	back={stage === 'intro' ? { href: resolve('/prepare'), label: 'Prepare' } : undefined}
>
	{#if stage === 'intro'}
		<div class="grid gap-2">
			<p class="text-sm font-medium">Pink noise from</p>
			<ToggleGroup.Root type="single" variant="outline" value={source} onValueChange={(v) => v && (source = v as typeof source)} class="w-full">
				<ToggleGroup.Item value="phone" class={toggleOn}>This phone</ToggleGroup.Item>
				<ToggleGroup.Item value="usb" class={toggleOn}>USB / other</ToggleGroup.Item>
			</ToggleGroup.Root>
		</div>

		{#if source === 'phone'}
			<p class="text-base/relaxed">
				Connect the phone to the car over Bluetooth. Play the noise and set the car volume to your
				<b>normal listening level</b>.
			</p>
			<Button variant="outline" class={MID} onclick={() => audio.toggleNoise()}>
				{#if audio.noiseOn}<StopIcon weight="fill" /> Stop pink noise{:else}<PlayIcon weight="fill" /> Test pink noise{/if}
			</Button>
			<p class="text-muted-foreground text-xs/relaxed">
				If the sound turns thin or mono once measuring starts, the phone switched Bluetooth to call mode. Use a USB stick
				with the pink noise file instead.
			</p>
		{:else}
			<p class="text-base/relaxed">
				Play <b>pink-noise-60s.wav</b> on repeat from a USB stick at your normal listening level, then start.
			</p>
			<Button variant="outline" class={MID} onclick={downloadWav}><DownloadIcon /> Download pink-noise-60s.wav</Button>
		{/if}

		<p class="text-muted-foreground text-sm/relaxed">
			The page records 5 spots around your head, 5 seconds each, and averages them. The phone vibrates when each recording
			starts and stops.
		</p>
		<button type="button" class="text-primary justify-self-start text-sm underline-offset-4 hover:underline" onclick={() => (stage = 'upload')}>
			Upload recordings instead
		</button>
	{:else if stage === 'run' || stage === 'level'}
		{@const spot = SPOTS[idx]}
		<div class="grid gap-4" aria-live="polite">
			<div class="flex items-baseline justify-between">
				<span class="text-muted-foreground font-mono text-sm tabular-nums">spot {idx + 1} / {SPOTS.length}</span>
				<span class="flex gap-1">
					{#each SPOTS as s, i (s.title)}
						<i class={cn('size-2.5 rounded-full', i < idx ? 'bg-primary' : i === idx ? 'bg-foreground' : 'bg-muted')}></i>
					{/each}
				</span>
			</div>
			<h2 class="text-4xl/[1.05] font-bold tracking-[-0.03em]">{spot.title}</h2>
			<p class="text-muted-foreground text-base">{spot.hint}</p>

			{#if stage === 'level' && warn}
				<div class="border-warn text-warn flex gap-3 border p-4 text-base">
					<WarningIcon class="mt-0.5 size-5 shrink-0" />
					<p>{LEVEL_HELP[warn]}</p>
				</div>
			{:else}
				<div class="grid gap-2">
					<div class="flex items-baseline justify-between">
						<span class={cn('text-lg font-bold', phase === 'capture' && 'text-chart-4')}>
							{phase === 'settle' ? 'Hold still…' : '● Recording'}
						</span>
						<span class="font-mono text-7xl/none font-semibold tabular-nums">{left}</span>
					</div>
					<div class="bg-muted h-2">
						<div class={cn('h-full transition-[width] duration-100', phase === 'settle' ? 'bg-muted-foreground' : 'bg-chart-4')} style:width="{frac * 100}%"></div>
					</div>
				</div>
				{#if session.live}
					<ResponseChart
						label="Live response"
						lines={[
							{ curve: session.target, class: 'stroke-foreground', width: 1.5, dash: '5 4' },
							{ curve: session.live, class: 'stroke-chart-4', width: 2 }
						]}
					/>
				{/if}
			{/if}
		</div>
	{:else}
		<p class="text-muted-foreground text-sm/relaxed">
			Record with noise reduction and auto gain off (Android: ASR or RecForge in WAV; iPhone: Voice Memos lossless). Best:
			3 to 5 recordings of 15 seconds, each in a slightly different spot around your head.
		</p>
		<label class={cn(buttonVariants({ variant: 'outline' }), MID, 'cursor-pointer focus-within:ring-1 focus-within:ring-ring/50')}>
			<UploadIcon /> Choose recordings
			<input type="file" multiple class="sr-only" accept="audio/*,video/*,.wav,.m4a,.mp3,.aac,.ogg,.opus,.mp4,.mov,.3gp,.amr" onchange={upload} />
		</label>
		<button type="button" class="text-primary justify-self-start text-sm underline-offset-4 hover:underline" onclick={() => ((stage = 'intro'), (note = ''))}>
			Measure with the mic instead
		</button>
		{#if captures.length}
			<ul class="grid gap-1 font-mono text-sm">
				{#each captures as r, i (i)}
					<li class="flex justify-between gap-3">
						<span class="truncate">{r.name}</span>
						<span class={cn('tabular-nums', lvlOf([r]) !== 'ok' ? 'text-warn' : 'text-muted-foreground')}>
							{r.dur.toFixed(0)} s · {lvlOf([r])}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	{#if note}
		<p role="status" class="text-muted-foreground text-sm">{note}</p>
	{/if}

	{#snippet actions()}
		{#if stage === 'intro'}
			<Button class={BIG} onclick={start} disabled={starting}>
				{#if starting}<SpinnerIcon class="animate-spin" /> Waiting for the microphone…{:else}Start measuring{/if}
			</Button>
		{:else if stage === 'run'}
			<Button variant="outline" class={MID} onclick={cancel}>Cancel</Button>
		{:else if stage === 'level'}
			<Button class={BIG} onclick={() => runSpot()}>Retry</Button>
			<Button variant="outline" class={MID} onclick={() => runSpot(false)}>Record anyway</Button>
		{:else}
			<Button class={BIG} disabled={!captures.length} onclick={() => finish(captures)}>
				Use {captures.length || ''} recording{captures.length === 1 ? '' : 's'}
			</Button>
		{/if}
	{/snippet}
</Screen>
