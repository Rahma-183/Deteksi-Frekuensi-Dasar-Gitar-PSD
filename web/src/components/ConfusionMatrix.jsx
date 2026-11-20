import React, { useState } from 'react';

export function ConfusionMatrixGrid({ title, subtitle, labels, matrix, accent = 'pink' }) {
  const [hovered, setHovered] = useState(null);

  const rowSums = matrix.map((row) => row.reduce((a, b) => a + b, 0));

  const getCellStyle = (val, rowTotal, isDiag) => {
    const ratio = rowTotal > 0 ? val / rowTotal : 0;
    if (accent === 'pink') {
      const alpha = isDiag ? 0.25 + ratio * 0.7 : 0.04 + ratio * 0.55;
      return {
        backgroundColor: isDiag
          ? `rgba(236, 72, 153, ${alpha.toFixed(2)})`
          : `rgba(168, 85, 247, ${alpha.toFixed(2)})`,
        borderColor: isDiag ? 'rgba(244, 114, 182, 0.5)' : 'rgba(255, 255, 255, 0.06)',
      };
    }
    const alpha = isDiag ? 0.25 + ratio * 0.7 : 0.04 + ratio * 0.55;
    return {
      backgroundColor: isDiag
        ? `rgba(34, 211, 238, ${alpha.toFixed(2)})`
        : `rgba(99, 102, 241, ${alpha.toFixed(2)})`,
      borderColor: isDiag ? 'rgba(56, 189, 248, 0.5)' : 'rgba(255, 255, 255, 0.06)',
    };
  };

  return (
    <div className="glass-card cm-card">
      <div className="cm-header">
        <div>
          <h3>{title}</h3>
          <p className="muted-sm">{subtitle}</p>
        </div>
        {hovered && (
          <div className="cm-tooltip">
            Asli <strong>{hovered.trueLabel}</strong> → Prediksi <strong>{hovered.predLabel}</strong>:{' '}
            <span>{hovered.count} sampel</span> ({hovered.pct}%)
          </div>
        )}
      </div>

      <div className="cm-table-wrap">
        <div className="cm-axis-y">Nada Asli</div>
        <div className="cm-grid-box">
          <div className="cm-row cm-head-row">
            <div className="cm-corner">Asli \ Pred</div>
            {labels.map((lbl) => (
              <div key={lbl} className="cm-col-head">
                {lbl}
              </div>
            ))}
          </div>
          {matrix.map((row, rIdx) => (
            <div key={labels[rIdx]} className="cm-row">
              <div className="cm-row-head">{labels[rIdx]}</div>
              {row.map((val, cIdx) => {
                const pct = rowSums[rIdx] > 0 ? ((val / rowSums[rIdx]) * 100).toFixed(1) : '0.0';
                return (
                  <div
                    key={cIdx}
                    className={`cm-cell ${rIdx === cIdx ? 'cm-diag' : ''}`}
                    style={getCellStyle(val, rowSums[rIdx], rIdx === cIdx)}
                    onMouseEnter={() =>
                      setHovered({
                        trueLabel: labels[rIdx],
                        predLabel: labels[cIdx],
                        count: val,
                        pct,
                      })
                    }
                    onMouseLeave={() => setHovered(null)}
                  >
                    {val}
                  </div>
                );
              })}
            </div>
          ))}
          <div className="cm-axis-x">Nada Prediksi</div>
        </div>
      </div>
    </div>
  );
}
