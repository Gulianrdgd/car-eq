import { expect, it } from 'vitest';
import { session } from './session.svelte';
import { parseCeqSet } from './ceq';
import { GRID } from './dsp';

it('round trip: export, paste a CEQ-SET, apply, export shows the new cur and next iteration', () => {
	session.saveSetup({ car: 'Test car', bandsText: '63, 250, 1k, 4k, 16k', range: 12, step: 1, earUse: 'bass' });
	const resp = GRID.map((f) => (f > 150 && f < 300 ? 4 : 0));
	session.setRecs('driver', [{ name: 'mic', dur: 5, sr: 48000, peak: -6, rms: -20, clip: 0, resp }]);

	const before = session.exportText;
	expect(before).toContain('car=Test car');
	expect(before).toContain('it=1 cur=0,0,0,0,0');
	expect(before).toMatch(/^s=driver n=1 fit=\d+\.\d lvl=ok$/m);

	const reply = 'Sure, here you go:\n```\nCEQ-SET\ncur=+1, -3, 0, 0, +2\ntgt=harman bass=1\nnote=Less boom.\nnext=passenger\nEND\n```';
	const r = parseCeqSet(reply, { bands: session.bands, range: session.range, step: session.step });
	expect(r.ok).toBe(true);
	if (!r.ok) return;
	session.commit(r.value);

	const after = session.exportText;
	expect(after).toContain('it=2 cur=1,-3,0,0,2');
	expect(after).toContain('tgt=harman bass=1 treble=0');
	expect(after).not.toMatch(/^s=/m); // measurements belong to the old values
	expect(after).toMatch(/^hist=1:\d+\.\d$/m);
	expect(session.next).toEqual({ kind: 'passenger' });
	expect(session.history[0].cur).toEqual([0, 0, 0, 0, 0]);
});
