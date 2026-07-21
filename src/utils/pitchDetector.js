const NOTE_STRINGS_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_STRINGS_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NOTE_TO_SEMITONE = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

export const GUITAR_STRINGS = [
  { name: 'E2', note: 'E', octave: 2, string: 6 },
  { name: 'A2', note: 'A', octave: 2, string: 5 },
  { name: 'D3', note: 'D', octave: 3, string: 4 },
  { name: 'G3', note: 'G', octave: 3, string: 3 },
  { name: 'B3', note: 'B', octave: 3, string: 2 },
  { name: 'E4', note: 'E', octave: 4, string: 1 },
];

export const DEFAULT_TUNING_PRESETS = [
  {
    id: 'standard',
    name: '표준 튜닝',
    tuningText: 'E2 A2 D3 G3 B3 E4',
    accidental: 'sharp',
  },
  {
    id: 'drop-d',
    name: '드롭 D',
    tuningText: 'D2 A2 D3 G3 B3 E4',
    accidental: 'sharp',
  },
  {
    id: 'half-step-down',
    name: '반음 내림',
    tuningText: 'Eb2 Ab2 Db3 Gb3 Bb3 Eb4',
    accidental: 'flat',
  },
  {
    id: 'open-g',
    name: '오픈 G',
    tuningText: 'D2 G2 D3 G3 B3 D4',
    accidental: 'sharp',
  },
];

export function noteToMidi(note, octave) {
  if (!Number.isInteger(octave)) return null;
  const normalized = String(note ?? '').replace('♯', '#').replace('♭', 'b');
  const semitone = NOTE_TO_SEMITONE[normalized];
  if (semitone == null) return null;
  return (octave + 1) * 12 + semitone;
}

export function midiToFreq(midi, a4 = 440) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export function formatNoteName(note, octave, accidental = 'sharp') {
  const normalized = String(note ?? '').replace('♯', '#').replace('♭', 'b');
  const semitone = NOTE_TO_SEMITONE[normalized];
  if (semitone == null || !Number.isInteger(octave)) return null;
  const name = accidental === 'flat' ? NOTE_STRINGS_FLAT[semitone] : NOTE_STRINGS_SHARP[semitone];
  return `${name}${octave}`;
}

export function parseTuningText(tuningText) {
  const tokens = String(tuningText ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length !== 6) return null;

  const strings = tokens.map((token, index) => {
    const match = token.match(/^([A-Ga-g])([#b♯♭]?)(-?\d+)$/);
    if (!match) return null;

    const note = `${match[1].toUpperCase()}${match[2].replace('♯', '#').replace('♭', 'b')}`;
    const octave = Number(match[3]);
    const midi = noteToMidi(note, octave);
    if (midi == null) return null;

    return {
      name: formatNoteName(note, octave, note.includes('b') ? 'flat' : 'sharp') ?? token,
      note,
      octave,
      midi,
      string: 6 - index,
    };
  });

  if (strings.some((item) => item == null)) return null;
  return strings;
}

export function buildTuningStrings(tuningText, a4 = 440) {
  const strings = parseTuningText(tuningText);
  if (!strings) return null;
  return strings.map((item) => ({
    ...item,
    freq: midiToFreq(item.midi, a4),
  }));
}

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
