<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import Screen, { BIG, MID } from '#lib/components/eq/screen.svelte';
	import EqValues from '#lib/components/eq/eq-values.svelte';
	import ClipboardIcon from 'phosphor-svelte/lib/ClipboardText';
	import WarningIcon from 'phosphor-svelte/lib/Warning';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { session } from '#lib/eq/session.svelte.js';
	import { parseCeqSet } from '#lib/eq/ceq.js';
	import { PRESETS, signed } from '#lib/eq/dsp.js';
	import { NEXT_LABELS } from '#lib/eq/nav.js';

	let text = $state('');
	let clipboardNote = $state('');

	const result = $derived(text.trim() ? parseCeqSet(text, { bands: session.bands, range: session.range, step: session.step }) : null);

	/** Target changes as readable lines, e.g. "bass 0 → +1 dB". */
	const targetChanges = $derived.by(() => {
		if (!result?.ok) return [];
		const v = result.value, out: string[] = [];
		if (v.preset && v.preset !== session.preset) out.push(`target ${PRESETS[session.preset].label} → ${PRESETS[v.preset].label}`);
		if (v.bass != null && v.bass !== session.bass) out.push(`extra bass ${signed(session.bass)} → ${signed(v.bass)} dB`);
		if (v.treble != null && v.treble !== session.treble) out.push(`treble tilt ${signed(session.treble)} → ${signed(v.treble)} dB`);
		return out;
	});

	async function pasteClipboard() {
		try {
			text = await navigator.clipboard.readText();
			clipboardNote = '';
		} catch {
			clipboardNote = 'This browser does not allow reading the clipboard. Long-press the box and choose Paste.';
		}
	}
</script>

<Screen title="Paste Claude's reply" eyebrow="Iteration {session.it}" back={{ href: resolve('/results'), label: 'Results' }}>
	<p class="text-muted-foreground text-sm/relaxed">
		Paste the whole reply. The page picks out the <code>CEQ-SET</code> block and ignores the rest.
	</p>
	<Button variant="outline" class={MID} onclick={pasteClipboard}><ClipboardIcon /> Paste from clipboard</Button>
	{#if clipboardNote}<p class="text-muted-foreground text-xs">{clipboardNote}</p>{/if}
	<Textarea
		bind:value={text}
		placeholder="CEQ-SET&#10;cur=…&#10;END"
		class="min-h-40 font-mono text-base md:text-sm"
		aria-label="Claude's reply"
		aria-invalid={result != null && !result.ok}
	/>

	{#if result && !result.ok}
		<div class="border-destructive text-destructive flex gap-3 border p-4 text-sm/relaxed" role="alert">
			<WarningIcon class="mt-0.5 size-5 shrink-0" />
			<p>{result.error}</p>
		</div>
	{:else if result?.ok}
		{@const v = result.value}
		<section class="grid gap-3">
			<h2 class="text-lg font-semibold tracking-tight">New slider values</h2>
			<EqValues bands={session.bands} values={v.cur} prev={session.cur} />
		</section>
		{#if targetChanges.length}
			<ul class="grid gap-1 text-sm">
				{#each targetChanges as c (c)}<li>{c}</li>{/each}
			</ul>
		{/if}
		{#if v.note}
			<blockquote class="border-primary border-l-2 pl-3 text-base/relaxed">{v.note}</blockquote>
		{/if}
		{#each result.warnings as w (w)}
			<p class="text-warn flex gap-2 text-sm"><WarningIcon class="mt-0.5 size-4 shrink-0" />{w}</p>
		{/each}
		<p class="text-muted-foreground text-xs">Afterwards: {NEXT_LABELS[v.next.kind].replace('Done, ', '')}.</p>
	{/if}

	{#snippet actions()}
		<Button
			class={BIG}
			disabled={!result?.ok}
			onclick={() => {
				if (!result?.ok) return;
				session.commit(result.value);
				goto(resolve('/apply'));
			}}
		>
			Apply
		</Button>
	{/snippet}
</Screen>
