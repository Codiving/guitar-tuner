export function TuningMeter({ cents }) {
  const hasCents = cents != null;
  const clampedCents = Math.max(-50, Math.min(50, cents ?? 0));
  const rotation = (clampedCents / 50) * 70;
  const isInTune = hasCents && Math.abs(cents) < 5;

  const getDirectionInfo = () => {
    if (!hasCents) return null;
    if (isInTune) return { text: '정확해요!', cls: 'dir-good' };
    const absCents = Math.abs(cents);
    const magnitude = absCents > 25 ? '많이' : '조금';
    if (cents > 0) return { text: `${magnitude} 낮추세요`, cls: 'dir-high' };
    return { text: `${magnitude} 올리세요`, cls: 'dir-low' };
  };

  const dir = getDirectionInfo();

  return (
    <div className="meter-container">
      <div className="meter-arc">
        <svg viewBox="0 0 200 110" className="meter-svg">
          <defs>
            <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="40%" stopColor="#f59e0b" />
              <stop offset="50%" stopColor="#22c55e" />
              <stop offset="60%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>

          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#1e293b" strokeWidth="8" strokeLinecap="round" />
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#arcGrad)" strokeWidth="8" strokeLinecap="round" opacity="0.4" />
          <line x1="100" y1="100" x2="100" y2="28" stroke="#334155" strokeWidth="2" />

          {[-50, -25, 0, 25, 50].map((val) => {
            const angle = (val / 50) * 70 - 90;
            const rad = (angle * Math.PI) / 180;
            const x1 = 100 + 65 * Math.cos(rad);
            const y1 = 100 + 65 * Math.sin(rad);
            const x2 = 100 + 75 * Math.cos(rad);
            const y2 = 100 + 75 * Math.sin(rad);
            return (
              <line key={val} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={val === 0 ? '#22c55e' : '#475569'}
                strokeWidth={val === 0 ? 2.5 : 1.5}
              />
            );
          })}

          <g transform={`rotate(${rotation}, 100, 100)`}>
            <line x1="100" y1="100" x2="100" y2="30"
              stroke={isInTune ? '#22c55e' : '#f8fafc'}
              strokeWidth="2.5" strokeLinecap="round"
            />
            <circle cx="100" cy="100" r="5" fill={isInTune ? '#22c55e' : '#64748b'} />
          </g>
        </svg>
      </div>

      <div className={`cents-display ${isInTune ? 'in-tune' : ''}`}>
        {hasCents ? (
          <>
            <span className="cents-value">{cents > 0 ? '+' : ''}{Math.round(cents)}</span>
            <span className="cents-unit">cents</span>
          </>
        ) : (
          <span className="cents-waiting">–</span>
        )}
      </div>

      {dir && (
        <div className={`direction-hint ${dir.cls}`}>{dir.text}</div>
      )}
    </div>
  );
}
