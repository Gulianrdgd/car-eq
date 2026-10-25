// Pure signal-processing and EQ math. No DOM, no state.

export type Curve = (number | null)[];
export type Pt = [number, number];

/** Linear interpolation on a log-frequency axis. */
export function lerpLog(pts: Pt[], f: number): number {
	if (f <= pts[0][0]) return pts[0][1];
	const x = Math.log10(f);
	for (let i = 1; i < pts.length; i++) {
		if (f <= pts[i][0]) {
			const a = Math.log10(pts[i - 1][0]);
			const b = Math.log10(pts[i][0]);
			return pts[i - 1][1] + ((x - a) / (b - a)) * (pts[i][1] - pts[i - 1][1]);
		}
	}
	return pts[pts.length - 1][1];
}

/** 1/6-octave grid, 20 Hz .. 20 kHz. */
export const GRID: number[] = [];
for (let n = -36; n <= 26; n++) {
	const f = 1000 * Math.pow(2, n / 6);
	if (f >= 19.5 && f <= 20500) GRID.push(f);
}

// ---------- targets ----------

export const PRESETS = {
	mild: {
		label: 'Car, mild',
		hint: 'good for stock speakers',
		pts: [[20, 5], [40, 5], [80, 3.5], [150, 1], [250, 0], [1000, 0], [2000, -0.5], [4000, -1.5], [8000, -3], [16000, -5], [20000, -6]] as Pt[]
	},
	harman: {
		label: 'Car, Harman style',
		hint: 'more bass',
		pts: [[20, 9], [40, 9], [70, 7.5], [120, 4], [200, 1], [300, 0], [1000, 0], [2000, -1], [4000, -2], [8000, -4], [16000, -7], [20000, -8]] as Pt[]
	},
	flat: {
		label: 'Flat',
		hint: 'studio reference',
		pts: [[20, 0], [20000, 0]] as Pt[]
	}
};
export type PresetKey = keyof typeof PRESETS;

export function targetAt(f: number, preset: PresetKey, bass: number, treble: number): number {
	const shelf = bass / (1 + Math.pow(f / 110, 2.5));
	const tilt = treble * Math.max(0, Math.min(1, Math.log2(f / 1000) / 4));
	return lerpLog(PRESETS[preset].pts, f) + shelf + tilt;
}

/** Approximate equal-loudness offsets (dB, octave-band noise ~65 phon, relative to 1 kHz). */
export const ELC: Pt[] = [[20, 30], [31.5, 21], [40, 17], [50, 14], [63, 11], [80, 8], [100, 6], [125, 4.5], [160, 3], [200, 2], [250, 1.5], [315, 1], [400, 0.5], [500, 0], [1000, 0], [2000, -1.5], [3150, -4], [4000, -4], [5000, -3], [6300, 0], [8000, 4], [10000, 6], [12500, 7], [16000, 6], [20000, 10]];

/** Estimated in-car level at fc from an ear-match gain. */
export const earEstimate = (fc: number, gain: number) => lerpLog(ELC, fc) - gain;

/** Pink noise, unit-ish level (Paul Kellet's filter). */
export function pinkNoise(n: number): Float32Array {
	const d = new Float32Array(n);
	let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
	for (let i = 0; i < n; i++) {
		const w = Math.random() * 2 - 1;
		b0 = 0.99886 * b0 + w * 0.0555179;
		b1 = 0.99332 * b1 + w * 0.0750759;
		b2 = 0.969 * b2 + w * 0.153852;
		b3 = 0.8665 * b3 + w * 0.3104856;
		b4 = 0.55 * b4 + w * 0.5329522;
		b5 = -0.7616 * b5 - w * 0.016898;
		d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.09;
		b6 = w * 0.115926;
	}
	return d;
}

// ---------- FFT + analysis ----------

function fft(re: Float64Array, im: Float64Array) {
	const n = re.length;
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			[re[i], re[j]] = [re[j], re[i]];
			[im[i], im[j]] = [im[j], im[i]];
		}
	}
	for (let len = 2; len <= n; len <<= 1) {
		const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
		for (let i = 0; i < n; i += len) {
			let cr = 1, ci = 0;
			for (let k = 0; k < len / 2; k++) {
				const a = i + k, b = a + len / 2;
				const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
				re[b] = re[a] - tr;
				im[b] = im[a] - ti;
				re[a] += tr;
				im[a] += ti;
				const ncr = cr * wr - ci * wi;
				ci = cr * wi + ci * wr;
				cr = ncr;
			}
		}
	}
}

