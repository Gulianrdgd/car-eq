import {
	GRID,
	avgResp,
	fitScore,
	parseList,
	suggestGains,
	targetAt,
	type Basis,
	type Curve,
	type EarUse,
	type PresetKey,
	type Recording
} from './dsp';
import { exportCeq, toThird, type CeqSet, type Lvl, type Next, type Seat } from './ceq';

export type { Seat };
export const SEATS: Seat[] = ['driver', 'passenger'];
export const SEAT_NAMES: Record<Seat, string> = { driver: 'Driver seat', passenger: 'Passenger seat' };
/** Tailwind classes per seat, backed by --chart-* tokens. */
export const SEAT_COLORS: Record<Seat, { stroke: string; bg: string }> = {
	driver: { stroke: 'stroke-chart-1', bg: 'bg-chart-1' },
	passenger: { stroke: 'stroke-chart-2', bg: 'bg-chart-2' }
};

/** One closed iteration of the loop: what was on the head unit and how it measured. */
export type Iteration = {
	it: number;
	ts: number;
	cur: number[];
	preset: PresetKey;
	bass: number;
	treble: number;
	fit: number | null;
	/** driver (or passenger) response, integer dB on the 1/3-octave grid */
	resp: (number | null)[] | null;
	/** the note that came with these values */
	note: string;
};

export function lvlOf(recs: Pick<Recording, 'clip' | 'rms'>[]): Lvl {
	if (recs.some((r) => r.clip > 50)) return 'clip';
	if (recs.some((r) => r.rms < -45)) return 'quiet';
	return 'ok';
}

const DEFAULT_BANDS = '25, 40, 63, 100, 160, 250, 400, 630, 1k, 2.5k, 6.3k, 16k';
const KEY = 'careq.v3';
const PERSISTED = ['car', 'bandsText', 'range', 'step', 'earUse', 'setupDone', 'preset', 'bass', 'treble', 'it', 'cur', 'note', 'next', 'checklist', 'ear', 'recs', 'history'] as const;

const storage = {
	get(): Record<string, unknown> {
		try {
			return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
		} catch {
			return {};
		}
	},
	set(v: unknown) {
		try {
			localStorage.setItem(KEY, JSON.stringify(v));
		} catch {
			/* private mode, quota */
		}
	}
};

class Session {
	// setup
	car = $state('');
	bandsText = $state(DEFAULT_BANDS);
	range = $state(12);
	step = $state(1);
	earUse = $state<EarUse>('bass');
	setupDone = $state(false);

	// target
	preset = $state<PresetKey>('harman');
	bass = $state(0);
	treble = $state(0);

	// the loop
	it = $state(1);
	/** slider values on the head unit right now */
	cur = $state<number[]>(parseList(DEFAULT_BANDS).map(() => 0));
	note = $state('');
	next = $state<Next>({ kind: 'measure' });
	checklist = $state<Record<string, boolean>>({});
	ear = $state<Record<string, number>>({});
	recs = $state.raw<Record<Seat, Recording[]>>({ driver: [], passenger: [] });
	history = $state.raw<Iteration[]>([]);

	/** running response while capturing; not persisted */
	live = $state.raw<Curve | null>(null);

	constructor() {
		const s = storage.get();
		Object.assign(this, Object.fromEntries(PERSISTED.flatMap((k) => (s[k] != null ? [[k, s[k]]] : []))));
	}

	/** Call inside an $effect: reads every persisted field, so it re-runs on change. */
	save() {
		storage.set(Object.fromEntries(PERSISTED.map((k) => [k, $state.snapshot(this[k])])));
	}

	bands = $derived(
		parseList(this.bandsText)
			.filter((f) => f >= 10 && f <= 22000)
			.sort((a, b) => a - b)
	);

	target = $derived(GRID.map((f) => targetAt(f, this.preset, this.bass, this.treble)));

