import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  VIDEO_OPTIMIZER_LIMITS,
  inspectVideoSource,
  mediaOptimizerCapabilities,
  optimizeHeroVideo,
  validateVideoSource
} from './videoOptimizer.js';
import './videoOptimizer.css';

function copy(lang, it, en) {
  return lang === 'it' ? it : en;
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(value) {
  const seconds = Math.max(0, Number(value) || 0);
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

function downloadFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function VideoOptimizer({ lang = 'it', onApply }) {
  const capabilities = useMemo(() => mediaOptimizerCapabilities(), []);
  const initialFormat = capabilities.mp4 ? 'mp4' : 'webm';
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceInfo, setSourceInfo] = useState(null);
  const [format, setFormat] = useState(initialFormat);
  const [clipSeconds, setClipSeconds] = useState(VIDEO_OPTIMIZER_LIMITS.defaultClipSeconds);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const abortRef = useRef(null);

  const videoPreviewUrl = useMemo(
    () => result?.videoFile ? URL.createObjectURL(result.videoFile) : '',
    [result?.videoFile]
  );
  const posterPreviewUrl = useMemo(
    () => result?.posterFile ? URL.createObjectURL(result.posterFile) : '',
    [result?.posterFile]
  );

  useEffect(() => () => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
  }, [videoPreviewUrl]);

  useEffect(() => () => {
    if (posterPreviewUrl) URL.revokeObjectURL(posterPreviewUrl);
  }, [posterPreviewUrl]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function handleSourceChange(event) {
    const file = event.target.files?.[0] || null;
    setError('');
    setResult(null);
    setSourceInfo(null);
    setSourceFile(file);
    if (!file) return;

    try {
      validateVideoSource(file);
      const info = await inspectVideoSource(file);
      setSourceInfo(info);
      setClipSeconds(VIDEO_OPTIMIZER_LIMITS.defaultClipSeconds);
    } catch (err) {
      setSourceFile(null);
      setError(err?.message || copy(lang, 'Video non valido.', 'Invalid video.'));
    }
  }

  async function handleOptimize() {
    if (!sourceFile || processing) return;
    setError('');
    setResult(null);
    setProgress(0);
    setProcessing(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const optimized = await optimizeHeroVideo(sourceFile, {
        format,
        clipSeconds,
        signal: controller.signal,
        onProgress: setProgress
      });
      setResult(optimized);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setError(err?.message || copy(lang, 'Ottimizzazione non riuscita.', 'Optimization failed.'));
      }
    } finally {
      abortRef.current = null;
      setProcessing(false);
    }
  }

  function handleApply() {
    if (!result || typeof onApply !== 'function') return;
    onApply(result);
  }

  return (
    <section className="video-optimizer" aria-labelledby="video-optimizer-title">
      <div className="video-optimizer-heading">
        <div>
          <span className="micro-label">{copy(lang, 'Ottimizzatore media', 'Media optimizer')}</span>
          <h3 id="video-optimizer-title">{copy(lang, 'Prepara un video per lo sfondo hero', 'Prepare a hero background video')}</h3>
          <p>{copy(
            lang,
            'MOV, MP4 o WEBM vengono elaborati localmente nel browser. L’output non viene caricato finché non scegli “Usa nella hero” e poi “Salva tutto”.',
            'MOV, MP4, or WEBM files are processed locally in your browser. Nothing is uploaded until you choose “Use in hero” and then “Save all”.'
          )}</p>
        </div>
        <span className="video-optimizer-badge">{copy(lang, 'Preset: Website Hero', 'Preset: Website Hero')}</span>
      </div>

      {!capabilities.available && (
        <div className="admin-alert warning" role="alert">
          {copy(
            lang,
            'Questo browser non supporta la conversione locale. Usa un browser desktop aggiornato oppure carica un MP4/WEBM già ottimizzato.',
            'This browser does not support local conversion. Use an up-to-date desktop browser or upload an already optimized MP4/WEBM.'
          )}
        </div>
      )}

      <div className="video-optimizer-controls">
        <label className="admin-field full">
          <span>{copy(lang, 'Video sorgente', 'Source video')}</span>
          <input
            type="file"
            accept="video/quicktime,video/mp4,video/webm,.mov,.mp4,.webm"
            onChange={handleSourceChange}
            disabled={processing}
          />
          <small>{copy(lang, 'Massimo 180 MB. L’audio viene rimosso.', 'Maximum 180 MB. Audio is removed.')}</small>
        </label>

        <label className="admin-field">
          <span>{copy(lang, 'Formato output', 'Output format')}</span>
          <select value={format} onChange={(event) => setFormat(event.target.value)} disabled={processing}>
            <option value="mp4" disabled={!capabilities.mp4}>MP4 {capabilities.mp4 ? '' : copy(lang, '(non supportato)', '(unsupported)')}</option>
            <option value="webm" disabled={!capabilities.webm}>WEBM {capabilities.webm ? '' : copy(lang, '(non supportato)', '(unsupported)')}</option>
          </select>
        </label>

        <label className="admin-field">
          <span>{copy(lang, 'Durata clip', 'Clip length')}</span>
          <select value={clipSeconds} onChange={(event) => setClipSeconds(Number(event.target.value))} disabled={processing}>
            {[6, 10, 15, 20, 30].map((seconds) => (
              <option key={seconds} value={seconds}>{seconds}s</option>
            ))}
          </select>
        </label>
      </div>

      {sourceInfo && (
        <div className="video-optimizer-source-meta">
          <span>{sourceInfo.width}×{sourceInfo.height}</span>
          <span>{formatDuration(sourceInfo.duration)}</span>
          <span>{formatBytes(sourceInfo.size)}</span>
          {sourceInfo.duration > clipSeconds && <span>{copy(lang, `Verranno usati i primi ${clipSeconds}s`, `First ${clipSeconds}s will be used`)}</span>}
        </div>
      )}

      {error && <div className="admin-alert error" role="alert">{error}</div>}

      {processing && (
        <div className="video-optimizer-progress" role="status" aria-live="polite">
          <div className="video-optimizer-progress-head">
            <strong>{copy(lang, 'Ottimizzazione in corso…', 'Optimizing…')}</strong>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <progress max="1" value={progress} />
          <p>{copy(
            lang,
            'La conversione avviene in tempo reale nel browser: una clip di 15 secondi richiede circa 15 secondi.',
            'Conversion runs in real time in the browser: a 15-second clip takes about 15 seconds.'
          )}</p>
          <button className="button secondary" type="button" onClick={() => abortRef.current?.abort()}>
            {copy(lang, 'Annulla', 'Cancel')}
          </button>
        </div>
      )}

      <div className="video-optimizer-actions">
        <button
          className="button primary"
          type="button"
          onClick={handleOptimize}
          disabled={!sourceFile || processing || !capabilities.available || !capabilities[format]}
        >
          {copy(lang, 'Ottimizza video', 'Optimize video')}
        </button>
        <span className="small-note">
          {copy(
            lang,
            'Output: max 1280×720, 30 fps, senza audio, sotto il limite Storage di 10 MB quando possibile.',
            'Output: max 1280×720, 30 fps, no audio, kept below the 10 MB Storage limit when possible.'
          )}
        </span>
      </div>

      {result && (
        <div className="video-optimizer-result">
          <div className="video-optimizer-result-grid">
            <div>
              <span className="micro-label">{copy(lang, 'Video ottimizzato', 'Optimized video')}</span>
              <video src={videoPreviewUrl} controls muted playsInline />
              <p>{result.width}×{result.height} · {formatDuration(result.duration)} · {formatBytes(result.videoFile.size)} · {result.format.toUpperCase()}</p>
            </div>
            <div>
              <span className="micro-label">{copy(lang, 'Poster fallback', 'Fallback poster')}</span>
              <img src={posterPreviewUrl} alt="" />
              <p>{formatBytes(result.posterFile.size)} · {result.posterFile.type === 'image/webp' ? 'WEBP' : 'JPEG'}</p>
            </div>
          </div>
          <div className="video-optimizer-result-actions">
            <button className="button primary" type="button" onClick={handleApply}>
              {copy(lang, 'Usa nella hero', 'Use in hero')}
            </button>
            <button className="button secondary" type="button" onClick={() => downloadFile(result.videoFile)}>
              {copy(lang, 'Scarica video', 'Download video')}
            </button>
            <button className="button secondary" type="button" onClick={() => downloadFile(result.posterFile)}>
              {copy(lang, 'Scarica poster', 'Download poster')}
            </button>
          </div>
          <p className="small-note">{copy(
            lang,
            '“Usa nella hero” aggiorna le bozze di Sfondo hero e Poster sfondo hero. Premi “Salva tutto” per caricarle su Supabase.',
            '“Use in hero” updates the Hero background and Hero background poster drafts. Press “Save all” to upload them to Supabase.'
          )}</p>
        </div>
      )}
    </section>
  );
}