/** Shift a curve so its mean from 250 Hz to 2 kHz sits at 0 dB. */
function normalize(curve: Curve): Curve {
	let ref = 0, rc = 0;
	GRID.forEach((f, i) => {
		const v = curve[i];
		if (f >= 250 && f <= 2000 && v != null) {
			ref += v;
			rc++;
		}
	});
	ref = rc ? ref / rc : 0;
	return curve.map((v) => (v == null ? null : v - ref));
}

/** Power per bin (any linear scale) with bin width df -> normalized 1/6-octave response. */
export function bandsFromPsd(psd: ArrayLike<number>, df: number, nyq: number): Curve {
	const resp = GRID.map((f) => {
		const lo = f * Math.pow(2, -1 / 12), hi = f * Math.pow(2, 1 / 12);
		if (hi >= nyq) return null;
		let sum = 0, cnt = 0;
		for (let k = Math.max(1, Math.ceil(lo / df)); k <= Math.floor(hi / df); k++) {
			sum += psd[k];
			cnt++;
		}
		const dens = cnt ? sum / cnt : psd[Math.max(1, Math.round(f / df))];
		return 10 * Math.log10(dens * (hi - lo) + 1e-30);
	});
	return normalize(resp);
}

export type Recording = {
	name: string;
	dur: number;
	sr: number;
	peak: number;
	rms: number;
	clip: number;
	resp: Curve;
};

export class TooShortError extends Error {}

export function analyze(buf: AudioBuffer, name: string): Recording {
	const sr = buf.sampleRate, ch = buf.numberOfChannels, len = buf.length;
	const mono = new Float32Array(len);
	for (let c = 0; c < ch; c++) {
		const d = buf.getChannelData(c);
		for (let i = 0; i < len; i++) mono[i] += d[i] / ch;
	}
	let peak = 0, sq = 0, clip = 0;
	for (let i = 0; i < len; i++) {
		const a = Math.abs(mono[i]);
		if (a > peak) peak = a;
		if (a > 0.985) clip++;
		sq += mono[i] * mono[i];
	}
	// skip the start (button press) and the end, analyze at most 60 s
	const start = Math.min(Math.floor(2 * sr), Math.floor(len * 0.1));
	const end = Math.min(len - Math.min(Math.floor(sr), Math.floor(len * 0.05)), start + 60 * sr);

	const N = 16384, hop = N / 2;
	const win = new Float64Array(N);
	for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
	const psd = new Float64Array(N / 2 + 1);
	const re = new Float64Array(N), im = new Float64Array(N);
	let frames = 0;
	for (let s = start; s + N <= end; s += hop) {
		for (let i = 0; i < N; i++) {
			re[i] = mono[s + i] * win[i];
			im[i] = 0;
		}
		fft(re, im);
		for (let k = 0; k <= N / 2; k++) psd[k] += re[k] * re[k] + im[k] * im[k];
		frames++;
	}
	if (frames < 4) throw new TooShortError();
	return {
		name,
		dur: len / sr,
		sr,
		peak: 20 * Math.log10(peak + 1e-12),
		rms: 20 * Math.log10(Math.sqrt(sq / len) + 1e-12),
		clip,
		resp: bandsFromPsd(psd, sr / N, sr / 2)
	};
}

/** Power-average several recordings, then renormalize. */
export function avgResp(list: Recording[]): Curve | null {
	if (!list.length) return null;
	const out = GRID.map((_, i) => {
		let p = 0, c = 0;
		for (const r of list) {
			const v = r.resp[i];
			if (v != null) {
				p += Math.pow(10, v / 10);
				c++;
			}
		}
		return c ? 10 * Math.log10(p / c) : null;
	});
	return normalize(out);
}

/** Typical deviation from target between 100 Hz and 10 kHz (std dev, dB). */
export function fitScore(resp: Curve, target: number[]): number | null {
	const d: number[] = [];
	GRID.forEach((f, i) => {
		const v = resp[i];
		if (f >= 100 && f <= 10000 && v != null) d.push(v - target[i]);
	});
	if (!d.length) return null;
	const m = d.reduce((a, b) => a + b, 0) / d.length;
	return Math.sqrt(d.reduce((a, b) => a + (b - m) * (b - m), 0) / d.length);
}