	responses = $derived({ driver: avgResp(this.recs.driver), passenger: avgResp(this.recs.passenger) });
	fits = $derived({
		driver: this.responses.driver && fitScore(this.responses.driver, this.target),
		passenger: this.responses.passenger && fitScore(this.responses.passenger, this.target)
	});
	lvls = $derived({ driver: lvlOf(this.recs.driver), passenger: lvlOf(this.recs.passenger) });
	measured = $derived(SEATS.some((s) => this.recs[s].length > 0));

	/** The seat the tuning is based on: driver, unless only the passenger was measured. */
	basisSeat = $derived<Seat | null>(this.recs.driver.length ? 'driver' : this.recs.passenger.length ? 'passenger' : null);
	basis = $derived.by((): Basis | null => {
		const s = this.basisSeat;
		return s && { src: SEAT_NAMES[s].toLowerCase(), resp: this.responses[s]! };
	});
	fit = $derived(this.basisSeat ? this.fits[this.basisSeat] : null);

	prev = $derived(this.history.at(-1) ?? null);

	/** The tool's own suggestion (the v2 algorithm), starting from the current values. */
	suggestion = $derived(
		suggestGains({
			bands: this.bands,
			cur: this.cur,
			range: this.range,
			step: this.step,
			earUse: this.earUse,
			ear: this.ear,
			base: this.basis,
			target: this.target
		})
	);

	exportText = $derived(
		exportCeq({
			car: this.car,
			bands: this.bands,
			range: this.range,
			step: this.step,
			it: this.it,
			cur: this.cur,
			preset: this.preset,
			bass: this.bass,
			treble: this.treble,
			seats: SEATS.filter((s) => this.recs[s].length).map((s) => ({
				seat: s,
				n: this.recs[s].length,
				fit: this.fits[s],
				prev: s === this.basisSeat ? this.prev?.fit : null,
				lvl: this.lvls[s],
				resp: this.responses[s]!
			})),
			ear: this.ear,
			hist: [...this.history, { it: this.it, fit: this.fit }].flatMap((h) => (h.fit != null ? [[h.it, h.fit] as [number, number]] : []))
		})
	);

	saveSetup(o: { car: string; bandsText: string; range: number; step: number; earUse: EarUse; preset: PresetKey }) {
		Object.assign(this, o, { setupDone: true });
		// keep one value per band, within range
		this.cur = this.bands.map((_, i) => Math.max(-this.range, Math.min(this.range, this.cur[i] ?? 0)));
	}

	setRecs(seat: Seat, recs: Recording[]) {
		this.recs = { ...this.recs, [seat]: recs };
	}

	/** Close this iteration and start the next one with new values on the head unit. */
	commit(set: CeqSet) {
		this.history = [
			...this.history,
			{
				it: this.it,
				ts: Date.now(),
				cur: [...this.cur],
				preset: this.preset,
				bass: this.bass,
				treble: this.treble,
				fit: this.fit,
				resp: this.basis && toThird(this.basis.resp),
				note: this.note
			}
		];
		this.it++;
		this.cur = set.cur;
		this.preset = set.preset ?? this.preset;
		this.bass = set.bass ?? this.bass;
		this.treble = set.treble ?? this.treble;
		this.note = set.note;
		this.next = set.next;
		// measurements and ear matches belong to the old values
		this.recs = { driver: [], passenger: [] };
		this.ear = {};
		this.checklist = {};
	}

	applySuggestion() {
		this.commit({ cur: this.suggestion.map((o) => o.g), note: 'Tool suggestion.', next: { kind: 'measure' } });
	}

	restore(h: Iteration) {
		this.commit({
			cur: h.cur,
			preset: h.preset,
			bass: h.bass,
			treble: h.treble,
			note: `Restored the values of iteration ${h.it}.`,
			next: { kind: 'measure' }
		});
	}

	/** Forget all iterations, keep the setup. */
	startOver() {
		this.it = 1;
		this.cur = this.bands.map(() => 0);
		this.note = '';
		this.next = { kind: 'measure' };
		this.history = [];
		this.recs = { driver: [], passenger: [] };
		this.ear = {};
		this.checklist = {};
	}
}

export const session = new Session();
