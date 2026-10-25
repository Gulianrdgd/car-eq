<script lang="ts">
	import * as Select from '#lib/components/ui/select/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import Screen, { BIG } from '#lib/components/eq/screen.svelte';
	import Field from '#lib/components/eq/field.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { session } from '#lib/eq/session.svelte.js';
	import { fmtF, parseList, type EarUse } from '#lib/eq/dsp.js';

	const EAR_USE: Record<EarUse, string> = {
		bass: 'Use for bass below 100 Hz',
		all: 'Use for all bands',
		off: 'Ignore'
	};

	// edit a draft, write it to the session on save
	let car = $state(session.car);
	let bandsText = $state(session.bandsText);
	let range = $state(session.range);
	let step = $state(String(session.step));
	let earUse = $state(session.earUse);
	let confirmReset = $state(false);

	const bands = $derived(parseList(bandsText).filter((f) => f >= 10 && f <= 22000).sort((a, b) => a - b));
	const bandsError = $derived(bands.length < 3 ? 'Enter at least 3 band frequencies, separated by commas.' : '');
	const rangeError = $derived(!(range >= 1 && range <= 24) ? 'Use a number from 1 to 24.' : '');
	const valid = $derived(!bandsError && !rangeError);

	function save() {
		const first = !session.setupDone;
		session.saveSetup({ car, bandsText, range: Math.round(range), step: +step, earUse });
		goto(resolve(first ? '/prepare' : '/'));
	}
</script>

<Screen
	title="Setup"
	eyebrow={session.setupDone ? 'Your head unit' : 'First run'}
	back={session.setupDone ? { href: resolve('/'), label: 'Back to tuning' } : undefined}
>
	<p class="text-muted-foreground text-sm/relaxed">
		Describe the EQ on your head unit once. You can change this later with the gear icon.
	</p>

	<Field label="Car" for="car">
		<Input id="car" bind:value={car} placeholder="Golf 7 stock speakers" class="h-11 text-base md:text-sm" autocomplete="off" />
	</Field>

	<Field label="Band frequencies in Hz" for="bands">
		<Textarea
			id="bands"
			bind:value={bandsText}
			rows={2}
			class="min-h-0 resize-none font-mono text-base md:text-sm"
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			aria-invalid={!!bandsError}
			aria-describedby="bands-help"
		/>
		<p id="bands-help" class={bandsError ? 'text-destructive text-xs' : 'text-muted-foreground font-mono text-xs'}>
			{#if bandsError}
				{bandsError} Copy them from your EQ screen, e.g. 63, 250, 1k, 2.5k.
			{:else}
				{bands.length} bands: {bands.map(fmtF).join(' · ')}
			{/if}
		</p>
	</Field>

	<div class="flex flex-wrap items-end gap-4">
		<Field label="Max ± per slider" for="range">
			<Input id="range" type="number" min={1} max={24} bind:value={range} class="h-11 w-24 font-mono text-base md:text-sm" inputmode="numeric" aria-invalid={!!rangeError} />
		</Field>
		<Field label="Step">
			<ToggleGroup.Root type="single" variant="outline" value={step} onValueChange={(v) => v && (step = v)}>
				{#each ['0.5', '1', '2'] as s (s)}
					<ToggleGroup.Item value={s} class="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 min-w-12 px-4 text-sm">
						{s}
					</ToggleGroup.Item>
				{/each}
			</ToggleGroup.Root>
		</Field>
	</div>

	<Field label="Ear tuning results">
		<Select.Root type="single" value={earUse} onValueChange={(v) => (earUse = v as EarUse)}>
			<Select.Trigger class="w-full text-sm data-[size=default]:h-11">{EAR_USE[earUse]}</Select.Trigger>
			<Select.Content>
				{#each Object.entries(EAR_USE) as [value, label] (value)}
					<Select.Item {value} {label} class="py-3 text-sm" />
				{/each}
			</Select.Content>
		</Select.Root>
	</Field>

	{#if rangeError}<p class="text-destructive -mt-3 text-xs">Max ± per slider: {rangeError}</p>{/if}

	{#if session.setupDone}
		<div class="grid gap-2 border-t pt-5">
			<p class="text-muted-foreground text-xs">Start over forgets all iterations and sets every slider back to 0.</p>
			<Button
				variant="destructive"
				class="h-11 w-fit"
				onclick={() => {
					if (!confirmReset) return void (confirmReset = true);
					session.startOver();
					confirmReset = false;
					goto(resolve('/prepare'));
				}}
			>
				{confirmReset ? 'Tap again to start over' : 'Start over'}
			</Button>
		</div>
	{/if}

	{#snippet actions()}
		<Button class={BIG} disabled={!valid} onclick={save}>Save</Button>
	{/snippet}
</Screen>
