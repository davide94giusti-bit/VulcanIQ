import React, { useEffect, useRef, useState } from 'react';
import useBodyScrollLock from '../../hooks/useBodyScrollLock.js';
import { askNeo } from '../../services/neoService.js';
import { calculateEruptionDuration } from './neoEngine.js';
import './ask-neo.css';

const SUGGESTIONS = [
  'What needs attention today?', 'Booking requests', 'Upcoming experiences', 'Finance summary',
  'KPIs this month', 'Notification health', 'Marketing opportunities'
];

function Volcano({ state }) {
  return <div className={`neo-volcano neo-volcano-${state}`} role="img" aria-label={state === 'processing' ? 'Neo is analysing authorized vulcanIQ data' : state === 'error' ? 'Neo stopped after an error' : 'Neo is ready'}>
    <svg viewBox="0 0 180 130" aria-hidden="true" focusable="false">
      <path className="neo-volcano-ground" d="M8 119h164" />
      <path className="neo-volcano-mountain" d="M30 118 72 54h36l42 64Z" />
      <path className="neo-volcano-crater" d="M70 58q20 12 40 0" />
      <g className="neo-volcano-eruption"><circle cx="90" cy="42" r="7"/><circle cx="75" cy="26" r="5"/><circle cx="108" cy="20" r="6"/><path d="M90 52 72 17M94 50l19-38"/></g>
    </svg>
  </div>;
}

export default function AskNeoPanel({ navigate, profile }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erupting, setErupting] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const panelRef = useRef(null);
  useBodyScrollLock(open);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  useEffect(() => { if (open) window.setTimeout(() => panelRef.current?.querySelector('input')?.focus(), 0); }, [open]);

  function stopEruptionAfter(duration, startedAt) {
    window.clearTimeout(timerRef.current);
    const remaining = Math.max(500, duration - (Date.now() - startedAt));
    timerRef.current = window.setTimeout(() => setErupting(false), remaining);
  }

  async function submit(value = question) {
    const clean = String(value || '').trim().slice(0, 500);
    if (!clean || loading) return;
    const startedAt = Date.now();
    setQuestion(clean); setLoading(true); setError(''); setAnswer(null); setErupting(true);
    try {
      const result = await askNeo(clean);
      setAnswer(result);
      stopEruptionAfter(calculateEruptionDuration(clean, { domains: result.sourceTrail.length, cards: result.cards.length }), startedAt);
    } catch {
      window.clearTimeout(timerRef.current);
      setErupting(false);
      setError('Neo could not load the authorized data for this question. Try again or open the relevant Admin screen.');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    window.clearTimeout(timerRef.current);
    setQuestion(''); setAnswer(null); setLoading(false); setErupting(false); setError('');
    panelRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }

  function close() { setOpen(false); }
  const volcanoState = error ? 'error' : erupting ? 'processing' : 'idle';

  return <>
    <button className="neo-launcher" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Ask Neo"><span aria-hidden="true">▲</span> Ask Neo</button>
    {open && <div className="neo-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="neo-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="neoTitle">
        <header className="neo-panel-header"><div><span className="kicker">vulcanIQ Admin</span><h2 id="neoTitle">Ask Neo</h2><p>Your read-only operations co-pilot</p></div><div className="neo-header-actions">{(answer || question || error) && <button type="button" onClick={reset}>Reset</button>}<button type="button" onClick={close} aria-label="Close Ask Neo">Close</button></div></header>
        <Volcano state={volcanoState}/>
        {!answer && !loading && !error && <div className="neo-suggestions" aria-label="Try asking">{SUGGESTIONS.map((item) => <button type="button" key={item} onClick={() => submit(item)}>{item}</button>)}</div>}
        {loading && <p className="neo-processing" role="status">Analysing the relevant authorized vulcanIQ data…</p>}
        {error && <p className="admin-alert error" role="alert">{error}</p>}
        {answer && <div className="neo-answer" aria-live="polite"><header><span className={`neo-confidence neo-confidence-${answer.confidence}`}>{answer.confidence} confidence</span><h3>{answer.title}</h3><p>{answer.summary}</p></header><div className="neo-card-grid">{answer.cards.map((item, index) => <article className={`neo-card neo-card-${item.type}`} key={`${item.type}-${index}`}><span>{item.title}</span><strong>{item.value}</strong><p>{item.detail}</p>{item.route && <button type="button" onClick={() => { navigate(item.route); close(); }}>{`Open ${item.title}`}</button>}</article>)}</div>{answer.sourceTrail.length > 0 && <details><summary>Source trail</summary><ul>{answer.sourceTrail.map((item, index) => <li key={`${item.label}-${index}`}>{item.label}: {item.state}</li>)}</ul></details>}</div>}
        <form className="neo-composer" onSubmit={(event) => { event.preventDefault(); submit(); }}><label htmlFor="neoQuestion">Ask about bookings, Gift Cards, Finance, notifications, KPIs or marketing</label><div><input id="neoQuestion" value={question} maxLength={500} disabled={loading} onChange={(event) => setQuestion(event.target.value)} autoComplete="off"/><button className="button primary" type="submit" disabled={loading || !question.trim()}>Ask</button></div></form>
        <p className="neo-boundary">Neo reads only data available to {profile?.role || 'this Admin'} and never sends, schedules or changes records.</p>
      </section>
    </div>}
  </>;
}
