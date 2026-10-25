<script lang="ts">
	import * as Select from '#lib/components/ui/select/index.js';
	import { Slider } from '#lib/components/ui/slider/index.js';
	import Field from './field.svelte';
	import { session } from '#lib/eq/session.svelte.js';
	import { BASS_RANGE, TREBLE_RANGE } from '#lib/eq/ceq.js';
	import { PRESETS, signed, type PresetKey } from '#lib/eq/dsp.js';
</script>

<div class="grid gap-5 sm:grid-cols-[1.1fr_1fr_1fr] sm:items-end">
	<Field label="Target sound">
		<Select.Root type="single" value={session.preset} onValueChange={(v) => (session.preset = v as PresetKey)}>
			<Select.Trigger class="h-11 w-full text-sm">{PRESETS[session.preset].label}</Select.Trigger>
			<Select.Content>
				{#each Object.entries(PRESETS) as [key, p] (key)}
					<Select.Item value={key} label={p.label} class="py-3 text-sm">
						{p.label} <span class="text-muted-foreground">{p.hint}</span>
					</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</Field>
	<Field label="Extra bass" value="{signed(session.bass)} dB">
		<Slider type="single" bind:value={session.bass} min={BASS_RANGE[0]} max={BASS_RANGE[1]} step={1} class="h-11" aria-label="Extra bass" />
	</Field>
	<Field label="Treble tilt" value="{signed(session.treble)} dB">
		<Slider type="single" bind:value={session.treble} min={TREBLE_RANGE[0]} max={TREBLE_RANGE[1]} step={1} class="h-11" aria-label="Treble tilt" />
	</Field>
</div>
