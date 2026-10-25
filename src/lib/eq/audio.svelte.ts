import { bandsFromPsd, pinkNoise, type Curve } from './dsp';

let actx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

export function ctx(): AudioContext {
	actx ??= new AudioContext();
	if (actx.state === 'suspended') actx.resume();
	return actx;
}

/** 10 s of stereo pink noise. */
function pinkBuffer(): AudioBuffer {
	const a = ctx();
	if (noiseBuf && noiseBuf.sampleRate === a.sampleRate) return noiseBuf;
	const d = pinkNoise(a.sampleRate * 10);
	noiseBuf = a.createBuffer(2, d.length, a.sampleRate);
	noiseBuf.getChannelData(0).set(d);
	noiseBuf.getChannelData(1).set(d);
	return noiseBuf;
}

function loopingNoise(a: AudioContext) {
	const src = a.createBufferSource();
	src.buffer = pinkBuffer();
	src.loop = true;
	return src;
}

/** Two cascaded band-pass filters around fc. */
function bandChain(a: AudioContext, src: AudioNode, fc: number) {
	const f1 = a.createBiquadFilter(), f2 = a.createBiquadFilter();
	for (const f of [f1, f2]) {
		f.type = 'bandpass';
		f.frequency.value = fc;
		f.Q.value = 1.6;
	}
	src.connect(f1);
	f1.connect(f2);
	return f2;
}

const dbToLin = (db: number) => Math.pow(10, db / 20);

type EarSession = {
	key: string;
	src: AudioBufferSourceNode;
	gTest: GainNode;
	master: GainNode;
	timer: ReturnType<typeof setInterval>;
	testOn: boolean;
	gainDb: number;
};


class AudioEngine {
	noiseOn = $state(false);
	/** Rounded band frequency currently in the ear test, or null. */
	earKey = $state<string | null>(null);
	earLevel = $state(-12);

	#noise: AudioBufferSourceNode | null = null;
	#ear: EarSession | null = null;

	toggleNoise() {
		if (this.#noise) {
			this.#noise.stop();
			this.#noise = null;
			this.noiseOn = false;
			return;
		}
		this.stopEar();
		const a = ctx();
		this.#noise = loopingNoise(a);
		this.#noise.connect(a.destination);
		this.#noise.start();
		this.noiseOn = true;
	}

	/** Alternate a band around fc with a 1 kHz reference, once per second. */
	startEar(fc: number, gainDb: number) {
		this.stopEar();
		const a = ctx();
		const src = loopingNoise(a);
		const master = a.createGain();
		master.gain.value = dbToLin(this.earLevel) * 3;
		master.connect(a.destination);
		const gRef = a.createGain(), gTest = a.createGain();
		bandChain(a, src, 1000).connect(gRef);
		bandChain(a, src, fc).connect(gTest);
		gRef.connect(master);
		gTest.connect(master);
		gRef.gain.setValueAtTime(1, a.currentTime);
		gTest.gain.setValueAtTime(0, a.currentTime);

		const s: EarSession = {
			key: String(Math.round(fc)),
			src, gTest, master,
			testOn: false,
			gainDb,
			timer: setInterval(() => {
				const t = a.currentTime;
				s.testOn = !s.testOn;
				gRef.gain.cancelScheduledValues(t);
				gTest.gain.cancelScheduledValues(t);
				gRef.gain.setTargetAtTime(s.testOn ? 0 : 1, t, 0.02);
				gTest.gain.setTargetAtTime(s.testOn ? dbToLin(s.gainDb) : 0, t, 0.02);
			}, 1000)
		};
		src.start();
		this.#ear = s;
		this.earKey = s.key;
	}

	stopEar() {
		const s = this.#ear;
		if (!s) return;
		try {
			s.src.stop();
		} catch {
			/* already stopped */
		}
		clearInterval(s.timer);
		this.#ear = null;
		this.earKey = null;
	}

	/** Live-update the test band gain while it is playing. */
	setEarGain(key: string, db: number) {
		const s = this.#ear;
		if (!s || s.key !== key) return;
		s.gainDb = db;
		if (s.testOn) s.gTest.gain.setTargetAtTime(dbToLin(db), ctx().currentTime, 0.02);
	}

	setEarLevel(db: number) {
		this.earLevel = db;
		this.#ear?.master.gain.setTargetAtTime(dbToLin(db) * 3, ctx().currentTime, 0.05);
	}

	async decode(file: File): Promise<AudioBuffer> {
		return ctx().decodeAudioData(await file.arrayBuffer());
	}

	get sampleRate() {
		return ctx().sampleRate;
	}
}

export const audio = new AudioEngine();

// ---------- microphone ----------

export type Capture = { resp: Curve; peak: number; rms: number; clip: number; dur: number; sr: number };

/** Phone mic with all voice processing off, read through two analysers. */
export class Mic {
	#stream: MediaStream;
	#spec: AnalyserNode;
	#level: AnalyserNode;

	private constructor(stream: MediaStream, spec: AnalyserNode, level: AnalyserNode) {
		this.#stream = stream;
		this.#spec = spec;
		this.#level = level;
	}

	static async open(): Promise<Mic> {
		if (!navigator.mediaDevices?.getUserMedia) throw new Error('no microphone api');
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
		});
		const a = ctx(), src = a.createMediaStreamSource(stream);
		const spec = a.createAnalyser();
		spec.fftSize = 16384;
		spec.smoothingTimeConstant = 0;
		// short window for level stats, so successive reads barely overlap
		const level = a.createAnalyser();
		level.fftSize = 4096;
		src.connect(spec);
		src.connect(level);
		return new Mic(stream, spec, level);
	}

	/**
	 * Average the power spectrum and track the level for `ms`.
	 * onTick gets the elapsed fraction and the running response.
	 */
	run(ms: number, signal: AbortSignal, onTick?: (frac: number, resp: Curve) => void): Promise<Capture> {
		const a = ctx(), sp = this.#spec, lv = this.#level;
		const bins = new Float32Array(sp.frequencyBinCount), acc = new Float64Array(sp.frequencyBinCount);
		const td = new Float32Array(lv.fftSize);
		let frames = 0, peak = 0, sq = 0, n = 0, clip = 0;
		const resp = () => bandsFromPsd(acc, a.sampleRate / sp.fftSize, a.sampleRate / 2);
		const t0 = performance.now();

		return new Promise((resolve, reject) => {
			const timer = setInterval(() => {
				sp.getFloatFrequencyData(bins);
				for (let k = 0; k < bins.length; k++) acc[k] += Math.pow(10, bins[k] / 10);
				frames++;
				lv.getFloatTimeDomainData(td);
				for (const v of td) {
					const x = Math.abs(v);
					if (x > peak) peak = x;
					if (x > 0.985) clip++;
					sq += v * v;
				}
				n += td.length;
				const frac = Math.min(1, (performance.now() - t0) / ms);
				onTick?.(frac, resp());
				if (frac >= 1) done();
			}, 100);
			const done = () => {
				clearInterval(timer);
				signal.removeEventListener('abort', abort);
				resolve({
					resp: resp(),
					peak: 20 * Math.log10(peak + 1e-12),
					rms: 10 * Math.log10(sq / Math.max(1, n) + 1e-24),
					clip,
					dur: ms / 1000,
					sr: a.sampleRate
				});
			};
			const abort = () => {
				clearInterval(timer);
				reject(new DOMException('aborted', 'AbortError'));
			};
			signal.addEventListener('abort', abort, { once: true });
		});
	}

	close() {
		this.#stream.getTracks().forEach((t) => t.stop());
	}
}
