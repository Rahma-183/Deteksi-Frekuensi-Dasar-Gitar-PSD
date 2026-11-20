import React, { useEffect, useRef } from 'react';

function setupCanvas(canvas, height = 230) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.parentElement.clientWidth || 500;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

export function WaveformChart({ yRaw, yFiltered, sr, segStartSec, segEndSec }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !yRaw?.length) return;

    const draw = () => {
      const { ctx, width, height } = setupCanvas(canvas, 220);
      const pad = { top: 20, right: 16, bottom: 28, left: 42 };
      const plotW = width - pad.left - pad.right;
      const plotH = height - pad.top - pad.bottom;

      // Grid horizontal
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();
      }

      // Sorotan area segmen steady-state
      const dur = yRaw.length / sr;
      const x1 = pad.left + (segStartSec / dur) * plotW;
      const x2 = pad.left + (Math.min(segEndSec, dur) / dur) * plotW;
      ctx.fillStyle = 'rgba(236, 72, 153, 0.14)';
      ctx.fillRect(x1, pad.top, x2 - x1, plotH);

      let maxAbs = 0.001;
      for (let i = 0; i < yRaw.length; i++) {
        const a = Math.abs(yRaw[i]);
        if (a > maxAbs) maxAbs = a;
      }

      const drawSignal = (arr, color, alpha, lineWidth) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        const step = Math.max(1, Math.floor(arr.length / plotW));
        for (let px = 0; px < plotW; px++) {
          const idx = Math.min(arr.length - 1, Math.floor((px / plotW) * arr.length));
          let val = 0;
          for (let s = 0; s < step && idx + s < arr.length; s++) {
            if (Math.abs(arr[idx + s]) > Math.abs(val)) val = arr[idx + s];
          }
          const y = pad.top + plotH / 2 - (val / maxAbs) * (plotH * 0.44);
          if (px === 0) ctx.moveTo(pad.left + px, y);
          else ctx.lineTo(pad.left + px, y);
        }
        ctx.stroke();
        ctx.restore();
      };

      drawSignal(yRaw, '#94a3b8', 0.45, 1);
      drawSignal(yFiltered, '#38bdf8', 0.95, 1.3);

      // Label sumbu
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText('0 dtk', pad.left, height - 8);
      ctx.fillText(`${(dur / 2).toFixed(1)} dtk`, pad.left + plotW / 2 - 18, height - 8);
      ctx.fillText(`${dur.toFixed(1)} dtk`, width - pad.right - 36, height - 8);
      ctx.fillText('+1', 10, pad.top + 8);
      ctx.fillText('0', 14, pad.top + plotH / 2 + 4);
      ctx.fillText('-1', 10, pad.top + plotH);
    };

    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [yRaw, yFiltered, sr, segStartSec, segEndSec]);

  return <canvas ref={canvasRef} className="w-full block" />;
}

export function WindowIfftChart({ yWindowed, yIfftSegment, segStartSec, sr }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !yWindowed?.length) return;

    const draw = () => {
      const { ctx, width, height } = setupCanvas(canvas, 220);
      const pad = { top: 20, right: 16, bottom: 28, left: 42 };
      const plotW = width - pad.left - pad.right;
      const plotH = height - pad.top - pad.bottom;

      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();
      }

      let maxAbs = 0.001;
      for (let i = 0; i < yWindowed.length; i++) {
        const a = Math.max(Math.abs(yWindowed[i]), Math.abs(yIfftSegment[i] || 0));
        if (a > maxAbs) maxAbs = a;
      }

      const drawSeg = (arr, color, alpha, lineWidth, dashed = false) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = lineWidth;
        if (dashed) ctx.setLineDash([5, 3]);
        ctx.beginPath();
        for (let px = 0; px < plotW; px++) {
          const idx = Math.min(arr.length - 1, Math.floor((px / plotW) * arr.length));
          const y = pad.top + plotH / 2 - (arr[idx] / maxAbs) * (plotH * 0.44);
          if (px === 0) ctx.moveTo(pad.left + px, y);
          else ctx.lineTo(pad.left + px, y);
        }
        ctx.stroke();
        ctx.restore();
      };

      drawSeg(yWindowed, '#a855f7', 0.75, 1.3, false);
      drawSeg(yIfftSegment, '#22d3ee', 0.95, 1.2, true);

      const dur = yWindowed.length / sr;
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText(`${segStartSec.toFixed(2)} dtk`, pad.left, height - 8);
      ctx.fillText(`${(segStartSec + dur).toFixed(2)} dtk`, width - pad.right - 48, height - 8);
    };

    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [yWindowed, yIfftSegment, segStartSec, sr]);

  return <canvas ref={canvasRef} className="w-full block" />;
}

