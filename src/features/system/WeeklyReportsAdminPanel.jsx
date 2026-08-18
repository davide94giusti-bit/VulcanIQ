import React, { useEffect, useState } from 'react';
import { listWeeklyAdminReports, sendWeeklyAdminRecap } from '../../services/operationsService.js';

function copy(lang, it, en) {
  return lang === 'it' ? it : en;
}

function formatAdminDate(value, lang) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Rome'
  });
}

function reportStatusClass(status) {
  if (status === 'failed') return 'cancelled';
  if (status === 'sent' || status === 'test') return 'accepted';
  return 'pending';
}

export default function WeeklyReportsAdminPanel({ lang }) {
  const [state, setState] = useState({ loading: true, sending: false, error: '', message: '', reports: [] });

  async function refresh() {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const reports = await listWeeklyAdminReports(20);
      setState((current) => ({ ...current, loading: false, reports }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || copy(lang, 'Report non disponibili.', 'Reports are not available.') }));
    }
  }

  useEffect(() => { refresh(); }, [lang]);

  async function sendTest() {
    setState((current) => ({ ...current, sending: true, error: '', message: '' }));
    try {
      const result = await sendWeeklyAdminRecap({ testMode: true, force: true });
      setState((current) => ({ ...current, sending: false, message: copy(lang, `Report di test inviati: ${result.sent || 0}.`, `Test reports sent: ${result.sent || 0}.`) }));
      refresh();
    } catch (error) {
      setState((current) => ({ ...current, sending: false, error: error?.message || copy(lang, 'Invio report non riuscito.', 'Report send failed.') }));
    }
  }

  async function resendFailed(report) {
    setState((current) => ({ ...current, sending: true, error: '', message: '' }));
    try {
      const result = await sendWeeklyAdminRecap({ reportId: report.id });
      setState((current) => ({ ...current, sending: false, message: copy(lang, `Report reinviati: ${result.sent || 0}.`, `Reports resent: ${result.sent || 0}.`) }));
      refresh();
    } catch (error) {
      setState((current) => ({ ...current, sending: false, error: error?.message || copy(lang, 'Reinvio report non riuscito.', 'Report resend failed.') }));
    }
  }

  return (
    <section className="admin-panel backup-panel weekly-report-panel">
      <div className="admin-panel-header weekly-report-header">
        <div>
          <h2>{copy(lang, 'Recap settimanale', 'Weekly management recap')}</h2>
          <p>{copy(lang, 'Storico invii, errori e test del report operativo del lunedì.', 'Delivery history, errors, and tests for the Monday operational report.')}</p>
        </div>
        <div className="modal-actions weekly-report-actions">
          <button className="button secondary" type="button" onClick={refresh} disabled={state.loading}>{copy(lang, 'Aggiorna', 'Refresh')}</button>
          <button className="button primary" type="button" onClick={sendTest} disabled={state.sending}>{state.sending ? copy(lang, 'Invio...', 'Sending...') : copy(lang, 'Invia test', 'Send test')}</button>
        </div>
      </div>
      {state.message && <div className="admin-alert success" role="status">{state.message}</div>}
      {state.error && <div className="admin-alert error" role="alert">{state.error}</div>}
      {state.loading ? <p>{copy(lang, 'Caricamento...', 'Loading...')}</p> : state.reports.length ? (
        <div className="admin-table-wrap weekly-report-table-wrap">
          <table className="admin-table weekly-report-table">
            <thead><tr><th>{copy(lang, 'Periodo', 'Period')}</th><th>{copy(lang, 'Destinatario', 'Recipient')}</th><th>{copy(lang, 'Tipo', 'Type')}</th><th>{copy(lang, 'Stato', 'Status')}</th><th>{copy(lang, 'Inviato', 'Sent')}</th><th>{copy(lang, 'Errore', 'Error')}</th><th>{copy(lang, 'Azione', 'Action')}</th></tr></thead>
            <tbody>{state.reports.map((report) => (
              <tr key={report.id}>
                <td data-label={copy(lang, 'Periodo', 'Period')}>{formatAdminDate(report.period_start, lang)} – {formatAdminDate(report.period_end, lang)}</td>
                <td data-label={copy(lang, 'Destinatario', 'Recipient')}>{report.recipient}</td>
                <td data-label={copy(lang, 'Tipo', 'Type')} className="weekly-report-type">{report.report_type}</td>
                <td data-label={copy(lang, 'Stato', 'Status')}><span className={`status-pill ${reportStatusClass(report.status)}`}>{report.status}</span></td>
                <td data-label={copy(lang, 'Inviato', 'Sent')}>{report.sent_at ? new Date(report.sent_at).toLocaleString(lang === 'it' ? 'it-IT' : 'en-GB') : '-'}</td>
                <td data-label={copy(lang, 'Errore', 'Error')}>{report.error_message || '-'}</td>
                <td data-label={copy(lang, 'Azione', 'Action')}>{report.status === 'failed' ? <button className="button secondary" type="button" disabled={state.sending} onClick={() => resendFailed(report)}>{copy(lang, 'Reinvia', 'Resend')}</button> : '-'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p>{copy(lang, 'Nessun report registrato.', 'No reports recorded.')}</p>}
    </section>
  );
}
