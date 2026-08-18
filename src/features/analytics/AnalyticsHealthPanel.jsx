import React from 'react';

function t(lang, it, en) { return lang === 'it' ? it : en; }
function dateTime(value, lang) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Rome'
  }).format(parsed);
}

export default function AnalyticsHealthPanel({ lang = 'en', meta = {}, lastRefreshed, onRefresh, onStartBaseline, onClearBaseline, canManageBaseline = false, onToggleBrowserExclusion, browserExcluded, busy = false }) {
  const baseline = meta.reporting_baseline_at;
  return (
    <section className="analytics-health-panel" aria-label={t(lang, 'Salute analytics', 'Analytics health')}>
      <div className="analytics-health-heading">
        <div>
          <span className={`analytics-health-dot ${meta.data_complete === false ? 'warning' : 'ok'}`} />
          <strong>{t(lang, 'Aggregazione server', 'Server-side aggregation')}</strong>
          <small>{meta.data_complete === false ? t(lang, 'Copertura parziale', 'Partial coverage') : t(lang, 'Copertura completa', 'Complete coverage')}</small>
        </div>
        <div className="analytics-health-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={onRefresh}>{t(lang, 'Aggiorna analytics', 'Refresh analytics')}</button>
          <button className="button secondary" type="button" disabled={busy} onClick={() => onToggleBrowserExclusion?.(!browserExcluded)}>{browserExcluded ? t(lang, 'Riattiva analytics su questo browser', 'Resume analytics on this browser') : t(lang, 'Escludi questo browser', 'Exclude this browser')}</button>
        </div>
      </div>
      <div className="analytics-health-grid">
        <div><span>{t(lang, 'Eventi nel periodo', 'Events in period')}</span><strong>{Number(meta.analytics_event_count || 0).toLocaleString()}</strong></div>
        <div><span>{t(lang, 'Sessioni nel periodo', 'Sessions in period')}</span><strong>{Number(meta.analytics_session_count || 0).toLocaleString()}</strong></div>
        <div><span>{t(lang, 'Ultimo evento', 'Last event')}</span><strong>{dateTime(meta.last_event_at, lang)}</strong></div>
        <div><span>{t(lang, 'Contratto tracking', 'Tracking contract')}</span><strong>{dateTime(meta.tracking_contract_started_at, lang)}</strong></div>
        <div><span>{t(lang, 'Baseline reporting', 'Reporting baseline')}</span><strong>{baseline ? dateTime(baseline, lang) : t(lang, 'Non impostata', 'Not set')}</strong></div>
        <div><span>{t(lang, 'Ultimo aggiornamento', 'Last refreshed')}</span><strong>{dateTime(lastRefreshed, lang)}</strong></div>
      </div>
      <div className="analytics-baseline-actions">
        {canManageBaseline && <button className="button secondary" type="button" disabled={busy} onClick={onStartBaseline}>{t(lang, 'Avvia nuova baseline', 'Start new analytics baseline')}</button>}
        {canManageBaseline && baseline && <button className="button secondary" type="button" disabled={busy} onClick={onClearBaseline}>{t(lang, 'Rimuovi baseline', 'Clear reporting baseline')}</button>}
        <small>{t(lang, 'La baseline cambia solo il reporting: non elimina eventi, sessioni o richieste.', 'The baseline only changes reporting; it never deletes events, sessions, or requests.')}</small>
      </div>
    </section>
  );
}