/** Example data shown until the first recording. */
export const EXAMPLE: Curve = GRID.map((f) => {
	const lf = Math.log2(f);
	let v = (-9 * Math.max(0, Math.log2(70) - lf)) / 1.8;
	v += 4.5 * Math.exp(-Math.pow(lf - Math.log2(220), 2) / 0.25);
	v += -4 * Math.exp(-Math.pow(lf - Math.log2(3200), 2) / 0.2) + 2.5 * Math.exp(-Math.pow(lf - Math.log2(6000), 2) / 0.15);
	v += f > 9000 ? -4 * Math.log2(f / 9000) : 0;
	v += 1.2 * Math.sin(lf * 7.3);
	return +v.toFixed(1);
});

// ---------- EQ suggestion ----------

/** "25, 40, 1k, 2.5kHz" -> [25, 40, 1000, 2500] */
export function parseList(s: string): number[] {
	return s
		.split(/[,;\s]+/)
		.map((x) => x.trim().toLowerCase())
		.filter(Boolean)
		.map((x) => {
			let m = 1;
			if (x.endsWith('hz')) x = x.slice(0, -2);
			if (x.endsWith('k')) {
				m = 1000;
				x = x.slice(0, -1);
			}
			return parseFloat(x) * m;
		})
		.filter((v) => isFinite(v));
}

/** Mean of a curve over [lo, hi]; falls back to the nearest grid point. */
function avgOver(arr: Curve, lo: number, hi: number): number | null {
	let s = 0, c = 0;
	GRID.forEach((f, i) => {
		const v = arr[i];
		if (f >= lo && f <= hi && v != null) {
			s += v;
			c++;
		}
	});
	if (c) return s / c;
	let best = -1, bd = Infinity;
	const mid = Math.sqrt(lo * hi);
	GRID.forEach((f, i) => {
		const d = Math.abs(Math.log(f / mid));
		if (d < bd && arr[i] != null) {
			bd = d;
			best = i;
		}
	});
	return best < 0 ? null : arr[best];
}

export type EarUse = 'bass' | 'all' | 'off';
export type Source = 'M' | 'E' | 'T';
export type Basis = { src: string; resp: Curve };
export type BandResult = { fc: number; g: number; src: Source };

export function suggestGains(o: {
	bands: number[];
	/** slider values that were on the head unit while measuring */
	cur: number[];
	range: number;
	step: number;
	earUse: EarUse;
	ear: Record<string, number>;
	base: Basis | null;
	target: number[];
}): BandResult[] {
	const { bands, cur, range, step, earUse, ear, base, target } = o;
	return bands.map((fc, i) => {
		const prev = i > 0 ? bands[i - 1] : fc / 1.6;
		const next = i < bands.length - 1 ? bands[i + 1] : fc * 1.6;
		const lo = Math.sqrt(prev * fc), hi = Math.min(20000, Math.sqrt(fc * next));
		const tgt = avgOver(target, lo, hi) ?? 0;
		const e = ear[String(Math.round(fc))];
		const useEar = e != null && (earUse === 'all' || (earUse === 'bass' && fc < 100) || !base);

		let src: Source, dev: number;
		if (useEar) {
			src = 'E';
			dev = (tgt - earEstimate(fc, e)) * 0.8;
		} else if (base) {
			src = 'M';
			dev = (tgt - (avgOver(base.resp, lo, hi) ?? tgt)) * 0.8;
			if (fc < 60) dev *= 0.5;
		} else {
			src = 'T';
			dev = 0;
		}
		// boosts are capped hard: small speakers distort quickly
		const cap = fc < 60 && src !== 'E' ? 2 : src === 'E' && fc < 100 ? 4 : 3;
		let g = Math.max(-range, Math.min(cap, cur[i] + dev));
		g = Math.round(g / step) * step;
		if (Object.is(g, -0)) g = 0;
		return { fc, g, src };
	});
}

// ---------- formatting ----------

export const fmtF = (f: number) =>
	f >= 1000 ? +(f / 1000).toFixed(f % 1000 ? 1 : 0) + 'k' : String(Math.round(f));

export const signed = (v: number) => (v > 0 ? '+' : '') + v;
