/** 16-bit mono PCM WAV. */
export function encodeWav(d: Float32Array, sr: number): ArrayBuffer {
	const b = new DataView(new ArrayBuffer(44 + d.length * 2));
	const str = (o: number, s: string) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
	str(0, 'RIFF');
	b.setUint32(4, 36 + d.length * 2, true);
	str(8, 'WAVEfmt ');
	b.setUint32(16, 16, true);
	b.setUint16(20, 1, true); // PCM
	b.setUint16(22, 1, true); // mono
	b.setUint32(24, sr, true);
	b.setUint32(28, sr * 2, true);
	b.setUint16(32, 2, true);
	b.setUint16(34, 16, true);
	str(36, 'data');
	b.setUint32(40, d.length * 2, true);
	d.forEach((v, i) => b.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 32767, true));
	return b.buffer;
}
