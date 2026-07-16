import { useState } from 'react';
import { usePitchDetection } from './hooks/usePitchDetection';
import { useLocalStorage } from './hooks/useLocalStorage';
import { TuningMeter } from './components/TuningMeter';
import { StringSelector } from './components/StringSelector';
import { TUNING_PRESETS, SENSITIVITY_PRESETS } from './utils/pitchDetector';
import './App.css';

const A4_OPTIONS = [432, 440, 442];
const PRESET_KEYS = Object.keys(TUNING_PRESETS);
const SENSITIVITY_KEYS = Object.keys(SENSITIVITY_PRESETS);

const SIGNAL_MESSAGES = {
  silent:   { text: '소리가 감지되지 않아요', cls: 'status-muted' },
  weak:     { text: '입력이 너무 약해요 — 기타를 가까이 대주세요', cls: 'status-warning' },
  unstable: { text: '피치를 감지하는 중...', cls: 'status-muted' },
};

function App() {
  const [preset, setPreset]           = useLocalStorage('gt-preset',      'standard');
  const [a4, setA4]                   = useLocalStorage('gt-a4',          440);
  const [sensitivityKey, setSensKey]  = useLocalStorage('gt-sensitivity', 'normal');

  const [targetString, setTargetString] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const currentPreset      = TUNING_PRESETS[preset] ?? TUNING_PRESETS.standard;
  const tuningStrings      = currentPreset.strings;
  const useFlats           = currentPreset.useFlats ?? false;
  const sensitivityConfig  = SENSITIVITY_PRESETS[sensitivityKey] ?? SENSITIVITY_PRESETS.normal;

  const { isListening, pitch, signalStatus, error, start, stop } = usePitchDetection({
    a4,
    tuningStrings,
    targetString,
    useFlats,
    sensitivityConfig,
  });

  const cents        = pitch?.cents ?? null;
  const noteInfo     = pitch?.noteInfo;
  const guitarString = pitch?.guitarString;
  const isInTune     = cents != null && Math.abs(cents) < 5;

  // 실제 감지된 음을 그대로 표시 (getNoteInfo가 이미 useFlats 반영)
  const displayNote   = noteInfo?.noteName;
  const displayOctave = noteInfo?.octave;

  const handleStringClick = (gs) => {
    setTargetString(prev => prev?.string === gs.string ? null : gs);
  };

  const handlePresetChange = (key) => {
    setPreset(key);
    setTargetString(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <svg className="logo-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <h1>Guitar Tuner</h1>
        </div>
        <button
          className={`settings-btn ${showSettings ? 'active' : ''}`}
          onClick={() => setShowSettings(s => !s)}
          aria-label="설정"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      {showSettings && (
        <div className="settings-panel">
          <div className="settings-row">
            <span className="settings-label">기준음 A4</span>
            <div className="settings-options">
              {A4_OPTIONS.map(val => (
                <button
                  key={val}
                  className={`option-pill ${a4 === val ? 'selected' : ''}`}
                  onClick={() => setA4(val)}
                >
                  {val} Hz
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-label">감도</span>
            <div className="settings-options">
              {SENSITIVITY_KEYS.map(key => (
                <button
                  key={key}
                  className={`option-pill ${sensitivityKey === key ? 'selected' : ''}`}
                  onClick={() => setSensKey(key)}
                >
                  {SENSITIVITY_PRESETS[key].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="app-main">
        {/* 프리셋 선택 */}
        <div className="preset-row">
          {PRESET_KEYS.map(key => (
            <button
              key={key}
              className={`preset-pill ${preset === key ? 'selected' : ''}`}
              onClick={() => handlePresetChange(key)}
            >
              {TUNING_PRESETS[key].label}
            </button>
          ))}
        </div>

        {/* 현 선택 */}
        <div className="string-selector-wrap">
          <StringSelector
            strings={tuningStrings}
            activeString={guitarString}
            targetString={targetString}
            onSelect={handleStringClick}
          />
          <p className="selector-hint">
            {targetString
              ? `${targetString.string}번 줄 선택됨 — 다시 탭하면 해제`
              : '줄을 탭하면 수동 선택'}
          </p>
        </div>

        {/* 음 표시 */}
        <div className="note-display">
          {error ? (
            <ErrorBlock error={error} onRetry={start} />
          ) : !isListening ? (
            <p className="note-placeholder">시작 버튼을 눌러주세요</p>
          ) : displayNote ? (
            <>
              <div className={`note-name ${isInTune ? 'in-tune' : ''}`}>
                {displayNote}
                <sup className="note-octave">{displayOctave}</sup>
              </div>
              <div className="note-meta">
                {guitarString && (
                  <span className="string-label">
                    {guitarString.string}번 줄 · {guitarString.name}
                    {targetString ? ' (선택됨)' : ' (자동)'}
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

        <button
          className={`toggle-btn ${isListening ? 'listening' : ''}`}
          onClick={isListening ? stop : start}
        >
          {isListening
            ? <><span className="btn-dot" />감지 중지</>
            : '튜닝 시작'}
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
      <p className="error-title">
        {isPermission ? '마이크 접근 권한 없음' : '마이크를 찾을 수 없어요'}
      </p>
      <p className="error-desc">
        {isPermission
          ? '브라우저 주소창의 자물쇠 아이콘을 눌러 마이크 권한을 허용해주세요.'
          : '마이크가 연결되어 있는지 확인 후 다시 시도해주세요.'}
      </p>
      <button className="retry-btn" onClick={onRetry}>
        다시 시도
      </button>
    </div>
  );
}

export default App;
