import { useRef, useState, useCallback } from 'react';
import {
  autoCorrelate,
  getNoteInfo,
  findClosestString,
  getCentsFromTarget,
  GUITAR_STRINGS,
} from '../utils/pitchDetector';

const DETECT_CONFIG = { rmsMin: 0.015, rmsWeak: 0.04, confidence: 0.5, history: 10 };

export function usePitchDetection({
  tuningStrings = GUITAR_STRINGS,
  targetString  = null,
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

  const optionsRef = useRef({ tuningStrings, targetString });
  optionsRef.current = { tuningStrings, targetString };

  const classifyMicError = useCallback(async (err) => {
    const name = err?.name || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'permission';
    }
    if (name === 'NotFoundError') {
      return 'device';
    }
    if (name === 'NotReadableError') {
      return 'busy';
    }
    if (name === 'AbortError' || name === 'InvalidStateError' || name === 'SecurityError') {
      return 'access';
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return 'unsupported';
    }

    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({ name: 'microphone' });
        if (status.state === 'denied') return 'permission';
        if (status.state === 'granted') return 'access';
      }
    } catch {
      // Ignore permission API failures and fall through to a generic access error.
    }

    return 'access';
  }, []);

  const detect = useCallback(() => {
    if (!analyserRef.current) return;

    analyserRef.current.getFloatTimeDomainData(bufferRef.current);

    const result = autoCorrelate(bufferRef.current, audioContextRef.current.sampleRate, DETECT_CONFIG);

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
    if (history.length > DETECT_CONFIG.history) history.shift();
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
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('unsupported');
        return;
      }

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
      setError(await classifyMicError(err));
    }
  }, [classifyMicError, detect]);

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
