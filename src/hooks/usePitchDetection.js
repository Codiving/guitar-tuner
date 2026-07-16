import { useRef, useState, useCallback } from 'react';
import {
  autoCorrelate,
  getNoteInfo,
  findClosestString,
  getCentsFromTarget,
} from '../utils/pitchDetector';

const HISTORY_SIZE = 6;

export function usePitchDetection({ a4 = 440, tuningStrings = [], targetString = null, useFlats = false } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [pitch, setPitch] = useState(null);
  // 'idle' | 'silent' | 'weak' | 'unstable' | 'detecting'
  const [signalStatus, setSignalStatus] = useState('idle');
  const [error, setError] = useState(null);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const bufferRef = useRef(null);
  const freqHistoryRef = useRef([]);
  const lastNoteNumRef = useRef(null);

  // Keep latest options accessible from the detect loop without re-creating it
  const optionsRef = useRef({ a4, tuningStrings, targetString, useFlats });
  optionsRef.current = { a4, tuningStrings, targetString, useFlats };

  const detect = useCallback(() => {
    if (!analyserRef.current) return;

    analyserRef.current.getFloatTimeDomainData(bufferRef.current);
    const result = autoCorrelate(bufferRef.current, audioContextRef.current.sampleRate);

    if (result.status !== 'ok') {
      if (result.status === 'silent' || result.status === 'weak') {
        freqHistoryRef.current = [];
        lastNoteNumRef.current = null;
      }
      setSignalStatus(result.status);
      setPitch(null);
      rafRef.current = requestAnimationFrame(detect);
      return;
    }

    // Reset history when the note jumps (string change)
    const rawNoteNum = Math.round(12 * Math.log2(result.freq / optionsRef.current.a4) + 69);
    if (lastNoteNumRef.current !== null && Math.abs(rawNoteNum - lastNoteNumRef.current) > 1) {
      freqHistoryRef.current = [];
    }
    lastNoteNumRef.current = rawNoteNum;

    // Smooth via median
    const history = freqHistoryRef.current;
    history.push(result.freq);
    if (history.length > HISTORY_SIZE) history.shift();
    const sorted = [...history].sort((a, b) => a - b);
    const smoothedFreq = sorted[Math.floor(sorted.length / 2)];

    const { a4: currentA4, tuningStrings: strings, targetString: target, useFlats: flats } = optionsRef.current;
    const noteInfo = getNoteInfo(smoothedFreq, currentA4, flats);

    let cents;
    let guitarString;

    if (target) {
      cents = getCentsFromTarget(smoothedFreq, target.freq);
      guitarString = target;
    } else {
      guitarString = findClosestString(smoothedFreq, strings);
      cents = guitarString
        ? getCentsFromTarget(smoothedFreq, guitarString.freq)
        : (noteInfo?.cents ?? null);
    }

    setSignalStatus('detecting');
    setPitch({ freq: smoothedFreq, cents, noteInfo, guitarString });
    rafRef.current = requestAnimationFrame(detect);
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(analyser.fftSize);

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      freqHistoryRef.current = [];
      lastNoteNumRef.current = null;
      setIsListening(true);
      setSignalStatus('silent');
      setError(null);
      rafRef.current = requestAnimationFrame(detect);
    } catch (err) {
      const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      setError(isDenied ? 'permission' : 'device');
    }
  }, [detect]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (sourceRef.current) sourceRef.current.disconnect();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioContextRef.current) audioContextRef.current.close();
    freqHistoryRef.current = [];
    lastNoteNumRef.current = null;
    setIsListening(false);
    setSignalStatus('idle');
    setPitch(null);
  }, []);

  return { isListening, pitch, signalStatus, error, start, stop };
}
