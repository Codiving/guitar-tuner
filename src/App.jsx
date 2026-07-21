import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  CircleAlert,
  Mic,
  Pencil,
  Play,
  Settings,
  Square,
  Trash2,
} from 'lucide-react';
import { usePitchDetection } from './hooks/usePitchDetection';
import { useLocalStorage } from './hooks/useLocalStorage';
import { TuningMeter } from './components/TuningMeter';
import {
  DEFAULT_TUNING_PRESETS,
  buildTuningStrings,
  parseTuningText,
} from './utils/pitchDetector';
import './App.css';

const A4_CHOICES = [432, 440, 442];
const CENTS_CHOICES = [3, 5, 7, 10];
const DEFAULT_TUNING_TEXT = 'E2 A2 D3 G3 B3 E4';
const PRESET_STORAGE_KEY = 'gt-tuning-presets';
const MAX_PRESETS = 8;

function createPresetId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `preset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneDefaultPresets() {
  return DEFAULT_TUNING_PRESETS.map((preset) => ({ ...preset }));
}

function getPresetPreview(preset) {
  return preset.tuningText;
}

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
  const [savedPresets, setSavedPresets] = useLocalStorage(
    PRESET_STORAGE_KEY,
    cloneDefaultPresets()
  );
  const [activeView, setActiveView] = useState('tuner');
  const [presetEditorOpen, setPresetEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState('create');
  const [editingPresetId, setEditingPresetId] = useState(null);
  const [presetNameDraft, setPresetNameDraft] = useState('');
  const [presetTuningDraft, setPresetTuningDraft] = useState(DEFAULT_TUNING_TEXT);
  const [presetError, setPresetError] = useState('');

  const preset = savedPresets.find((item) => item.id === presetId) ?? savedPresets[0];
  const canCreatePreset = savedPresets.length < MAX_PRESETS;
  const tuningStrings = buildTuningStrings(preset?.tuningText ?? DEFAULT_TUNING_TEXT, referenceA4) ?? [];
  const selectedString =
    tuningStrings.find((item) => item.string === selectedStringNumber) ?? tuningStrings[0];
  const targetString = targetMode === 'manual' ? selectedString : null;

  const { isListening, pitch, signalStatus, error, start, stop } = usePitchDetection({
    tuningStrings,
    targetString,
    referenceA4,
  });

  const referenceToneTarget = targetString ?? pitch?.guitarString ?? selectedString;

  const referenceAudioRef = useRef(null);
  const workspaceRef = useRef(null);

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

  useEffect(() => {
    workspaceRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeView]);

  useEffect(() => {
    if (!savedPresets.length) {
      setSavedPresets(cloneDefaultPresets());
      return;
    }
    if (!savedPresets.some((item) => item.id === presetId)) {
      setPresetId(savedPresets[0].id);
    }
  }, [presetId, savedPresets, setPresetId, setSavedPresets]);

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

  const openSettings = () => setActiveView('settings');
  const closeSettings = () => setActiveView('tuner');
  const openPresetEditor = (presetToEdit = null) => {
    if (!presetToEdit && !canCreatePreset) {
      setPresetError(`프리셋은 최대 ${MAX_PRESETS}개까지 만들 수 있습니다.`);
      setPresetEditorOpen(true);
      setEditorMode('create');
      setEditingPresetId(null);
      setPresetNameDraft('');
      setPresetTuningDraft(DEFAULT_TUNING_TEXT);
      return;
    }
    const fallback = presetToEdit ?? {
      id: createPresetId(),
      name: '내 프리셋',
      tuningText: DEFAULT_TUNING_TEXT,
    };
    setPresetEditorOpen(true);
    setEditorMode(presetToEdit ? 'edit' : 'create');
    setEditingPresetId(presetToEdit?.id ?? null);
    setPresetNameDraft(fallback.name);
    setPresetTuningDraft(fallback.tuningText);
    setPresetError('');
  };

  const closePresetEditor = () => {
    setPresetEditorOpen(false);
    setEditorMode('create');
    setEditingPresetId(null);
    setPresetNameDraft('');
    setPresetTuningDraft(DEFAULT_TUNING_TEXT);
    setPresetError('');
  };

  const savePreset = () => {
    const name = presetNameDraft.trim();
    const tuningText = presetTuningDraft.trim().replace(/\s+/g, ' ');
    const parsed = parseTuningText(tuningText);

    if (!name) {
      setPresetError('프리셋 이름을 입력하세요.');
      return;
    }

    if (!parsed) {
      setPresetError('튜닝은 "E2 A2 D3 G3 B3 E4"처럼 6개 항목으로 입력해야 합니다.');
      return;
    }

    if (!editingPresetId && savedPresets.length >= MAX_PRESETS) {
      setPresetError(`프리셋은 최대 ${MAX_PRESETS}개까지 만들 수 있습니다.`);
      return;
    }

    const nextPreset = {
      id: editingPresetId ?? createPresetId(),
      name,
      tuningText: parsed.map((item) => item.name).join(' '),
      accidental: parsed.some((item) => item.name.includes('b')) ? 'flat' : 'sharp',
    };

    setSavedPresets((current) => {
      const exists = current.some((item) => item.id === nextPreset.id);
      if (exists) {
        return current.map((item) => (item.id === nextPreset.id ? nextPreset : item));
      }
      return [...current, nextPreset];
    });
    setPresetId(nextPreset.id);
    setTargetMode('manual');
    setSelectedStringNumber(6);
    closePresetEditor();
  };

  const editPreset = (presetToEdit) => {
    openPresetEditor(presetToEdit);
  };

  const deletePreset = (presetToDelete) => {
    if (savedPresets.length <= 1) return;
    const confirmed = window.confirm(`"${presetToDelete.name}" 프리셋을 삭제할까요?`);
    if (!confirmed) return;

    setSavedPresets((current) => current.filter((item) => item.id !== presetToDelete.id));
    if (editingPresetId === presetToDelete.id) {
      closePresetEditor();
    }
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
          {activeView === 'settings' ? (
            <button type="button" className="settings-toggle" onClick={closeSettings} aria-label="뒤로">
              <ArrowLeft aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="settings-toggle" onClick={openSettings} aria-label="설정">
              <Settings aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <main ref={workspaceRef} className="workspace">
        {activeView === 'tuner' ? (
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
        ) : (
          <section aria-labelledby="settings-title">
            <h2 id="settings-title" className="sr-only">
              설정
            </h2>

            <div className="settings-body">
              <div className="panel">
                <div className="panel-heading">
                  <h3>튜닝 프리셋</h3>
                  <p>기본 프리셋을 고르거나, 이름과 튜닝을 직접 편집할 수 있습니다.</p>
                </div>
                <div className="preset-list">
                  {savedPresets.map((item) => {
                    const isActive = preset?.id === item.id;
                    return (
                      <div key={item.id} className={`preset-card ${isActive ? 'active' : ''}`}>
                        <div className="preset-card-top">
                          <button
                            type="button"
                            className="preset-select"
                            onClick={() => setPresetId(item.id)}
                          >
                            <strong>{item.name}</strong>
                            <span>{getPresetPreview(item)}</span>
                          </button>
                          <div className="preset-icon-actions">
                            <button
                              type="button"
                              className="icon-action"
                              onClick={() => editPreset(item)}
                              aria-label={`${item.name} 편집`}
                            >
                              <Pencil aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="icon-action danger"
                              onClick={() => deletePreset(item)}
                              disabled={savedPresets.length <= 1}
                              aria-label={`${item.name} 삭제`}
                            >
                              <Trash2 aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="ghost-btn preset-new-btn"
                  onClick={() => openPresetEditor()}
                  disabled={!canCreatePreset}
                >
                  새 프리셋 추가
                </button>
                {!canCreatePreset ? (
                  <p className="preset-limit-hint">프리셋은 최대 {MAX_PRESETS}개까지 저장할 수 있습니다.</p>
                ) : null}
              </div>

              {presetEditorOpen ? (
                <div className="panel">
                  <div className="panel-heading">
                    <h3>{editorMode === 'edit' ? '프리셋 편집' : '프리셋 추가'}</h3>
                    <p>이름과 6개 줄 튜닝을 직접 입력합니다.</p>
                  </div>

                  <div className="editor-form">
                    <label className="field-row">
                      <span>프리셋 이름</span>
                      <input
                        className="text-field"
                        type="text"
                        value={presetNameDraft}
                        onChange={(event) => setPresetNameDraft(event.target.value)}
                        placeholder="예: Drop C"
                      />
                    </label>

                    <label className="field-row">
                      <span>튜닝</span>
                      <input
                        className="text-field"
                        type="text"
                        value={presetTuningDraft}
                        onChange={(event) => setPresetTuningDraft(event.target.value)}
                        placeholder="E2 A2 D3 G3 B3 E4"
                      />
                    </label>

                    <p className="field-hint">형식: 낮은 줄부터 높은 줄까지 6개를 공백으로 구분해 입력하세요.</p>

                    {presetError ? <p className="field-error">{presetError}</p> : null}

                    <div className="editor-actions">
                      <button type="button" className="toggle-btn" onClick={savePreset}>
                        {editorMode === 'edit' ? '변경 저장' : '프리셋 저장'}
                      </button>
                      <button type="button" className="ghost-btn" onClick={closePresetEditor}>
                        취소
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="panel">
                <div className="panel-heading">
                  <h3>대상 줄</h3>
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
                  <h3>보정값</h3>
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
        )}
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
