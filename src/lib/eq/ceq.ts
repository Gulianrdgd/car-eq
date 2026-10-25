// Text protocol between the tool and Claude.
// CEQ1    = what "Copy for Claude" produces (compact, fixed grids, integers).
// CEQ-SET = what Claude replies with (new slider values, target, note, next step).

import { GRID, PRESETS, fmtF, parseList, signed, targetAt, type Curve, type PresetKey } from './dsp';

// ---------- 1/3-octave grid ----------

/** The 31 ISO 1/3-octave centres, as written in the R= line. */
export const R_LABELS = ['20', '25', '31', '40', '50', '63', '80', '100', '125', '160', '200', '250', '315', '400', '500', '630', '800', '1k', '1.25k', '1.6k', '2k', '2.5k', '3.15k', '4k', '5k', '6.3k', '8k', '10k', '12.5k', '16k', '20k'];
/** Exact base-2 centres matching R_LABELS (index 17 = 1 kHz). */
export const R_GRID = R_LABELS.map((_, i) => 1000 * Math.pow(2, (i - 17) / 3));

/** No -0 in the output. */
const int = (v: number) => Math.round(v) || 0;

/** 1/6-octave curve -> integer dB on the 1/3-octave grid (power-weighted 1/4, 1/2, 1/4). */
export function toThird(curve: Curve): (number | null)[] {
	return R_GRID.map((fc) => {
		const c = GRID.findIndex((f) => Math.abs(Math.log2(f / fc)) < 0.02);
		if (c < 0 || curve[c] == null) return null;
		let p = 0, w = 0;
		for (const [j, wt] of [[c - 1, 0.25], [c, 0.5], [c + 1, 0.25]]) {
			const v = curve[j];
			if (v != null) {
				p += wt * Math.pow(10, v / 10);
				w += wt;
			}
		}
		return int(10 * Math.log10(p / w));
	});
}

// ---------- export: CEQ1 ----------

export type Lvl = 'ok' | 'quiet' | 'clip';
export type Seat = 'driver' | 'passenger';

export type SeatExport = { seat: Seat; n: number; fit: number | null; prev?: number | null; lvl: Lvl; resp: Curve };

export type ExportInput = {
	car: string;
	bands: number[];
	range: number;
	step: number;
	it: number;
	cur: number[];
	preset: PresetKey;
	bass: number;
	treble: number;
	seats: SeatExport[];
	ear: Record<string, number>;
	/** [iteration, fit] pairs, oldest first */
	hist: [number, number][];
};

export const CEQ1_HEADER =
	'CEQ1 car EQ tuning data from a phone measurement tool. Spec: bands=EQ slider frequencies, rng=max ± per slider, it=iteration, cur=slider values on the head unit now (one per band), tgt=target preset, s=seat, n=captures averaged, fit=RMS deviation from target 100 Hz-10 kHz in dB, prev=fit of previous iteration, lvl=ok|quiet|clip, r=response in dB on the R grid (0 = mean 250-2k Hz, pink noise, phone mic weak <80 Hz), t=target on same grid, x=missing, e=ear match gain per band, hist=iteration:fit. Reply with: CEQ-SET, then cur=<absolute value per band, same order, within ±rng, multiples of step>, tgt=mild|harman|flat bass=<dB> treble=<dB>, note=<one line for the user>, next=measure|passenger|ear:<bands>|done, then END.';

export function exportCeq(o: ExportInput): string {
	const L: string[] = [CEQ1_HEADER];
	if (o.car.trim()) L.push(`car=${o.car.trim()}`);
	L.push(`bands=${o.bands.map(fmtF).join(',')} rng=${o.range} step=${o.step}`);
	L.push(`it=${o.it} cur=${o.cur.join(',')}`);
	L.push(`tgt=${o.preset} bass=${o.bass} treble=${o.treble}`);
	L.push(`R=${R_LABELS.join(',')}`);

	const t = `t=${R_GRID.map((f) => int(targetAt(f, o.preset, o.bass, o.treble))).join(',')}`;
	o.seats.forEach((s, i) => {
		let head = `s=${s.seat} n=${s.n}`;
		if (s.fit != null) head += ` fit=${s.fit.toFixed(1)}`;
		if (s.prev != null) head += ` prev=${s.prev.toFixed(1)}`;
		L.push(`${head} lvl=${s.lvl}`);
		L.push(`r=${toThird(s.resp).map((v) => v ?? 'x').join(',')}`);
		if (i === 0) L.push(t);
	});
	if (!o.seats.length) L.push(t);

	const eK = Object.keys(o.ear).sort((a, b) => +a - +b);
	if (eK.length) L.push(`e=${eK.map((k) => `${fmtF(+k)}:${signed(o.ear[k])}`).join(',')}`);
	if (o.hist.length) L.push(`hist=${o.hist.slice(-5).map(([it, f]) => `${it}:${f.toFixed(1)}`).join(' ')}`);
	return L.join('\n');
}

// ---------- import: CEQ-SET ----------

export type Next =
	| { kind: 'measure' }
	| { kind: 'passenger' }
	| { kind: 'done' }
	/** bands: empty = all bands */
	| { kind: 'ear'; bands: number[] };

export type CeqSet = {
	cur: number[];
	preset?: PresetKey;
	bass?: number;
	treble?: number;
	note: string;
	next: Next;
};

