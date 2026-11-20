// Mesin Pengolahan Sinyal Digital (DSP) di sisi klien (Browser)
// Mengimplementasikan alur yang sama persis dengan Project_PSD.ipynb:
// 1. Resampling ke 22.050 Hz
// 2. Filter Band-Pass Butterworth Orde 6 (50 - 6.000 Hz)
// 3. Segmentasi Steady-State (0,3 - 0,8 detik)
// 4. Hamming Window
// 5. FFT + Peredaman Noise 50 Hz & 100 Hz sebelum menghitung magnitudo
// 6. Rekonstruksi Sinyal Bersih via IFFT
// 7. Deteksi Nada Dasar: FFT Peak Detection & Autocorrelation (Input IFFT)

export const SR = 22050;
export const F_LOW_CUT = 50;
export const F_HIGH_CUT = 6000;
export const NOISE_FREQS = [50, 100];
export const F_MIN_GUITAR = 50;
export const F_MAX_GUITAR = 1200;

// Koefisien SOS eksak dari scipy.signal.butter(6, [50/11025, 6000/11025], btype='band', output='sos')
const BUTTER_SOS = [
  [0.04241966575548881, 0.08483933151097763, 0.04241966575548881, 1.0, 0.1297651661958481, 0.02182536832289312],
  [1.0, 2.0, 1.0, 1.0, 0.15611628986811643, 0.1789196341644446],
  [1.0, 2.0, 1.0, 1.0, 0.21967636938158824, 0.5956599193022062],
  [1.0, -2.0, 1.0, 1.0, -1.9723541267621723, 0.97255906352232],
  [1.0, -2.0, 1.0, 1.0, -1.979852145043568, 0.9800556010862504],
  [1.0, -2.0, 1.0, 1.0, -1.9925281720163335, 0.9927307531667691],
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function hzToNote(freq) {
  if (!freq || freq <= 0) return 'N/A';
  const midi = Math.round(69 + 12 * Math.log2(freq / 440.0));
  const note = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

export function getNoteOnly(noteWithOctave) {
  if (!noteWithOctave || noteWithOctave === 'N/A' || noteWithOctave === 'Error') {
    return noteWithOctave || 'N/A';
  }
  return noteWithOctave.replace(/-?\d+/g, '').replace(/[#b♯♭]/g, '');
}

export function isHarmonicOf(fBig, fSmall, tolRel = 0.06, maxK = 5) {
  if (fSmall <= 0 || fBig <= 0) return { isHarmonic: false, k: null };
  const ratio = fBig / fSmall;
  const k = Math.round(ratio);
  if (k < 2 || k > maxK) return { isHarmonic: false, k: null };
  if (Math.abs(ratio - k) <= tolRel) return { isHarmonic: true, k };
  return { isHarmonic: false, k: null };
}

// Terapkan filter IIR SOS (Direct Form II Transposed)
export function applyBandpassSOS(input) {
  let x = new Float64Array(input);
  for (let s = 0; s < BUTTER_SOS.length; s++) {
    const [b0, b1, b2, , a1, a2] = BUTTER_SOS[s];
    const y = new Float64Array(x.length);
    let z1 = 0;
    let z2 = 0;
    for (let i = 0; i < x.length; i++) {
      const xi = x[i];
      const yi = b0 * xi + z1;
      z1 = b1 * xi - a1 * yi + z2;
      z2 = b2 * xi - a2 * yi;
      y[i] = yi;
    }
    x = y;
  }
  return x;
}

// Resampling audio ke mono 22.050 Hz menggunakan OfflineAudioContext
export async function decodeAndResampleAudio(arrayBuffer) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const tempCtx = new AudioCtx();
  const decoded = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
  await tempCtx.close();

  const targetLength = Math.max(1, Math.round(decoded.duration * SR));
  const offlineCtx = new OfflineAudioContext(1, targetLength, SR);
  const source = offlineCtx.createBufferSource();

  // Campurkan ke mono jika stereo
  if (decoded.numberOfChannels > 1) {
    const monoBuffer = offlineCtx.createBuffer(1, decoded.length, decoded.sampleRate);
    const out = monoBuffer.getChannelData(0);
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const chData = decoded.getChannelData(ch);
      for (let i = 0; i < decoded.length; i++) {
        out[i] += chData[i] / decoded.numberOfChannels;
      }
    }
    source.buffer = monoBuffer;
  } else {
    source.buffer = decoded;
  }

  source.connect(offlineCtx.destination);
  source.start(0);
  const rendered = await offlineCtx.startRendering();
  return new Float64Array(rendered.getChannelData(0));
}

// Radix-2 Cooley-Tukey FFT in-place (panjang M wajib pangkat 2)
function fftRadix2(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((2 * Math.PI) / len) * (inverse ? 1 : -1);
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + half] * wRe - im[i + j + half] * wIm;
        const vIm = re[i + j + half] * wIm + im[i + j + half] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe;
        im[i + j + half] = uIm - vIm;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

// Algoritma Bluestein FFT untuk panjang N sembarang (presisi identik dengan np.fft.fft)
export function fftArbitrary(realInput, imagInput = null, inverse = false) {
  const n = realInput.length;
  let m = 1;
  while (m < 2 * n + 1) m <<= 1;

  const cosTable = new Float64Array(n);
  const sinTable = new Float64Array(n);
  const sign = inverse ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const angle = (sign * Math.PI * ((i * i) % (2 * n))) / n;
    cosTable[i] = Math.cos(angle);
    sinTable[i] = Math.sin(angle);
  }

  const aRe = new Float64Array(m);
  const aIm = new Float64Array(m);
  for (let i = 0; i < n; i++) {
    const r = realInput[i];
    const im = imagInput ? imagInput[i] : 0;
    aRe[i] = r * cosTable[i] - im * sinTable[i];
    aIm[i] = r * sinTable[i] + im * cosTable[i];
  }

  const bRe = new Float64Array(m);
  const bIm = new Float64Array(m);
  bRe[0] = cosTable[0];
  bIm[0] = -sinTable[0];
  for (let i = 1; i < n; i++) {
    bRe[i] = bRe[m - i] = cosTable[i];
    bIm[i] = bIm[m - i] = -sinTable[i];
  }

  fftRadix2(aRe, aIm, false);
  fftRadix2(bRe, bIm, false);
  for (let i = 0; i < m; i++) {
    const tmpRe = aRe[i] * bRe[i] - aIm[i] * bIm[i];
    const tmpIm = aRe[i] * bIm[i] + aIm[i] * bRe[i];
    aRe[i] = tmpRe;
    aIm[i] = tmpIm;
  }
  fftRadix2(aRe, aIm, true);

  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  const scale = inverse ? 1 / n : 1;
  for (let i = 0; i < n; i++) {
    const r = aRe[i];
    const im = aIm[i];
    outRe[i] = (r * cosTable[i] - im * sinTable[i]) * scale;
    outIm[i] = (r * sinTable[i] + im * cosTable[i]) * scale;
  }
  return { re: outRe, im: outIm };
}

// Autocorrelation penuh menggunakan FFT (identik secara matematis dengan np.correlate)
function computeAutocorrelation(signal) {
  const n = signal.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += signal[i];
  mean /= n;

  let m = 1;
  while (m < 2 * n) m <<= 1;
  const re = new Float64Array(m);
  const im = new Float64Array(m);
  for (let i = 0; i < n; i++) {
    re[i] = signal[i] - mean;
  }

  fftRadix2(re, im, false);
  for (let i = 0; i < m; i++) {
    re[i] = re[i] * re[i] + im[i] * im[i];
    im[i] = 0;
  }
  fftRadix2(re, im, true);

  const acf = new Float64Array(n);
  for (let i = 0; i < n; i++) acf[i] = re[i];
  return acf;
}

// Pipeline Analisis Lengkap DSP untuk Satu Audio
export function analyzeGuitarAudio(yRaw) {
  const yFiltered = applyBandpassSOS(yRaw);

  // Segmentasi 0.3s - 0.8s (atau adaptasi jika audio rekaman singkat)
  let idxStart = Math.floor(0.3 * SR);
  let idxEnd = Math.min(Math.floor(0.8 * SR), yFiltered.length);
  if (idxEnd - idxStart < 2048) {
    idxStart = 0;
    idxEnd = yFiltered.length;
  }
  const ySegment = yFiltered.slice(idxStart, idxEnd);
  const N = ySegment.length;

  // Hamming Window
  const yWindowed = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1));
    yWindowed[i] = ySegment[i] * w;
  }

  // FFT
  const tFftStart = performance.now();
  const { re: specRe, im: specIm } = fftArbitrary(yWindowed, null, false);

  // Frekuensi tiap bin
  const frequencies = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    frequencies[i] = i <= N / 2 ? (i * SR) / N : ((i - N) * SR) / N;
  }

  // Notch manual 50 Hz dan 100 Hz sebelum menghitung magnitudo
  for (const nf of NOISE_FREQS) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < N; i++) {
      const dist = Math.abs(frequencies[i] - nf);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx > 1 && bestIdx < Math.floor(N / 2)) {
      for (let k = bestIdx - 1; k <= bestIdx + 1; k++) {
        specRe[k] *= 0.01;
        specIm[k] *= 0.01;
        const mir = N - k;
        if (mir >= 0 && mir < N) {
          specRe[mir] *= 0.01;
          specIm[mir] *= 0.01;
        }
      }
    }
  }

  // Hitung magnitudo bersih
  const fftResult = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    fftResult[i] = Math.hypot(specRe[i], specIm[i]);
  }

  // FFT Peak Detection (50 - 1200 Hz)
  let f0Fft = 0;
  let maxMag = -1;
  for (let i = 0; i < Math.floor(N / 2); i++) {
    const freq = frequencies[i];
    if (freq >= F_MIN_GUITAR && freq <= F_MAX_GUITAR) {
      if (fftResult[i] > maxMag) {
        maxMag = fftResult[i];
        f0Fft = freq;
      }
    }
  }
  const waktuFftMs = performance.now() - tFftStart;

  // Rekonstruksi IFFT
  const { re: yIfftSegment } = fftArbitrary(specRe, specIm, true);

  // Autocorrelation pada sinyal bersih IFFT
  const tAcStart = performance.now();
  const acfRaw = computeAutocorrelation(yIfftSegment);
  const lagMin = Math.floor(SR / F_MAX_GUITAR);
  const lagMax = Math.min(Math.floor(SR / F_MIN_GUITAR), acfRaw.length);

  let peakLag = lagMin;
  let maxAcf = -Infinity;
  for (let lag = lagMin; lag < lagMax; lag++) {
    if (acfRaw[lag] > maxAcf) {
      maxAcf = acfRaw[lag];
      peakLag = lag;
    }
  }
  const f0Ac = peakLag > 0 ? SR / peakLag : 0;
  const waktuAcMs = performance.now() - tAcStart;

  // Normalisasi ACF untuk visualisasi
  const acfNorm = new Float64Array(acfRaw.length);
  const acfZero = acfRaw[0] !== 0 ? acfRaw[0] : 1;
  for (let i = 0; i < acfRaw.length; i++) {
    acfNorm[i] = acfRaw[i] / acfZero;
  }

  const noteFftFull = hzToNote(f0Fft);
  const noteFftRoot = getNoteOnly(noteFftFull);
  const noteAcFull = hzToNote(f0Ac);
  const noteAcRoot = getNoteOnly(noteAcFull);

  const fBig = Math.max(f0Fft, f0Ac);
  const fSmall = Math.min(f0Fft, f0Ac);
  const harmonicInfo = isHarmonicOf(fBig, fSmall);

  return {
    sr: SR,
    segStartSec: idxStart / SR,
    segEndSec: idxEnd / SR,
    yRaw,
    yFiltered,
    ySegment,
    yWindowed,
    yIfftSegment,
    frequencies,
    fftResult,
    acfNorm,
    lagMin,
    lagMax,
    peakLag,
    fft: {
      f0: f0Fft,
      noteFull: noteFftFull,
      root: noteFftRoot,
      timeMs: waktuFftMs,
    },
    autocorr: {
      f0: f0Ac,
      noteFull: noteAcFull,
      root: noteAcRoot,
      timeMs: waktuAcMs,
    },
    harmonicInfo,
  };
}

// Konversi Float64Array ke URL Blob WAV agar bisa diputar ulang di browser
export function floatArrayToWavUrl(samples, sampleRate = SR) {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let maxAbs = 0;
  for (let i = 0; i < numSamples; i++) {
    const absVal = Math.abs(samples[i]);
    if (absVal > maxAbs) maxAbs = absVal;
  }
  const norm = maxAbs > 1 ? 1 / maxAbs : 1;

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] * norm));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}
