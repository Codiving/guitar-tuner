import { useState } from 'react';
import { usePitchDetection } from './hooks/usePitchDetection';
import { useLocalStorage } from './hooks/useLocalStorage';
import { TuningMeter } from './components/TuningMeter';
import { StringSelector } from './components/StringSelector';
import { GUITAR_STRINGS } from './utils/pitchDetector';
import './App.css';

const SIGNAL_MESSAGES = {
  silent:   { text: '소리가 감지되지 않아요', cls: 'status-muted' },
  weak:     { text: '입력이 너무 약해요', cls: 'status-warning' },
  unstable: { text: '감지 중...', cls: 'status-muted' },
};

export default function App() {
  const [sensitivity, setSensitivity] = useLocalStorage('gt-sensitivity', 5);
  const [targetString, setTargetString] = useState(null);

  const { isListening, pitch, signalStatus, error, start, stop } = usePitchDetection({
    tuningStrings: GUITAR_STRINGS,
    targetString,
    sensitivity,
  });

  const cents        = pitch?.cents ?? null;
  const noteInfo     = pitch?.noteInfo;
  const guitarString = pitch?.guitarString;
  const isInTune     = cents != null && Math.abs(cents) < 5;

  const fillPct = `${((sensitivity - 1) / 9) * 100}%`;

  return (
    <div className="app">
      <header className="app-header">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="logo-icon">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
        <h1>Guitar Tuner</h1>
      </header>

      <main className="app-main">
        <StringSelector
          strings={GUITAR_STRINGS}
          activeString={guitarString}
          targetString={targetString}
          onSelect={gs => setTargetString(prev => prev?.string === gs.string ? null : gs)}
        />

        <div className="note-display">
          {error ? (
            <ErrorBlock error={error} onRetry={start} />
          ) : !isListening ? (
            <p className="note-placeholder">시작 버튼을 눌러주세요</p>
          ) : noteInfo ? (
            <>
              <div className={`note-name ${isInTune ? 'in-tune' : ''}`}>
                {noteInfo.noteName}
                <sup className="note-octave">{noteInfo.octave}</sup>
              </div>
              <div className="note-meta">
                {guitarString && (
                  <span className="string-label">
                    {guitarString.string}번 줄 · {guitarString.name}
                  </span>
                )}
                <span className="freq-display">{pitch.freq.toFixed(1)} Hz</span>
              </div>
              {isInTune && <div className="in-tune-badge">IN TUNE</div>}
            </>
          ) : (
            <div className="status-block">
              {SIGNAL_MESSAGES[signalStatus] && (
                <p className={SIGNAL_MESSAGES[signalStatus].cls}>
                  {SIGNAL_MESSAGES[signalStatus].text}
                </p>
              )}
            </div>
          )}
        </div>

        <TuningMeter cents={cents} />

        <div className="sensitivity-wrap">
          <div className="sensitivity-labels">
            <span>낮음</span>
            <span>감도</span>
            <span>높음</span>
          </div>
          <input
            type="range"
            className="sensitivity-slider"
            min={1} max={10} step={1}
            value={sensitivity}
            onChange={e => setSensitivity(Number(e.target.value))}
            style={{ '--fill': fillPct }}
          />
        </div>

        <button
          className={`toggle-btn ${isListening ? 'listening' : ''}`}
          onClick={isListening ? stop : start}
        >
          {isListening ? <><span className="btn-dot" />감지 중지</> : '튜닝 시작'}
        </button>
      </main>
    </div>
  );
}

function ErrorBlock({ error, onRetry }) {
  const isPermission = error === 'permission';
  return (
    <div className="error-block">
      <div className="error-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </div>
      <p className="error-title">{isPermission ? '마이크 접근 권한 없음' : '마이크를 찾을 수 없어요'}</p>
      <p className="error-desc">
        {isPermission
          ? '브라우저 주소창의 자물쇠 아이콘을 눌러 마이크 권한을 허용해주세요.'
          : '마이크가 연결되어 있는지 확인 후 다시 시도해주세요.'}
      </p>
      <button className="retry-btn" onClick={onRetry}>다시 시도</button>
    </div>
  );
}
