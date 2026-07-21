import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, CircleAlert, Mic, Play, Settings, Square } from 'lucide-react';
import { usePitchDetection } from './hooks/usePitchDetection';
import { useLocalStorage } from './hooks/useLocalStorage';
import { TuningMeter } from './components/TuningMeter';
import { TUNING_PRESETS } from './utils/pitchDetector';
import './App.css';

const A4_CHOICES = [432, 440, 442];
const CENTS_CHOICES = [3, 5, 7, 10];

const SIGNAL_MESSAGES = {
  idle: { title: '대기 중', text: '마이크를 시작하면 음정을 보여줍니다.', tone: 'neutral' },
  silent: { title: '무음', text: '입력이 너무 작습니다.', tone: 'muted' },
  weak: { title: '입력 약함', text: '신호는 들어오지만 아직 안정적이지 않습니다.', tone: 'warn' },
  unstable: { title: '불안정', text: '음정이 흔들립니다. 더 또렷한 소리를 내보세요.', tone: 'warn' },
  detecting: { title: '감지 중', text: '음정을 추적하고 있습니다.', tone: 'neutral' },
};

const ERROR_MESSAGES = {
  permission: {
    title: '마이크 권한이 필요합니다',
    text: '브라우저 또는 기기 설정에서 마이크 권한을 허용한 뒤 다시 시도하세요.',
  },
  device: {
    title: '마이크를 찾을 수 없습니다',
    text: '연결된 입력 장치가 있는지 확인한 뒤 다시 시도하세요.',
  },
  busy: {
    title: '마이크가 사용 중입니다',
    text: '다른 녹음 앱이나 통화 앱을 종료한 뒤 다시 시도하세요.',
  },
  access: {
    title: '마이크를 열 수 없습니다',
    text: '권한은 허용되어 있지만 장치를 여는 데 실패했습니다.',
  },
  unsupported: {
    title: '현재 환경에서는 마이크를 사용할 수 없습니다',
    text: '이 기기나 브라우저에서는 마이크 입력이 지원되지 않습니다.',
  },
};

const isNativeApp = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

