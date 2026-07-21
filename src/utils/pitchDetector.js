const NOTE_STRINGS_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const GUITAR_STRINGS = [
  { name: 'E2', note: 'E', octave: 2, freq: 82.41,  string: 6 },
  { name: 'A2', note: 'A', octave: 2, freq: 110.0,  string: 5 },
  { name: 'D3', note: 'D', octave: 3, freq: 146.83, string: 4 },
  { name: 'G3', note: 'G', octave: 3, freq: 196.0,  string: 3 },
  { name: 'B3', note: 'B', octave: 3, freq: 246.94, string: 2 },
  { name: 'E4', note: 'E', octave: 4, freq: 329.63, string: 1 },
];

export const TUNING_PRESETS = [
  {
    id: 'standard',
    name: '표준 튜닝',
    description: 'E A D G B E',
    accidental: 'sharp',
    strings: GUITAR_STRINGS,
  },
  {
    id: 'drop-d',
    name: '드롭 D',
    description: 'D A D G B E',
    accidental: 'sharp',
    strings: [
      { name: 'D2', note: 'D', octave: 2, freq: 73.42, string: 6 },
      { name: 'A2', note: 'A', octave: 2, freq: 110.0, string: 5 },
      { name: 'D3', note: 'D', octave: 3, freq: 146.83, string: 4 },
      { name: 'G3', note: 'G', octave: 3, freq: 196.0, string: 3 },
      { name: 'B3', note: 'B', octave: 3, freq: 246.94, string: 2 },
      { name: 'E4', note: 'E', octave: 4, freq: 329.63, string: 1 },
    ],
  },
  {
    id: 'half-step-down',
    name: '반음 내림',
    description: 'Eb Ab Db Gb Bb Eb',
    accidental: 'flat',
    strings: [
      { name: 'Eb2', note: 'D#', octave: 2, freq: 77.78, string: 6 },
      { name: 'Ab2', note: 'G#', octave: 2, freq: 103.83, string: 5 },
      { name: 'Db3', note: 'C#', octave: 3, freq: 138.59, string: 4 },
      { name: 'Gb3', note: 'F#', octave: 3, freq: 185.0, string: 3 },
      { name: 'Bb3', note: 'A#', octave: 3, freq: 233.08, string: 2 },
      { name: 'Eb4', note: 'D#', octave: 4, freq: 311.13, string: 1 },
    ],
  },
  {
    id: 'open-g',
    name: '오픈 G',
    description: 'D G D G B D',
    accidental: 'sharp',
    strings: [
      { name: 'D2', note: 'D', octave: 2, freq: 73.42, string: 6 },
      { name: 'G2', note: 'G', octave: 2, freq: 98.0, string: 5 },
      { name: 'D3', note: 'D', octave: 3, freq: 146.83, string: 4 },
      { name: 'G3', note: 'G', octave: 3, freq: 196.0, string: 3 },
      { name: 'B3', note: 'B', octave: 3, freq: 246.94, string: 2 },
      { name: 'D4', note: 'D', octave: 4, freq: 293.66, string: 1 },
    ],
  },
];

// Returns { status: 'silent'|'weak'|'unstable'|'ok', freq, rms }
export function autoCorrelate(buffer, sampleRate, { rmsMin = 0.015, rmsWeak = 0.04, confidence = 0.5 } = {}) {
  const SIZE = buffer.length;
  const rms = Math.sqrt(buffer.reduce((sum, v) => sum + v * v, 0) / SIZE);

  if (rms < rmsMin)  return { status: 'silent', freq: -1, rms };
  if (rms < rmsWeak) return { status: 'weak',   freq: -1, rms };

  let r1 = 0, r2 = SIZE - 1;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buffer[i]) < 0.2) { r1 = i; break; }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buffer[SIZE - i]) < 0.2) { r2 = SIZE - i; break; }
  }

  const buf = buffer.slice(r1, r2);
  const c = new Array(buf.length).fill(0);
  for (let i = 0; i < buf.length; i++) {
    for (let j = 0; j < buf.length - i; j++) {
      c[i] += buf[j] * buf[j + i];
    }
  }

  let d = 0;
  while (c[d] > c[d + 1]) d++;

  let maxval = -1, maxpos = -1;
  for (let i = d; i < buf.length; i++) {
    if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  }

  let T0 = maxpos;
  const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const bv = (x3 - x1) / 2;
  if (a) T0 -= bv / (2 * a);

  if (c[0] > 0 && maxval / c[0] < confidence) return { status: 'unstable', freq: -1, rms };

  const freq = sampleRate / T0;
  if (freq < 60 || freq > 1200) return { status: 'unstable', freq: -1, rms };
  return { status: 'ok', freq, rms };
}

export function getNoteInfo(freq, a4 = 440) {
  if (freq <= 0) return null;
  const noteNum = Math.round(12 * Math.log2(freq / a4) + 69);
  const noteName = NOTE_STRINGS_SHARP[((noteNum % 12) + 12) % 12];
  const octave = Math.floor(noteNum / 12) - 1;
  const targetFreq = a4 * Math.pow(2, (noteNum - 69) / 12);
  const cents = 1200 * Math.log2(freq / targetFreq);
  return { noteNum, noteName, octave, targetFreq, cents };
}

export function getCentsFromTarget(detectedFreq, targetFreq) {
  return 1200 * Math.log2(detectedFreq / targetFreq);
}

export function findClosestString(freq, tuningStrings) {
  let closest = null;
  let minDist = Infinity;
  for (const gs of tuningStrings) {
    const dist = Math.abs(Math.log2(freq / gs.freq));
    if (dist < minDist) { minDist = dist; closest = gs; }
  }
  return minDist < 0.5 ? closest : null;
}
