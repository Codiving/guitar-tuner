import { usePitchDetection } from './hooks/usePitchDetection';
import { useLocalStorage } from './hooks/useLocalStorage';
import { TuningMeter } from './components/TuningMeter';
import { GUITAR_STRINGS } from './utils/pitchDetector';
import './App.css';

const SIGNAL_MESSAGES = {
  silent:   { text: '소리가 감지되지 않아요', cls: 'status-muted' },
  weak:     { text: '입력이 너무 약해요',       cls: 'status-warning' },
  unstable: { text: '감지 중...',                cls: 'status-muted' },
};

export default function App() {
  const [hzTolerance, setHzTolerance] = useLocalStorage('gt-hz-tolerance', 3);

  const { isListening, pitch, signalStatus, error, start, stop } = usePitchDetection({
    tuningStrings: GUITAR_STRINGS,
  });

  const cents        = pitch?.cents ?? null;
  const noteInfo     = pitch?.noteInfo;
  const guitarString = pitch?.guitarString;

  const targetFreq = guitarString?.freq ?? noteInfo?.targetFreq;
  const isInTune   = pitch != null && targetFreq != null
    && Math.abs(pitch.freq - targetFreq) < hzTolerance;

  const fillPct = `${((hzTolerance - 1) / 4) * 100}%`;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <img src="/favicon-48.png" width="28" height="28" alt="" className="logo-icon" />
          <h1>Guitar Tuner</h1>
        </div>
      </header>

      <main className="app-main">
        {/* 중앙 콘텐츠 */}
        <div className="main-content">
          <button
            className={`toggle-btn ${isListening ? 'listening' : ''}`}
            onClick={isListening ? stop : start}
          >
            {isListening ? <><span className="btn-dot" />감지 중지</> : '튜닝 시작'}
          </button>

          <div className="note-display">
            {error ? (
              <ErrorBlock error={error} onRetry={start} />
            ) : !isListening ? null : noteInfo ? (
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
                <div className="in-tune-slot" aria-live="polite">
                  {isInTune ? (
                    <div className="in-tune-badge">IN TUNE</div>
                  ) : (
                    <div className="in-tune-badge in-tune-badge-placeholder" aria-hidden="true">
                      IN TUNE
                    </div>
                  )}
                </div>
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

          <TuningMeter cents={cents} isInTune={isInTune} />

          <div className="sensitivity-wrap">
            <div className="sensitivity-labels">
              <span>엄격</span>
              <span className="sensitivity-value">±{hzTolerance} Hz</span>
              <span>유연</span>
            </div>
            <input
              type="range"
              className="sensitivity-slider"
              min={1} max={5} step={1}
              value={hzTolerance}
              onChange={e => setHzTolerance(Number(e.target.value))}
              style={{ '--fill': fillPct }}
            />
          </div>

        </div>
      </main>

    </div>
  );
}

const isNativeApp = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

function ErrorBlock({ error, onRetry }) {
  const isPermission = error === 'permission';
  const isBusy = error === 'busy';
  const isAccess = error === 'access';
  const isUnsupported = error === 'unsupported';
  let permissionDesc;
  if (isPermission) {
    if (isNativeApp) {
      permissionDesc = '설정 > 앱 > Guitar Tuner > 권한 > 마이크에서 허용해주세요.';
    } else {
      permissionDesc = '브라우저 주소창의 자물쇠 아이콘을 눌러 마이크 권한을 허용해주세요.';
    }
  }
  let title = '마이크를 찾을 수 없어요';
  let desc = '마이크가 연결되어 있는지 확인 후 다시 시도해주세요.';

  if (isPermission) {
    title = '마이크 접근 권한 없음';
    desc = permissionDesc;
  } else if (isBusy) {
    title = '마이크가 사용 중이에요';
    desc = '다른 녹음 앱이나 통화 앱을 종료한 뒤 다시 시도해주세요.';
  } else if (isAccess) {
    title = '마이크 접근에 실패했어요';
    desc = '권한은 허용되어 있지만 마이크를 열지 못했습니다. 앱을 완전히 종료한 뒤 다시 실행해보세요.';
  } else if (isUnsupported) {
    title = '현재 환경에서는 마이크를 사용할 수 없어요';
    desc = '이 기기나 브라우저에서는 마이크 입력이 지원되지 않습니다.';
  }

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
      <p className="error-title">{title}</p>
      <p className="error-desc">{desc}</p>
      <button className="retry-btn" onClick={onRetry}>다시 시도</button>
    </div>
  );
}