export default function App() {
  const [presetId, setPresetId] = useLocalStorage('gt-preset-id', 'standard');
  const [targetMode, setTargetMode] = useLocalStorage('gt-target-mode', 'auto');
  const [selectedStringNumber, setSelectedStringNumber] = useLocalStorage('gt-selected-string', 6);
  const [referenceA4, setReferenceA4] = useLocalStorage('gt-reference-a4', 440);
  const [centsTolerance, setCentsTolerance] = useLocalStorage('gt-cents-tolerance', 5);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const preset = TUNING_PRESETS.find((item) => item.id === presetId) ?? TUNING_PRESETS[0];
  const tuningStrings = preset.strings;
  const selectedString =
    tuningStrings.find((item) => item.string === selectedStringNumber) ?? tuningStrings[0];
  const targetString = targetMode === 'manual' ? selectedString : null;

  const { isListening, pitch, signalStatus, error, start, stop } = usePitchDetection({
    tuningStrings,
    targetString,
    referenceA4,
    accidental: preset.accidental,
  });

  const referenceToneTarget = targetString ?? pitch?.guitarString ?? selectedString;

  const referenceAudioRef = useRef(null);

  const stopReferenceTone = useCallback(() => {
    const ctx = referenceAudioRef.current;
    if (!ctx) return;
    referenceAudioRef.current = null;
    ctx.close().catch(() => {});
  }, []);

  const playReferenceTone = useCallback(async () => {
    const target = referenceToneTarget ?? tuningStrings[0];
    if (!target) return;

    stopReferenceTone();

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    referenceAudioRef.current = ctx;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = target.freq;

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.35);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 1.45);

    oscillator.onended = () => {
      ctx.close().catch(() => {});
      if (referenceAudioRef.current === ctx) {
        referenceAudioRef.current = null;
      }
    };
  }, [referenceToneTarget, stopReferenceTone, tuningStrings]);

  useEffect(() => {
    return () => {
      stop();
      stopReferenceTone();
    };
  }, [stop, stopReferenceTone]);

  const cents = pitch?.cents ?? null;
  const isInTune = cents != null && Math.abs(cents) <= centsTolerance;
  const activeStringNumber = pitch?.guitarString?.string ?? selectedStringNumber;
  const currentTarget = targetString ?? pitch?.guitarString ?? null;
  const currentTargetLabel = currentTarget
    ? `${currentTarget.string}번 줄 · ${currentTarget.name}`
    : '자동 감지';
  const detectedNote = pitch?.noteInfo ? `${pitch.noteInfo.noteName}${pitch.noteInfo.octave}` : '---';
  const currentFreqLabel = pitch ? `${pitch.freq.toFixed(1)} Hz` : '대기 중';
  const directionText = getDirectionText(cents, isInTune);
  const statusInfo = error
    ? ERROR_MESSAGES[error] ?? ERROR_MESSAGES.access
    : SIGNAL_MESSAGES[signalStatus] ?? SIGNAL_MESSAGES.idle;

  const handleStringSelect = (stringNumber) => {
    setTargetMode('manual');
    setSelectedStringNumber(stringNumber);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <img src="/favicon-48.png" width="28" height="28" alt="" className="logo-icon" />
          <div className="brand-copy">
            <h1 className="brand-kicker">guitar tuner</h1>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className={`settings-toggle ${settingsOpen ? 'active' : ''}`}
            onClick={() => setSettingsOpen((value) => !value)}
            aria-expanded={settingsOpen}
            aria-controls="tuner-settings"
            aria-label="설정"
          >
            <Settings aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="tuner-panel">
          <div className="tuner-topline">
            <div className="hero-title-row">
              <span className="hero-label">현재 대상</span>
              <strong>{currentTargetLabel}</strong>
            </div>
            <span className="status-chip">{statusInfo.title}</span>
          </div>

          {error ? (
            <ErrorBlock error={error} onRetry={start} />
          ) : (
            <>
              <div className="pitch-stage">
                <div className={`note-name ${isInTune ? 'in-tune' : ''}`}>{detectedNote}</div>
                <div className="pitch-meta">
                  <span>{currentFreqLabel}</span>
                  <span>{directionText}</span>
                </div>
                <div className="pitch-badges">
                  {isInTune ? <span className="mini-badge success">정확함</span> : null}
                </div>
              </div>

              <TuningMeter cents={cents} isInTune={isInTune} />

              <div className="action-row">
                <button
                  type="button"
                  className={`toggle-btn ${isListening ? 'listening' : ''}`}
                  onClick={isListening ? stop : start}
                >
                  {isListening ? (
                    <>
                      <Square className="btn-icon" aria-hidden="true" />
                      감지 중지
                    </>
                  ) : (
                    <>
                      <Mic className="btn-icon" aria-hidden="true" />
                      튜닝 시작
                    </>
                  )}
                </button>

                <button type="button" className="ghost-btn" onClick={playReferenceTone}>
                  <Play className="btn-icon" aria-hidden="true" />
                  기준음 재생
                </button>
              </div>
            </>
          )}
        </section>

        <section
          id="tuner-settings"
          className={`settings-panel ${settingsOpen ? 'is-open' : 'is-closed'}`}
          hidden={!settingsOpen}
        >
          <div className="settings-body">
            <div className="panel">
              <div className="panel-heading">
                <h2>튜닝 프리셋</h2>
                <p>표준, 드롭 D, 반음 내림, 오픈 G를 전환할 수 있습니다.</p>
              </div>
              <div className="preset-list">
                {TUNING_PRESETS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`preset-pill ${preset.id === item.id ? 'active' : ''}`}
                    onClick={() => setPresetId(item.id)}
                  >
                    <strong>{item.name}</strong>
                    <span>{item.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-heading">
                <h2>대상 줄</h2>
                <p>자동 감지 또는 직접 선택을 사용할 수 있습니다.</p>
              </div>

              <div className="mode-toggle">
                <button
                  type="button"
                  className={`mode-btn ${targetMode === 'auto' ? 'active' : ''}`}
                  onClick={() => setTargetMode('auto')}
                >
                  자동 감지
                </button>
                <button
                  type="button"
                  className={`mode-btn ${targetMode === 'manual' ? 'active' : ''}`}
                  onClick={() => setTargetMode('manual')}
                >
                  수동 선택
                </button>
              </div>

              <div className="string-grid">
                {tuningStrings.map((stringItem) => {
                  const isSelected = stringItem.string === selectedStringNumber;
                  const isActive = stringItem.string === activeStringNumber;
                  return (
                    <button
                      key={`${preset.id}-${stringItem.string}`}
                      type="button"
                      className={`string-item ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''}`}
                      onClick={() => handleStringSelect(stringItem.string)}
                    >
                      <span className="string-num">{stringItem.string}</span>
                      <span className="string-note">{stringItem.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="panel">
              <div className="panel-heading">
                <h2>보정값</h2>
                <p>기준 주파수와 튜닝 허용폭을 조정합니다.</p>
              </div>

              <div className="setting-group">
                <div className="setting-label-row">
                  <span>A4 기준</span>
                  <strong>{referenceA4} Hz</strong>
                </div>
                <label className="select-wrap">
                  <span className="sr-only">A4 기준 선택</span>
                  <select
                    className="select-field"
                    value={referenceA4}
                    onChange={(event) => setReferenceA4(Number(event.target.value))}
                  >
                    {A4_CHOICES.map((value) => (
                      <option key={value} value={value}>
                        {value} Hz
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="select-icon" aria-hidden="true" />
                </label>
              </div>

              <div className="setting-group">
                <div className="setting-label-row">
                  <span>정확 판정</span>
                  <strong>±{centsTolerance} cents</strong>
                </div>
                <input
                  type="range"
                  className="sensitivity-slider"
                  min={CENTS_CHOICES[0]}
                  max={CENTS_CHOICES[CENTS_CHOICES.length - 1]}
                  step={1}
                  value={centsTolerance}
                  onChange={(event) => setCentsTolerance(Number(event.target.value))}
                  style={{ '--fill': `${((centsTolerance - CENTS_CHOICES[0]) / (CENTS_CHOICES[CENTS_CHOICES.length - 1] - CENTS_CHOICES[0])) * 100}%` }}
                />
                <div className="slider-caption">
                  <span>엄격</span>
                  <span>유연</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function getDirectionText(cents, isInTune) {
  if (cents == null) return '연주를 시작하세요';
  if (isInTune) return '정확해요';
  if (cents > 0) return '조금 낮추세요';
  return '조금 올리세요';
}

function ErrorBlock({ error, onRetry }) {
  const info = ERROR_MESSAGES[error] ?? ERROR_MESSAGES.access;
  const permissionDesc = isNativeApp
    ? '설정 > 앱 > 기타 튜너 > 권한 > 마이크에서 허용해주세요.'
    : '브라우저 주소창의 자물쇠 아이콘을 눌러 마이크 권한을 허용해주세요.';

  const description =
    error === 'permission' ? permissionDesc : info.text;

  return (
    <div className="error-block">
      <div className="error-icon" aria-hidden="true">
        <CircleAlert aria-hidden="true" />
      </div>
      <p className="error-title">{info.title}</p>
      <p className="error-desc">{description}</p>
      <button type="button" className="retry-btn" onClick={onRetry}>
        다시 시도
      </button>
    </div>
  );
}