export type ParseResult = { ok: true; value: CeqSet; warnings: string[] } | { ok: false; error: string };

/** Slider ranges of the target controls. */
export const BASS_RANGE = [-6, 8] as const;
export const TREBLE_RANGE = [-5, 5] as const;

const KEY_RE = /\b(cur|tgt|target|bass|treble|note|next)\s*[:=]\s*/gi;

/** Strip quote marks, list bullets, bold and backticks around a line. */
const clean = (l: string) => l.replace(/^[\s>*\-`]+/, '').replace(/[\s`*]+$/, '');

/** "+3", "−2" (unicode minus), "2." -> number, or NaN */
const num = (s: string) => Number(s.replace(/[−–]/g, '-').replace(/^\+/, ''));

/**
 * Find the CEQ-SET block anywhere in a chat reply and validate it against the user's EQ.
 * Tolerates code fences, `key: value`, `+` signs and surrounding text.
 */
export function parseCeqSet(text: string, eq: { bands: number[]; range: number; step: number }): ParseResult {
	const lines = text.split(/\r?\n/);
	const start = lines.findIndex((l) => /^CEQ-SET\b/i.test(clean(l)));
	if (start < 0)
		return { ok: false, error: "No CEQ-SET block found. Paste Claude's whole reply; it needs a line that says CEQ-SET." };

	// collect key -> value (with 1-based line number) until END, a closing fence, or the end of the text
	const fields = new Map<string, { v: string; line: number }>();
	for (let i = start; i < lines.length; i++) {
		let c = clean(lines[i]);
		if (i === start) c = c.replace(/^CEQ-SET\b/i, '');
		else if (/^`{3,}/.test(lines[i].trim()) || /^END\b/i.test(c)) break;
		const hits = [...c.matchAll(KEY_RE)];
		for (let h = 0; h < hits.length; h++) {
			const key = hits[h][1].toLowerCase().replace('target', 'tgt');
			const from = hits[h].index! + hits[h][0].length;
			// a note runs to the end of the line, so it may contain anything
			const to = key === 'note' ? c.length : (hits[h + 1]?.index ?? c.length);
			fields.set(key, { v: c.slice(from, to).trim(), line: i + 1 });
			if (key === 'note') break;
		}
	}

	const warnings: string[] = [];
	const at = (line: number) => `Line ${line}: `;

	// cur: required, one value per band
	const cur = fields.get('cur');
	if (!cur) return { ok: false, error: 'The CEQ-SET block has no "cur=" line with the slider values.' };
	const toks = cur.v.split(/[\s,;]+/).filter(Boolean);
	const vals = toks.map(num);
	const bad = vals.findIndex((v) => !isFinite(v));
	if (bad >= 0) return { ok: false, error: `${at(cur.line)}"${toks[bad]}" in cur is not a number.` };
	if (vals.length !== eq.bands.length)
		return {
			ok: false,
			error: `${at(cur.line)}cur has ${vals.length} values, but your EQ has ${eq.bands.length} bands (${eq.bands.map(fmtF).join(', ')}). Claude must send exactly one value per band.`
		};
	const values = vals.map((v, i) => {
		const c = Math.max(-eq.range, Math.min(eq.range, v));
		const r = Math.round(c / eq.step) * eq.step || 0;
		if (c !== v) warnings.push(`${fmtF(eq.bands[i])} Hz: ${signed(v)} is outside ±${eq.range}, set to ${signed(r)}.`);
		return r;
	});
	const value: CeqSet = { cur: values, note: '', next: { kind: 'measure' } };

	const tgt = fields.get('tgt');
	if (tgt) {
		const p = tgt.v.toLowerCase();
		if (!(p in PRESETS)) return { ok: false, error: `${at(tgt.line)}target "${tgt.v}" is unknown. Use mild, harman or flat.` };
		value.preset = p as PresetKey;
	}

	for (const [key, [lo, hi]] of [['bass', BASS_RANGE], ['treble', TREBLE_RANGE]] as const) {
		const f = fields.get(key);
		if (!f) continue;
		const v = num(f.v);
		if (!isFinite(v)) return { ok: false, error: `${at(f.line)}${key} "${f.v}" is not a number.` };
		const c = Math.round(Math.max(lo, Math.min(hi, v)));
		if (c !== Math.round(v)) warnings.push(`${key} ${signed(v)} is outside ${lo} to ${signed(hi)}, set to ${signed(c)}.`);
		value[key] = c;
	}

	const note = fields.get('note');
	if (note) value.note = note.v.replace(/^["']|["']$/g, '');

	const next = fields.get('next');
	if (next) {
		const v = next.v.toLowerCase();
		const ear = v.match(/^ear\b\s*[:=]?\s*(.*)$/);
		if (v === 'measure' || v === 'passenger' || v === 'done') value.next = { kind: v };
		else if (ear) {
			const asked = parseList(ear[1]);
			const bands = asked.flatMap((f) => eq.bands.filter((b) => Math.abs(Math.log2(b / f)) < 0.1)).filter((b, i, a) => a.indexOf(b) === i);
			if (asked.length && !bands.length) warnings.push(`Ear bands ${ear[1]} are not on your EQ, showing all bands.`);
			value.next = { kind: 'ear', bands };
		} else warnings.push(`next=${next.v} not understood, you will measure again.`);
	}

	return { ok: true, value, warnings };
}
