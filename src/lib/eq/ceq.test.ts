import { describe, expect, it, vi } from 'vitest';
import { R_GRID, R_LABELS, exportCeq, parseCeqSet, type ExportInput } from './ceq';
import { GRID, analyze, pinkNoise } from './dsp';
import { encodeWav } from './wav';

const bands = [25, 40, 63, 100, 160, 250, 400, 630, 1000, 2500, 6300, 16000];
const eq = { bands, range: 12, step: 1 };

const BLOCK = `CEQ-SET
cur=2,2,0,0,-4,-3,-1,0,0,-2,0,1
tgt=harman bass=1 treble=-1
note=Cut 160-250 Hz further, the boom is still 3 dB over target.
next=measure
END`;

describe('parseCeqSet', () => {
	it('parses a plain block', () => {
		const r = parseCeqSet(BLOCK, eq);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value).toEqual({
			cur: [2, 2, 0, 0, -4, -3, -1, 0, 0, -2, 0, 1],
			preset: 'harman',
			bass: 1,
			treble: -1,
			note: 'Cut 160-250 Hz further, the boom is still 3 dB over target.',
			next: { kind: 'measure' }
		});
		expect(r.warnings).toEqual([]);
	});

	it('parses a fenced block', () => {
		const r = parseCeqSet('```\n' + BLOCK + '\n```', eq);
		expect(r.ok && r.value.cur[4]).toBe(-4);
	});

	it('finds the block inside a long chat reply', () => {
		const reply = `Looking at your data, the 160 Hz region is boomy and cur=1,2,3 was a good start.\n\nHere is the new setting:\n\n\`\`\`text\n${BLOCK}\n\`\`\`\n\nMeasure again after setting these. Next time try next=done.`;
		const r = parseCeqSet(reply, eq);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.cur).toHaveLength(12);
	});

	it('tolerates key: value, + signs, unicode minus and spaces', () => {
		const r = parseCeqSet('CEQ-SET\ncur: +2, +2, 0, 0, −4, -3, -1, 0, 0, -2, 0, +1\ntgt: mild  bass: +2 treble: 0\nnext: ear:40, 63\nEND', eq);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.cur).toEqual([2, 2, 0, 0, -4, -3, -1, 0, 0, -2, 0, 1]);
		expect(r.value.bass).toBe(2);
		expect(r.value.next).toEqual({ kind: 'ear', bands: [40, 63] });
	});

	it('rejects a wrong band count with a message naming the line', () => {
		const r = parseCeqSet('intro\nCEQ-SET\ncur=1,2,3\nEND', eq);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toMatch(/Line 3: cur has 3 values, but your EQ has 12 bands/);
	});

	it('clamps out-of-range values and warns', () => {
		const r = parseCeqSet('CEQ-SET\ncur=15,2,0,0,-20,-3,-1,0,0,-2,0,1.4\nEND', eq);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.cur[0]).toBe(12);
		expect(r.value.cur[4]).toBe(-12);
		expect(r.value.cur[11]).toBe(1); // rounded to step
		expect(r.warnings).toHaveLength(2);
		expect(r.warnings[0]).toMatch(/25 Hz: \+15 is outside ±12, set to \+12/);
	});

	it('works without END', () => {
		const r = parseCeqSet('CEQ-SET\ncur=0,0,0,0,-2,0,0,0,0,0,0,0\nnote=only one cut', eq);
		expect(r.ok && r.value.note).toBe('only one cut');
	});

	it('explains a missing block, missing cur, bad numbers and unknown targets', () => {
		expect(parseCeqSet('no block here', eq)).toMatchObject({ ok: false, error: expect.stringMatching(/No CEQ-SET block/) });
		expect(parseCeqSet('CEQ-SET\nnote=hi\nEND', eq)).toMatchObject({ ok: false, error: expect.stringMatching(/no "cur="/) });
		expect(parseCeqSet('CEQ-SET\ncur=0,0,a,0,0,0,0,0,0,0,0,0\nEND', eq)).toMatchObject({ ok: false, error: expect.stringMatching(/Line 2: "a"/) });
		expect(parseCeqSet(`CEQ-SET\ncur=${'0,'.repeat(11)}0\ntgt=loud\nEND`, eq)).toMatchObject({ ok: false, error: expect.stringMatching(/Line 3: target "loud"/) });
	});
});