export function SpectrumChart({ frequencies, fftResult, f0Fft, noteFftFull }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fftResult?.length) return;

    const draw = () => {
      const { ctx, width, height } = setupCanvas(canvas, 220);
      const pad = { top: 24, right: 16, bottom: 28, left: 42 };
      const plotW = width - pad.left - pad.right;
      const plotH = height - pad.top - pad.bottom;

      const maxFreqPlot = 1200;
      const pts = [];
      let maxMag = 0.001;
      for (let i = 0; i < Math.floor(frequencies.length / 2); i++) {
        const f = frequencies[i];
        if (f >= 0 && f <= maxFreqPlot) {
          pts.push({ f, m: fftResult[i] });
          if (fftResult[i] > maxMag) maxMag = fftResult[i];
        }
      }

      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();
      }

      // Area gradient fill
      const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
      grad.addColorStop(0, 'rgba(236, 72, 153, 0.55)');
      grad.addColorStop(1, 'rgba(168, 85, 247, 0.02)');

      ctx.beginPath();
      ctx.moveTo(pad.left, pad.top + plotH);
      pts.forEach((p) => {
        const x = pad.left + (p.f / maxFreqPlot) * plotW;
        const y = pad.top + plotH - (p.m / maxMag) * (plotH * 0.9);
        ctx.lineTo(x, y);
      });
      ctx.lineTo(pad.left + plotW, pad.top + plotH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Stroke line
      ctx.beginPath();
      pts.forEach((p, idx) => {
        const x = pad.left + (p.f / maxFreqPlot) * plotW;
        const y = pad.top + plotH - (p.m / maxMag) * (plotH * 0.9);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#f472b6';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Garis puncak F0
      if (f0Fft > 0 && f0Fft <= maxFreqPlot) {
        const px = pad.left + (f0Fft / maxFreqPlot) * plotW;
        ctx.save();
        ctx.strokeStyle = '#fde047';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, pad.top);
        ctx.lineTo(px, pad.top + plotH);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#fde047';
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        const labelText = `${f0Fft.toFixed(1)} Hz (${noteFftFull})`;
        const labelX = Math.min(width - pad.right - 115, Math.max(pad.left, px + 6));
        ctx.fillText(labelText, labelX, pad.top + 12);
      }

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px JetBrains Mono, monospace';
      [0, 300, 600, 900, 1200].forEach((fVal) => {
        const x = pad.left + (fVal / maxFreqPlot) * plotW;
        ctx.fillText(`${fVal}`, x - 8, height - 8);
      });
    };

    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [frequencies, fftResult, f0Fft, noteFftFull]);

  return <canvas ref={canvasRef} className="w-full block" />;
}

export function AutocorrChart({ acfNorm, lagMin, lagMax, peakLag, f0Ac, noteAcFull }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !acfNorm?.length) return;

    const draw = () => {
      const { ctx, width, height } = setupCanvas(canvas, 220);
      const pad = { top: 24, right: 16, bottom: 28, left: 42 };
      const plotW = width - pad.left - pad.right;
      const plotH = height - pad.top - pad.bottom;

      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();
      }

      const span = Math.max(1, lagMax - lagMin);
      ctx.beginPath();
      for (let lag = lagMin; lag < lagMax; lag++) {
        const x = pad.left + ((lag - lagMin) / span) * plotW;
        const val = Math.max(-1, Math.min(1, acfNorm[lag] || 0));
        const y = pad.top + plotH / 2 - val * (plotH * 0.44);
        if (lag === lagMin) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#2dd4bf';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Puncak lag
      if (peakLag >= lagMin && peakLag < lagMax) {
        const px = pad.left + ((peakLag - lagMin) / span) * plotW;
        const py = pad.top + plotH / 2 - Math.max(-1, Math.min(1, acfNorm[peakLag] || 0)) * (plotH * 0.44);

        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, pad.top);
        ctx.lineTo(px, pad.top + plotH);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(px, py, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = 'bold 11px JetBrains Mono, monospace';
        const labelX = Math.min(width - pad.right - 140, Math.max(pad.left, px + 6));
        ctx.fillText(`Lag ${peakLag} → ${f0Ac.toFixed(1)} Hz (${noteAcFull})`, labelX, pad.top + 12);
      }

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText(`${lagMin}`, pad.left, height - 8);
      ctx.fillText(`${Math.round((lagMin + lagMax) / 2)}`, pad.left + plotW / 2 - 12, height - 8);
      ctx.fillText(`${lagMax} sampel`, width - pad.right - 68, height - 8);
    };

    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [acfNorm, lagMin, lagMax, peakLag, f0Ac, noteAcFull]);

  return <canvas ref={canvasRef} className="w-full block" />;
}
