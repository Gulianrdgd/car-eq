# Car EQ Bench v3: build plan

> Saved 2026-10-25. Decision (user, 2026-10-25): build it in SvelteKit. The "single static HTML file,
> no build step" constraint below is dropped; it is a static SPA build instead.

Starting point: `car-eq-bench-standalone.html` (attached). Keep its analysis code (FFT, 1/6 octave bands, power averaging, target curves, equal-loudness table, pink noise generator, live mic analyzer). Rebuild the UI around a guided loop and add a text protocol so results can go to Claude and Claude's tweaks can come back in.

Hosting: single static HTML file, served over https (mic access requires https). No backend, no build step, no external requests except Google Fonts. State in localStorage.

## The loop

```
Setup (once) -> Prepare -> Measure -> Results + Copy -> Paste Claude reply -> Apply in car -> Measure again ...
```

Every screen has one primary button. Big text and big buttons: this is used on a phone, in a parked car.

## Screens

### 0. Setup (first run only, reachable later via a gear icon)
- Band frequencies (comma list, accepts `1k`, `2.5k`), slider range (±N), step size.
- Car name (free text, e.g. "Golf 7 stock speakers").
- Save to localStorage. Skip on next visits.

### 1. Prepare
- Checklist with tap-to-tick items: engine off, doors/windows closed, fan off, loudness/bass boost off, balance/fader centered.
- Shows the **current slider values** that must be on the head unit right now, as a big row of numbers per band. First iteration: all 0.
- Button: "I'm set, start".

### 2. Measure
- Button starts pink noise (from the page, over Bluetooth to the car). Volume hint: "normal listening level".
- Uses the live mic (getUserMedia with echoCancellation, noiseSuppression, autoGainControl all false).
- Guided capture of **5 positions**, each with a 2 s settle + 5 s capture and a countdown: center of head, left ear, right ear, 10 cm higher, 10 cm forward. Show the instruction in huge text, vibrate (`navigator.vibrate`) on each start/stop.
- Level check before capturing: warn if too quiet or clipping, offer "retry".
- Power-average the 5 captures into one response.
- Optional: "also measure passenger seat" (same flow, separate result).
- Fallback: upload recording files (existing code) when mic is unavailable.

### 3. Results
- Chart: measured vs target, previous iteration as a faint line.
- Fit score (RMS deviation 100 Hz to 10 kHz, mean removed) and the delta vs previous iteration ("2.8 -> 1.9 dB, better").
- Local suggestion (existing algorithm) shown as sliders, labeled "tool suggestion".
- Primary button: **Copy for Claude** (format below). Toast "Copied".
- Secondary: "Apply tool suggestion" (skip Claude).