const base: ExportInput = {
	car: 'Golf 7 stock',
	bands,
	range: 12,
	step: 1,
	it: 3,
	cur: [2, 2, 1, 0, -3, -2, 0, 0, 0, -2, 0, 1],
	preset: 'mild',
	bass: 0,
	treble: 0,
	seats: [],
	ear: {},
	hist: []
};
const line = (text: string, key: string) => text.split('\n').find((l) => l.startsWith(key + '='));
const values = (l: string | undefined) => l!.split(/[= ]/)[1].split(',');

describe('exportCeq', () => {
	const resp = GRID.map((f) => (f < 60 ? -10 : 0.4));

	it('writes a 31-point R grid and 31 integer r and t values', () => {
		const txt = exportCeq({ ...base, seats: [{ seat: 'driver', n: 5, fit: 2.1, prev: 2.8, lvl: 'ok', resp }] });
		expect(R_GRID).toHaveLength(31);
		expect(values(line(txt, 'R'))).toEqual(R_LABELS);
		for (const key of ['r', 't']) {
			const v = values(line(txt, key));
			expect(v).toHaveLength(31);
			for (const x of v) expect(x).toMatch(/^(-?\d+|x)$/);
		}
		expect(line(txt, 's')).toBe('s=driver n=5 fit=2.1 prev=2.8 lvl=ok');
	});

	it('has a single-line self-contained header', () => {
		const first = exportCeq(base).split('\n')[0];
		expect(first).toMatch(/^CEQ1 /);
		expect(first).toMatch(/CEQ-SET/);
	});

	it('omits lines without data', () => {
		const txt = exportCeq({ ...base, car: '' });
		expect(line(txt, 'car')).toBeUndefined();
		expect(line(txt, 's')).toBeUndefined();
		expect(line(txt, 'r')).toBeUndefined();
		expect(line(txt, 'e')).toBeUndefined();
		expect(line(txt, 'hist')).toBeUndefined();
		expect(line(txt, 't')).toBeDefined();
	});

	it('includes passenger, ear and the last 5 history entries when present', () => {
		const txt = exportCeq({
			...base,
			seats: [
				{ seat: 'driver', n: 5, fit: 2.1, lvl: 'ok', resp },
				{ seat: 'passenger', n: 5, fit: 2.9, lvl: 'quiet', resp }
			],
			ear: { '63': 3, '40': 6 },
			hist: [[1, 4], [2, 3.4], [3, 2.8], [4, 2.5], [5, 2.2], [6, 2.1]]
		});
		expect(txt).toContain('s=passenger n=5 fit=2.9 lvl=quiet');
		expect(txt.split('\n').filter((l) => l.startsWith('t='))).toHaveLength(1);
		expect(line(txt, 'e')).toBe('e=40:+6,63:+3');
		expect(line(txt, 'hist')).toBe('hist=2:3.4 3:2.8 4:2.5 5:2.2 6:2.1');
	});
});

describe('analysis', () => {
	it('reads the 60 s pink noise WAV as flat within ±1 dB from 50 Hz to 16 kHz', () => {
		// seeded, so the test is deterministic (mulberry32)
		let seed = 1;
		vi.spyOn(Math, 'random').mockImplementation(() => {
			let t = (seed += 0x6d2b79f5);
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		});
		const sr = 44100;
		const wav = decodeWav(encodeWav(pinkNoise(sr * 60), sr));
		vi.restoreAllMocks();
		const r = analyze(wav, 'pink-noise.wav');
		GRID.forEach((f, i) => {
			if (f >= 50 && f <= 16000) expect(Math.abs(r.resp[i]!)).toBeLessThan(1);
		});
	});
});

// stands in for decodeAudioData on an uploaded file
function decodeWav(buf: ArrayBuffer): AudioBuffer {
	const b = new DataView(buf), sr = b.getUint32(24, true), n = b.getUint32(40, true) / 2;
	const d = new Float32Array(n);
	for (let i = 0; i < n; i++) d[i] = b.getInt16(44 + i * 2, true) / 32768;
	return { sampleRate: sr, numberOfChannels: 1, length: n, getChannelData: () => d } as unknown as AudioBuffer;
}
