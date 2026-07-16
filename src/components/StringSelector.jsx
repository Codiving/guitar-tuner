export function StringSelector({ strings, activeString, targetString, onSelect }) {
  const displayed = [...strings].reverse(); // string 1 (high E) → string 6 (low E)

  return (
    <div className="string-selector">
      {displayed.map((gs) => {
        const isTarget = targetString?.string === gs.string;
        const isActive = !targetString && activeString?.string === gs.string;
        return (
          <button
            key={gs.string}
            className={`string-item ${isTarget ? 'targeted' : ''} ${isActive ? 'active' : ''}`}
            onClick={() => onSelect(gs)}
            title={`${gs.string}번 줄 — ${gs.name}`}
          >
            <span className="string-num">{gs.string}</span>
            <span className="string-note">{gs.note}</span>
          </button>
        );
      })}
    </div>
  );
}