### 4. Paste Claude reply
- Big textarea + "Paste" helper (paste event). Parse the `CEQ-SET` block (format below), ignore all other text around it.
- Show a preview: per band old -> new value, highlighted changes, target changes, Claude's note.
- Buttons: "Apply" / "Cancel". Parse errors explained in plain words (which line, what's wrong).

### 5. Apply in car
- Show the new slider values huge, one per band, with arrows for changes vs previous ("160: 0 -> -3").
- Show Claude's note.
- Button: "Done, measure again" -> back to 1 with these as current values. If the reply's `next` field says something else, go there (see below).

### History
- Every iteration stored: timestamp, slider values, target, fit score, response (1/3 octave ints), note.
- Small list view with fit score per iteration and "restore these values".

## Export format: `CEQ1` (what "Copy for Claude" produces)

Goal: unambiguous and cheap in tokens. Fixed grids, integers, no units, no labels per value.

```
CEQ1 car tuning. Reply with a CEQ-SET block. Spec: s=seat n=captures cur=slider values now, r=response in dB on the R grid (0 = mean 250-2k Hz, pink noise, phone mic weak <80 Hz), t=target on same grid, e=ear match.
car=Golf 7 stock
bands=25,40,63,100,160,250,400,630,1k,2.5k,6.3k,16k rng=12 step=1
it=3 cur=2,2,1,0,-3,-2,0,0,0,-2,0,1
tgt=mild bass=0 treble=0
R=20,25,31,40,50,63,80,100,125,160,200,250,315,400,500,630,800,1k,1.25k,1.6k,2k,2.5k,3.15k,4k,5k,6.3k,8k,10k,12.5k,16k,20k
s=driver n=5 fit=2.1 prev=2.8 lvl=ok
r=-12,-10,-8,-6,-4,-2,-1,0,1,3,4,3,2,1,0,0,0,0,0,-1,-1,-2,-4,-3,-1,0,-1,-3,-5,-8,-14
t=5,5,5,5,4,4,4,3,2,1,1,0,0,0,0,0,0,0,0,0,0,-1,-1,-2,-2,-2,-3,-3,-4,-5,-6
s=passenger n=5 fit=2.9 lvl=ok
r=...
e=40:+6,63:+3
hist=1:3.4 2:2.8 3:2.1
```

Rules:
- `R` is the 31 ISO 1/3-octave centers, written once. `r` and `t` are integer dB on that grid, `x` for missing.
- Only include lines that have data (`s=passenger` only if measured, `e=` only if ear tuning was done).
- `lvl` = ok | quiet | clip.
- `hist` = iteration:fit, last 5 only.
- First line is a self-contained instruction so a fresh Claude chat understands it without context. Keep it on one line.

## Import format: `CEQ-SET` (what Claude replies)

```
CEQ-SET
cur=2,2,0,0,-4,-3,-1,0,0,-2,0,1
tgt=mild bass=1 treble=-1
note=Cut 160-250 Hz further, the boom is still 3 dB over target. Treble roll-off was too strong, lifted 16k.
next=measure
END
```

Fields (all optional except `cur`):
- `cur` = absolute slider values for every band, same count and order as `bands`. Reject if the count differs. Clamp to ±rng and round to step, and show a warning if clamping happened.
- `tgt`, `bass`, `treble` = target settings (preset: mild | harman | flat).
- `note` = one line, shown to the user.
- `next` = what the tool shows after applying: `measure` (default), `passenger` (measure passenger seat), `ear:40,63` (open ear tuning for those bands), `done` (show final values + "tuning finished").
- Parse from the line `CEQ-SET` to `END` (or end of text). Tolerate markdown code fences, extra whitespace, `+` signs, and `key: value` instead of `key=value`.

## Ear tuning
Keep the existing mode (band alternates with 1 kHz reference, slider until equally loud). Reachable from Results and via `next=ear:...`. Results feed the `e=` line.

## Acceptance tests
- Unit-test the parser with: plain block, fenced block, block inside a long chat reply, wrong band count (rejected with message), values out of range (clamped + warning), missing `END`.
- Unit-test the exporter: R grid has 31 points, `r` and `t` have 31 values, integers only, lines omitted when no data.
- Round trip: export -> paste a hand-written CEQ-SET -> apply -> export shows the new `cur` and `it` incremented.
- Feed the pink noise WAV through the file-upload path: response within ±1 dB of flat from 50 Hz to 16 kHz.
- Phone check: whole loop usable one-handed on a 390 px wide screen, dark mode readable.

## Status (2026-10-25)

Built in SvelteKit (static SPA, `adapter-static` with `index.html` fallback). Routes: `/setup`, `/prepare`, `/measure`, `/results`, `/paste`, `/apply`, `/ear`, `/history`, `/done`; `/` resumes the loop.

- Protocol: `src/lib/eq/ceq.ts` (`exportCeq`, `parseCeqSet`, `toThird`). State: `src/lib/eq/session.svelte.ts`. Mic capture: `Mic` in `src/lib/eq/audio.svelte.ts`.
- Tests (`yarn test`): parser cases, exporter cases, round trip, 60 s pink noise WAV flat within ±1 dB. All passing.
- Not verified yet: phone check (390 px, one-handed, dark mode). Use `yarn dev:phone` (https on the LAN).

Choices beyond the plan:
- CEQ1 header also spells out the CEQ-SET reply format, so a fresh chat can answer without context.
- `t=` is written once (after the first seat's `r=`, or after `R=` when nothing is measured).
- Applying new values clears that iteration's recordings and ear results (they belong to the old values).
- Tool suggestion always starts from `cur` (the values on the head unit while measuring).
- v2's "tune for both front seats" option is gone; suggestion uses the driver seat (passenger if only that was measured).
- Measure screen: pink noise from the phone or from USB, with a `pink-noise-60s.wav` download, because opening the mic can switch Bluetooth to call mode.
- Wake lock during measuring so the screen stays on.
