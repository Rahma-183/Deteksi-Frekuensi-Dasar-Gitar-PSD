import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AudioWaveform,
  BarChart3,
  CheckCircle2,
  Cpu,
  FileAudio,
  Filter,
  GitCompare,
  GraduationCap,
  Mic,
  Music,
  Play,
  Sliders,
  Sparkles,
  Square,
  Upload,
} from 'lucide-react';
import benchmarkData from './data/benchmarkData.json';
import {
  analyzeGuitarAudio,
  decodeAndResampleAudio,
  floatArrayToWavUrl,
  SR,
} from './utils/dspEngine';
import {
  AutocorrChart,
  SpectrumChart,
  WaveformChart,
  WindowIfftChart,
} from './components/SignalCharts';
import { ConfusionMatrixGrid } from './components/ConfusionMatrix';

export default function App() {
  const [selectedSampleUrl, setSelectedSampleUrl] = useState(
    benchmarkData.web_audio_samples[0]?.url || ''
  );
  const [activeAudioMeta, setActiveAudioMeta] = useState(
    benchmarkData.web_audio_samples[0] || {
      filename: 'Gretsch_C_open_122_ID1_1.wav',
      brand: 'Gretsch',
      akor: 'C',
      root: 'C',
    }
  );
  const [analysis, setAnalysis] = useState(null);
  const [rawAudioUrl, setRawAudioUrl] = useState('');
  const [ifftAudioUrl, setIfftAudioUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Mikrofon
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  // Filter tabel 30 sampel berdasarkan merek gitar
  const [brandFilter, setBrandFilter] = useState('Semua');
  const [scopeView, setScopeView] = useState('all'); // 'all' | '500'

  const runAnalysisFromArrayBuffer = async (arrayBuffer, metaInfo, blobUrlForRaw = null) => {
    setIsAnalyzing(true);
    setErrorMsg('');
    try {
      const yRaw = await decodeAndResampleAudio(arrayBuffer);
      const result = analyzeGuitarAudio(yRaw);
      setAnalysis(result);
      setActiveAudioMeta(metaInfo);

      if (blobUrlForRaw) {
        setRawAudioUrl(blobUrlForRaw);
      } else {
        setRawAudioUrl(floatArrayToWavUrl(yRaw, SR));
      }
      setIfftAudioUrl(floatArrayToWavUrl(result.yIfftSegment, SR));
    } catch (err) {
      setErrorMsg('Gagal memproses file audio. Pastikan format audio valid (.wav / .mp3 / .ogg).');
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const loadPresetSample = async (sampleObj) => {
    setSelectedSampleUrl(sampleObj.url);
    setIsAnalyzing(true);
    setErrorMsg('');
    try {
      const resp = await fetch(sampleObj.url);
      if (!resp.ok) throw new Error('Gagal mengunduh sampel audio');
      const buf = await resp.arrayBuffer();
      await runAnalysisFromArrayBuffer(buf, sampleObj, sampleObj.url);
    } catch (err) {
      setErrorMsg('Tidak dapat memuat sampel audio bawaan.');
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (benchmarkData.web_audio_samples.length > 0) {
      loadPresetSample(benchmarkData.web_audio_samples[0]);
    }
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedSampleUrl('');
    const buf = await file.arrayBuffer();
    const objectUrl = URL.createObjectURL(file);
    await runAnalysisFromArrayBuffer(
      buf,
      {
        filename: file.name,
        brand: 'Unggahan Pengguna',
        akor: '-',
        root: '-',
      },
      objectUrl
    );
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const buf = await blob.arrayBuffer();
        const url = URL.createObjectURL(blob);
        setSelectedSampleUrl('');
        await runAnalysisFromArrayBuffer(
          buf,
          {
            filename: 'Rekaman_Mikrofon_Langsung.webm',
            brand: 'Mikrofon Langsung',
            akor: '-',
            root: '-',
          },
          url
        );
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setErrorMsg('Izin mikrofon ditolak atau perangkat mikrofon tidak tersedia.');
    }
  };

  const activeStats =
    scopeView === 'all'
      ? {
          jumlah: benchmarkData.total_samples,
          fftAcc: benchmarkData.overall.fft_accuracy,
          acAcc: benchmarkData.overall.autocorr_accuracy,
          fftRange: benchmarkData.overall.fft_freq_range,
          acRange: benchmarkData.overall.autocorr_freq_range,
        }
      : {
          jumlah: benchmarkData.subset_500_hbstrat.count,
          fftAcc: benchmarkData.subset_500_hbstrat.fft_accuracy,
          acAcc: benchmarkData.subset_500_hbstrat.autocorr_accuracy,
          fftRange: benchmarkData.subset_500_hbstrat.fft_freq_range,
          acRange: benchmarkData.subset_500_hbstrat.autocorr_freq_range,
        };

  const filteredSamples30 =
    brandFilter === 'Semua'
      ? benchmarkData.sample_30_rows
      : benchmarkData.sample_30_rows.filter((r) => r.model_gitar === brandFilter);

  const uniqueBrands = ['Semua', ...benchmarkData.per_brand.map((b) => b['Model Gitar'])];

  return (
    <div>
      {/* NAVBAR */}
      <header className="navbar-wrap">
        <div className="container navbar">
          <a href="#beranda" className="brand">
            <span className="brand-icon">
              <AudioWaveform size={20} color="#fff" />
            </span>
            <span>Studio DSP Gitar</span>
          </a>

          <ul className="nav-links">
            <li><a href="#beranda">Ringkasan</a></li>
            <li><a href="#tahapan">Alur Metode</a></li>
            <li><a href="#lab">Studio Uji Audio</a></li>
            <li><a href="#evaluasi">Evaluasi Dataset</a></li>
            <li><a href="#kesimpulan">Kesimpulan</a></li>
          </ul>

          <a href="#lab" className="btn-pill btn-gradient-warm btn-sm">
            <Play size={14} fill="#fff" /> Uji Nada Langsung
          </a>
        </div>
      </header>

      {/* HERO SECTION */}
      <section id="beranda" className="hero-section">
        <div className="container hero-grid">
          <div>
            <div className="hero-badge">
              <Sparkles size={14} /> Proyek Akhir Pengolahan Sinyal Digital
            </div>
            <h1 className="hero-title">
              Analisis Perbandingan <span>Autocorrelation</span> &{' '}
              <span>FFT Peak Detection</span> Nada Dasar Gitar
            </h1>
            <p className="hero-desc">
              Sistem pemrosesan sinyal audio digital untuk mendeteksi nada dasar (frekuensi
              fundamental) gitar listrik pada dataset GADA. Dilengkapi penyaringan{' '}
              <em>Band-Pass Butterworth</em> orde 6, peredaman dengung listrik 50/100 Hz,
              rekonstruksi IFFT, serta uji interaktif langsung di peramban.
            </p>
            <div className="hero-actions">
              <a href="#lab" className="btn-pill btn-pink">
                <Music size={16} /> Mulai Uji Audio Langsung
              </a>
              <a href="#evaluasi" className="btn-pill btn-ghost">
                <BarChart3 size={16} /> Lihat Hasil {benchmarkData.total_samples.toLocaleString('id-ID')} Sampel
              </a>
            </div>
          </div>

          {/* KARTU SHOWCASE STUDIO (Sisi kanan hero) */}
          <div className="hero-studio-card">
            <div className="studio-screen">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="mono" style={{ fontSize: '0.78rem', color: '#38bdf8' }}>
                  PEMANTAU SPEKTRUM & PERIODISITAS
                </span>
                <span className="badge-ok">22.050 Hz</span>
              </div>
              <div className="studio-wave-bars">
                {[38, 65, 92, 54, 78, 96, 48, 85, 62, 74, 90, 44, 68, 82, 55, 40].map((h, i) => (
                  <div
                    key={i}
                    className="studio-bar"
                    style={{
                      height: `${h}%`,
                      animationDelay: `${(i * 0.1).toFixed(1)}s`,
                    }}
                  />
                ))}
              </div>
              <div className="muted-sm" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>5 Model Gitar GADA</span>
                <span>12 Kelas Nada → 7 Nada Dasar</span>
              </div>
            </div>

            <div className="hero-stat-row">
              <div className="hero-mini-stat">
                <div className="muted-sm">Akurasi Autocorrelation (IFFT)</div>
                <div className="val" style={{ color: '#22d3ee' }}>
                  {benchmarkData.overall.autocorr_accuracy}%
                </div>
                <div className="muted-sm">Domain Waktu</div>
              </div>
              <div className="hero-mini-stat">
                <div className="muted-sm">Akurasi FFT Peak Detection</div>
                <div className="val" style={{ color: '#f472b6' }}>
                  {benchmarkData.overall.fft_accuracy}%
                </div>
                <div className="muted-sm">Domain Frekuensi</div>
              </div>
            </div>
          </div>
        </div>

        {/* Pemisah Gelombang Organik seperti di gambar referensi */}
        <div className="hero-wave-divider">
          <svg viewBox="0 0 1440 80" preserveAspectRatio="none" style={{ width: '100%', height: 64 }}>
            <path
              d="M0,40 C320,85 680,-5 1040,48 C1240,72 1360,55 1440,35 L1440,80 L0,80 Z"
              fill="#09081f"
            />
          </svg>
        </div>
      </section>

      {/* 3-KOLOM FITUR UTAMA */}
      <section id="tahapan" className="section-dark">
        <div className="container">
          <div className="section-header">
            <h2>Alur Kerja Pengolahan Sinyal Digital</h2>
            <p>
              Setiap rekaman gitar diproses melalui tahapan penyaringan terstruktur sebelum
              dibandingkan menggunakan metode domain frekuensi dan domain waktu.
            </p>
          </div>

          <div className="grid-3" style={{ marginBottom: 42 }}>
            <div className="glass-card feature-card">
              <h3>1. Pra-Pemrosesan & Hamming</h3>
              <p>
                Sinyal disaring memakai <strong>Band-Pass Butterworth orde 6</strong> (50–6.000 Hz),
                dipotong pada bagian stabil (0,3–0,8 detik), lalu dihaluskan dengan{' '}
                <em>Hamming Window</em> guna menekan kebocoran spektrum.
              </p>
              <a href="#lab" className="btn-pill btn-purple btn-sm">
                <Filter size={14} /> Lihat Gelombang Filter
              </a>
            </div>

            <div className="glass-card feature-card">
              <h3>2. FFT Peak & Reduksi IFFT</h3>
              <p>
                Sinyal diubah ke domain frekuensi via <strong>FFT</strong>, dengung 50 Hz dan 100
                Hz diredam sebelum magnitudo dihitung, puncak energi dicari pada 50–1.200 Hz, lalu
                direkonstruksi ulang via <strong>IFFT</strong>.
              </p>
              <a href="#lab" className="btn-pill btn-pink btn-sm">
                <Activity size={14} /> Analisis Spektrum
              </a>
            </div>

            <div className="glass-card feature-card">
              <h3>3. Autocorrelation Domain Waktu</h3>
              <p>
                Sinyal bersih hasil rekonstruksi IFFT dihitung kemiripan periodiknya terhadap
                pergeseran waktu (<em>lag</em>) untuk menemukan periode dasar dan mengonversinya
                menjadi frekuensi serta nama nada.
              </p>
              <a href="#evaluasi" className="btn-pill btn-cyan btn-sm">
                <GitCompare size={14} /> Bandingkan Akurasi
              </a>
            </div>
          </div>

          {/* 3-KOLOM PAMERAN DOMAIN SINYAL */}
          <div className="grid-3">
            <div className="glass-card">
              <div className="showcase-thumb thumb-purple">
                <Sliders size={38} color="#c084fc" />
                <span className="mono" style={{ marginTop: 10, fontSize: '0.8rem', color: '#e9d5ff' }}>
                  Butterworth Orde 6 • 50–6000 Hz
                </span>
              </div>
              <h4 style={{ marginBottom: 6 }}>Sinyal Domain Waktu & Rekonstruksi</h4>
              <p className="muted-sm">
                Membuang getaran liar di luar jangkauan gitar dan menjaga kestabilan bentuk gelombang
                untuk deteksi periode.
              </p>
            </div>

            <div className="glass-card">
              <div className="showcase-thumb thumb-pink">
                <Activity size={38} color="#f472b6" />
                <span className="mono" style={{ marginTop: 10, fontSize: '0.8rem', color: '#fbcfe8' }}>
                  F0 = argmax |X(k)| • {benchmarkData.overall.fft_avg_time_ms} ms
                </span>
              </div>
              <h4 style={{ marginBottom: 6 }}>Puncak Spektrum Frekuensi (FFT)</h4>
              <p className="muted-sm">
                Sangat cepat dan stabil dalam rentang musik gitar, namun sensitif bila harmonik lebih
                kuat dari nada dasar.
              </p>
            </div>

            <div className="glass-card">
              <div className="showcase-thumb thumb-cyan">
                <Cpu size={38} color="#22d3ee" />
                <span className="mono" style={{ marginTop: 10, fontSize: '0.8rem', color: '#a5f3fc' }}>
                  F0 = Fs / lag_puncak • Akurasi {benchmarkData.overall.autocorr_accuracy}%
                </span>
              </div>
              <h4 style={{ marginBottom: 6 }}>Periodisitas Autokorelasi (ACF)</h4>
              <p className="muted-sm">
                Tangguh mengenali pola berulang di domain waktu, mencapai akurasi hingga 86,97% pada
                gitar Gretsch setelah input IFFT.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* STUDIO UJI AUDIO INTERAKTIF (LIVE DSP LAB) */}
      <section id="lab" className="section-dark" style={{ background: '#0c0b26' }}>
        <div className="container">
          <div className="section-header">
            <h2>Studio Uji Audio Gitar Langsung</h2>
            <p>
              Pilih sampel asli dari 5 model gitar dataset GADA, unggah rekaman Anda sendiri, atau
              petik gitar langsung lewat mikrofon. Seluruh pemrosesan DSP berjalan nyata di peramban
              Anda.
            </p>
          </div>

          <div className="glass-card">
            <div className="lab-controls">
              <div>
                <div className="muted-sm" style={{ marginBottom: 8 }}>
                  Pilih Sampel Bawaan Dataset GADA (8 Perwakilan):
                </div>
                <div className="sample-pills">
                  {benchmarkData.web_audio_samples.map((smp) => (
                    <button
                      key={smp.filename}
                      className={`sample-pill ${selectedSampleUrl === smp.url ? 'active' : ''}`}
                      onClick={() => loadPresetSample(smp)}
                    >
                      {smp.brand} — Akor {smp.akor}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label className="btn-pill btn-purple btn-sm" style={{ cursor: 'pointer' }}>
                  <Upload size={14} /> Unggah Audio (.wav/.mp3)
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>

                <button
                  onClick={toggleRecording}
                  className={`btn-pill btn-sm ${isRecording ? 'btn-pink' : 'btn-cyan'}`}
                >
                  {isRecording ? <Square size={14} /> : <Mic size={14} />}
                  {isRecording ? 'Hentikan Rekaman' : 'Rekam Mikrofon'}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div
                style={{
                  background: 'rgba(244, 63, 94, 0.16)',
                  border: '1px solid rgba(244, 63, 94, 0.4)',
                  color: '#fda4af',
                  padding: '10px 14px',
                  borderRadius: 12,
                  marginBottom: 16,
                  fontSize: '0.88rem',
                }}
              >
                {errorMsg}
              </div>
            )}

            {/* Info Sampel Aktif & Hasil Perbandingan */}
            <div className="result-banner-grid">
              <div className="metric-box">
                <div className="label">File Audio Aktif</div>
                <div style={{ fontWeight: 700, fontSize: '0.96rem', wordBreak: 'break-all' }}>
                  <FileAudio size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  {activeAudioMeta.filename}
                </div>
                <div className="muted-sm" style={{ marginTop: 6 }}>
                  Model: <strong>{activeAudioMeta.brand}</strong> • Label Asli:{' '}
                  <strong>
                    {activeAudioMeta.akor !== '-'
                      ? `Akor ${activeAudioMeta.akor} (Nada Dasar ${activeAudioMeta.root})`
                      : 'Audio Kustom'}
                  </strong>
                </div>
              </div>

              <div className="metric-box" style={{ borderColor: 'rgba(236, 72, 153, 0.4)' }}>
                <div className="label">Hasil FFT Peak Detection</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span className="big-note" style={{ color: '#f472b6' }}>
                    {isAnalyzing ? '...' : analysis?.fft.root || '-'}
                  </span>
                  <span className="mono" style={{ fontSize: '0.95rem', color: '#e2e8f0' }}>
                    {analysis ? `${analysis.fft.f0.toFixed(2)} Hz (${analysis.fft.noteFull})` : ''}
                  </span>
                </div>
                <div className="muted-sm" style={{ marginTop: 6 }}>
                  Waktu proses: {analysis ? `${analysis.fft.timeMs.toFixed(2)} ms` : '-'}
                  {activeAudioMeta.root !== '-' && analysis && (
                    <span style={{ marginLeft: 8 }}>
                      {analysis.fft.root === activeAudioMeta.root ? (
                        <span className="badge-ok">Cocok</span>
                      ) : (
                        <span className="badge-miss">Meleset</span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              <div className="metric-box" style={{ borderColor: 'rgba(34, 211, 238, 0.4)' }}>
                <div className="label">Hasil Autocorrelation (Input IFFT)</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span className="big-note" style={{ color: '#22d3ee' }}>
                    {isAnalyzing ? '...' : analysis?.autocorr.root || '-'}
                  </span>
                  <span className="mono" style={{ fontSize: '0.95rem', color: '#e2e8f0' }}>
                    {analysis
                      ? `${analysis.autocorr.f0.toFixed(2)} Hz (${analysis.autocorr.noteFull})`
                      : ''}
                  </span>
                </div>
                <div className="muted-sm" style={{ marginTop: 6 }}>
                  Waktu proses: {analysis ? `${analysis.autocorr.timeMs.toFixed(2)} ms` : '-'}
                  {activeAudioMeta.root !== '-' && analysis && (
                    <span style={{ marginLeft: 8 }}>
                      {analysis.autocorr.root === activeAudioMeta.root ? (
                        <span className="badge-ok">Cocok</span>
                      ) : (
                        <span className="badge-miss">Meleset</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {analysis && (
              <div
                style={{
                  background: 'rgba(139, 92, 246, 0.12)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  borderRadius: 12,
                  padding: '10px 16px',
                  marginBottom: 20,
                  fontSize: '0.86rem',
                }}
              >
                <strong>Analisis Hubungan Harmonik (Oktaf): </strong>
                {analysis.harmonicInfo.isHarmonic
                  ? `Terdeteksi selisih kelipatan harmonik ke-${analysis.harmonicInfo.k} antara hasil FFT dan Autocorrelation.`
                  : 'Tidak ditemukan selisih kelipatan harmonik (oktaf) antara kedua metode.'}
              </div>
            )}

            {/* PEMUTAR AUDIO */}
            <div className="audio-players-row">
              <div className="audio-box">
                <span style={{ fontSize: '0.84rem', fontWeight: 700 }}>
                  🔊 Audio Asli (Sebelum Penyaringan)
                </span>
                {rawAudioUrl && <audio controls src={rawAudioUrl} />}
              </div>
              <div className="audio-box">
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#67e8f9' }}>
                  🔊 Segmen Bersih Hasil Rekonstruksi IFFT (50–6000 Hz, Notch 50/100 Hz)
                </span>
                {ifftAudioUrl && <audio controls src={ifftAudioUrl} />}
              </div>
            </div>

            {/* 4 GRAFIK VISUALISASI SINYAL */}
            {analysis && (
              <div className="grid-2">
                <div className="chart-card">
                  <div className="chart-title">
                    <span>1. Gelombang Domain Waktu (Asli vs Band-Pass)</span>
                    <span className="muted-sm">Area merah muda = segmen stabil</span>
                  </div>
                  <WaveformChart
                    yRaw={analysis.yRaw}
                    yFiltered={analysis.yFiltered}
                    sr={analysis.sr}
                    segStartSec={analysis.segStartSec}
                    segEndSec={analysis.segEndSec}
                  />
                </div>

                <div className="chart-card">
                  <div className="chart-title">
                    <span>2. Segmen Hamming Window vs Rekonstruksi IFFT</span>
                    <span className="muted-sm">Ungu = Window | Biru putus = IFFT</span>
                  </div>
                  <WindowIfftChart
                    yWindowed={analysis.yWindowed}
                    yIfftSegment={analysis.yIfftSegment}
                    segStartSec={analysis.segStartSec}
                    sr={analysis.sr}
                  />
                </div>

                <div className="chart-card">
                  <div className="chart-title">
                    <span>3. Spektrum Frekuensi FFT (50–1.200 Hz)</span>
                    <span className="muted-sm">
                      Puncak: {analysis.fft.f0.toFixed(1)} Hz ({analysis.fft.noteFull})
                    </span>
                  </div>
                  <SpectrumChart
                    frequencies={analysis.frequencies}
                    fftResult={analysis.fftResult}
                    f0Fft={analysis.fft.f0}
                    noteFftFull={analysis.fft.noteFull}
                  />
                </div>

                <div className="chart-card">
                  <div className="chart-title">
                    <span>4. Kurva Autokorelasi (Rentang Lag Gitar)</span>
                    <span className="muted-sm">
                      Lag {analysis.peakLag} → {analysis.autocorr.f0.toFixed(1)} Hz
                    </span>
                  </div>
                  <AutocorrChart
                    acfNorm={analysis.acfNorm}
                    lagMin={analysis.lagMin}
                    lagMax={analysis.lagMax}
                    peakLag={analysis.peakLag}
                    f0Ac={analysis.autocorr.f0}
                    noteAcFull={analysis.autocorr.noteFull}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* DASBOR EVALUASI MASSAL */}
      <section id="evaluasi" className="section-dark">
        <div className="container">
          <div className="section-header">
            <h2>Hasil Evaluasi Dataset GADA (5 Model Gitar)</h2>
            <p>
              Pengujian menyeluruh dilakukan pada seluruh 2.172 sampel rekaman gitar listrik serta
              subset 500 sampel HBStrat untuk mengukur akurasi nada dasar, kestabilan frekuensi,
              dan pola kesalahan.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 18 }}>
              <button
                onClick={() => setScopeView('all')}
                className={`btn-pill btn-sm ${scopeView === 'all' ? 'btn-pink' : 'btn-ghost'}`}
              >
                Seluruh Dataset ({benchmarkData.total_samples.toLocaleString('id-ID')} Sampel)
              </button>
              <button
                onClick={() => setScopeView('500')}
                className={`btn-pill btn-sm ${scopeView === '500' ? 'btn-purple' : 'btn-ghost'}`}
              >
                Subset 500 Sampel HBStrat
              </button>
            </div>
          </div>

          {/* KARTU RINGKASAN ANGKA */}
          <div className="grid-3" style={{ marginBottom: 28 }}>
            <div className="glass-card">
              <div className="muted-sm">Akurasi Autocorrelation (Input IFFT)</div>
              <div style={{ fontSize: '2.4rem', fontWeight: 800, color: '#22d3ee' }}>
                {activeStats.acAcc}%
              </div>
              <p className="muted-sm" style={{ marginTop: 6 }}>
                Rentang F0: {activeStats.acRange[0]} – {activeStats.acRange[1]} Hz • Rata-rata{' '}
                {benchmarkData.overall.autocorr_avg_time_ms} ms/sampel
              </p>
            </div>

            <div className="glass-card">
              <div className="muted-sm">Akurasi FFT Peak Detection</div>
              <div style={{ fontSize: '2.4rem', fontWeight: 800, color: '#f472b6' }}>
                {activeStats.fftAcc}%
              </div>
              <p className="muted-sm" style={{ marginTop: 6 }}>
                Rentang F0: {activeStats.fftRange[0]} – {activeStats.fftRange[1]} Hz • Rata-rata{' '}
                {benchmarkData.overall.fft_avg_time_ms} ms/sampel
              </p>
            </div>

            <div className="glass-card">
              <div className="muted-sm">Indikasi Perbedaan Harmonik / Oktaf</div>
              <div style={{ fontSize: '2.4rem', fontWeight: 800, color: '#c084fc' }}>
                {benchmarkData.overall.harmonic_conflict_pct}%
              </div>
              <p className="muted-sm" style={{ marginTop: 6 }}>
                Persentase sampel di mana estimasi kedua metode terpisah oleh kelipatan harmonik (2×
                hingga 5×).
              </p>
            </div>
          </div>

          {/* PERBANDINGAN PER MEREK GITAR & PER NADA */}
          <div className="grid-2" style={{ marginBottom: 28 }}>
            <div className="glass-card">
              <h3 style={{ marginBottom: 6 }}>Akurasi Berdasarkan Model Gitar</h3>
              <p className="muted-sm" style={{ marginBottom: 18 }}>
                Merah muda = FFT Peak Detection | Biru = Autocorrelation (Input IFFT)
              </p>
              <div className="bar-group-row">
                {benchmarkData.per_brand.map((b) => (
                  <div key={b['Model Gitar']}>
                    <div className="bar-item-head">
                      <span>
                        {b['Model Gitar']} ({b['Jumlah Sampel']} file)
                      </span>
                      <span className="mono">
                        FFT {b['Akurasi FFT (%)']}% | ACF {b['Akurasi Autocorrelation (%)']}%
                      </span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill-fft" style={{ width: `${b['Akurasi FFT (%)']}%` }} />
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar-fill-ac"
                        style={{ width: `${b['Akurasi Autocorrelation (%)']}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card">
              <h3 style={{ marginBottom: 6 }}>Akurasi Berdasarkan Nada Dasar (A – G)</h3>
              <p className="muted-sm" style={{ marginBottom: 18 }}>
                Menunjukkan nada mana yang paling mudah atau sering tertukar harmoniknya
              </p>
              <div className="bar-group-row">
                {benchmarkData.per_note.map((n) => (
                  <div key={n.nada}>
                    <div className="bar-item-head">
                      <span>
                        Nada {n.nada} ({n.jumlah} sampel)
                      </span>
                      <span className="mono">
                        FFT {n.fft_acc}% | ACF {n.autocorr_acc}%
                      </span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill-fft" style={{ width: `${n.fft_acc}%` }} />
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill-ac" style={{ width: `${n.autocorr_acc}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CONFUSION MATRIX */}
          <div className="grid-2" style={{ marginBottom: 28 }}>
            <ConfusionMatrixGrid
              title="Matriks Kebingungan — FFT Peak Detection"
              subtitle={`Total ${benchmarkData.total_samples} sampel (arah kursor ke sel untuk melihat detail)`}
              labels={benchmarkData.labels}
              matrix={benchmarkData.confusion_matrix_fft}
              accent="pink"
            />
            <ConfusionMatrixGrid
              title="Matriks Kebingungan — Autocorrelation (Input IFFT)"
              subtitle={`Total ${benchmarkData.total_samples} sampel (arah kursor ke sel untuk melihat detail)`}
              labels={benchmarkData.labels}
              matrix={benchmarkData.confusion_matrix_autocorr}
              accent="cyan"
            />
          </div>

          {/* TABEL 30 SAMPEL PERWAKILAN */}
          <div className="glass-card">
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div>
                <h3>Tabel 30 Sampel Perwakilan</h3>
                <p className="muted-sm">
                  Menampilkan estimasi frekuensi (Hz) dan hasil pemetaan nada dasar yang sudah
                  bersih dan terformat rapi.
                </p>
              </div>
              <div className="sample-pills">
                {uniqueBrands.map((br) => (
                  <button
                    key={br}
                    onClick={() => setBrandFilter(br)}
                    className={`sample-pill ${brandFilter === br ? 'active' : ''}`}
                  >
                    {br}
                  </button>
                ))}
              </div>
            </div>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nama File</th>
                    <th>Model</th>
                    <th>Akor</th>
                    <th>Nada Asli</th>
                    <th>FFT (Hz)</th>
                    <th>Nada FFT</th>
                    <th>ACF (Hz)</th>
                    <th>Nada ACF</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSamples30.map((row) => (
                    <tr key={row.nama_file}>
                      <td className="mono" style={{ fontSize: '0.78rem' }}>
                        {row.nama_file}
                      </td>
                      <td>{row.model_gitar}</td>
                      <td>{row.akor_asli}</td>
                      <td>
                        <strong>{row.root_asli}</strong>
                      </td>
                      <td className="mono">{row.fft_freq_hz.toFixed(2)}</td>
                      <td>
                        <span
                          className={
                            row.fft_root === row.root_asli ? 'badge-ok' : 'badge-miss'
                          }
                        >
                          {row.fft_root}
                        </span>
                      </td>
                      <td className="mono">{row.autocorr_freq_hz.toFixed(2)}</td>
                      <td>
                        <span
                          className={
                            row.autocorr_root === row.root_asli ? 'badge-ok' : 'badge-miss'
                          }
                        >
                          {row.autocorr_root}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* BAGIAN BAWAH KONTRAS TERANG (Sesuai desain referensi gambar) */}
      <section id="kesimpulan" className="section-light">
        <div className="container">
          <div className="section-header" style={{ color: '#0f172a' }}>
            <h2>Kesimpulan & Ringkasan Proyek</h2>
            <p style={{ color: '#475569' }}>
              Rangkuman temuan ilmiah mengenai efektivitas domain waktu dan domain frekuensi dalam
              pengenalan nada dasar instrumen musik gitar.
            </p>
          </div>

          <div className="grid-3">
            <div className="light-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <CheckCircle2 color="#7c3aed" size={24} />
                <h3>Keunggulan Autocorrelation + IFFT</h3>
              </div>
              <p style={{ color: '#475569', fontSize: '0.92rem' }}>
                Memasukkan sinyal bersih hasil rekonstruksi <strong>IFFT</strong> ke algoritma{' '}
                <em>Autocorrelation</em> mampu mendorong akurasi rata-rata mencapai{' '}
                <strong>{benchmarkData.overall.autocorr_accuracy}%</strong> pada 2.172 sampel
                (hingga <strong>86,97%</strong> pada gitar Gretsch) karena noise dengung listrik
                dan fluktuasi awal petikan telah diredam.
              </p>
            </div>

            <div className="light-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Activity color="#ec4899" size={24} />
                <h3>Karakteristik FFT Peak Detection</h3>
              </div>
              <p style={{ color: '#475569', fontSize: '0.92rem' }}>
                <strong>FFT Peak Detection</strong> sangat cepat (rata-rata{' '}
                <strong>{benchmarkData.overall.fft_avg_time_ms} ms</strong> per sampel) dan
                menjaga rentang frekuensi pada batas wajar gitar ({benchmarkData.overall.fft_freq_range[0]}–
                {benchmarkData.overall.fft_freq_range[1]} Hz). Tantangan utamanya adalah dominasi
                harmonik, misalnya nada <strong>A</strong> yang kerap terdeteksi pada harmonik ke-3
                nya (<strong>E</strong>).
              </p>
            </div>

            <div className="light-card-accent">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <GraduationCap color="#22d3ee" size={24} />
                <h3>Identitas Proyek Portofolio</h3>
              </div>
              <p style={{ color: '#e2e8f0', fontSize: '0.9rem', marginBottom: 12 }}>
                <strong>Mata Kuliah:</strong> Pengolahan Sinyal Digital (2025)
                <br />
                <strong>Institusi:</strong> S1 Sains Data — FMIPA Universitas Negeri Surabaya
                <br />
                <strong>Tim Penyusun:</strong> Kelompok 6 (Niha Nur Mayla Putri & Rahmawati Dian
                Pratiwi)
                <br />
                <strong>Dosen Pengampu:</strong> Dr. Atik Wintarti, M.Kom.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          Studio DSP Gitar — Proyek Akhir Pengolahan Sinyal Digital • S1 Sains Data Universitas
          Negeri Surabaya
        </div>
      </footer>
    </div>
  );
}
