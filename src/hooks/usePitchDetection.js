import { useRef, useState, useCallback } from 'react';
import {
  autoCorrelate,
  getNoteInfo,
  findClosestString,
  getCentsFromTarget,
  GUITAR_STRINGS,
} from '../utils/pitchDetector';

// sensitivity: 1(낮음) ~ 10(높음) → 파라미터 선형 보간
function buildConfig(sensitivity) {
  const t = (sensitivity - 1) / 9;
  const lerp = (a, b) => a + (b - a) * t;
  return {
    rmsMin:     lerp(0.03,  0.005),
    rmsWeak:    lerp(0.08,  0.015),
    confidence: lerp(0.7,   0.3),
    history:    Math.round(lerp(14, 6)),
  };
}

export function usePitchDetection({
  tuningStrings = GUITAR_STRINGS,
  targetString  = null,
  sensitivity   = 5,
} = {}) {
  const [isListening,  setIsListening]  = useState(false);
  const [pitch,        setPitch]        = useState(null);
  const [signalStatus, setSignalStatus] = useState('idle');
  const [error,        setError]        = useState(null);

  const audioContextRef  = useRef(null);
  const analyserRef      = useRef(null);
  const sourceRef        = useRef(null);
  const streamRef        = useRef(null);
  const rafRef           = useRef(null);
  const bufferRef        = useRef(null);
  const freqHistoryRef   = useRef([]);
  const lastNoteNumRef   = useRef(null);

  const optionsRef = useRef({ tuningStrings, targetString, sensitivity });
  optionsRef.current = { tuningStrings, targetString, sensitivity };

  const detect = useCallback(() => {
    if (!analyserRef.current) return;

    analyserRef.current.getFloatTimeDomainData(bufferRef.current);

    const { sensitivity: sens } = optionsRef.current;
    const cfg = buildConfig(sens);
    const result = autoCorrelate(bufferRef.current, audioContextRef.current.sampleRate, cfg);

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

    const rawNoteNum = Math.round(12 * Math.log2(result.freq / 440) + 69);
    if (lastNoteNumRef.current !== null && Math.abs(rawNoteNum - lastNoteNumRef.current) >= 1) {
      freqHistoryRef.current = [];
    }
    lastNoteNumRef.current = rawNoteNum;

    const history = freqHistoryRef.current;
    history.push(result.freq);
    if (history.length > cfg.history) history.shift();
    const sorted = [...history].sort((a, b) => a - b);
    const smoothedFreq = sorted[Math.floor(sorted.length / 2)];

    const { tuningStrings: strings, targetString: target } = optionsRef.current;
    const noteInfo = getNoteInfo(smoothedFreq);

    let cents, guitarString;
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
