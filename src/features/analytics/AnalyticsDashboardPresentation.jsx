import React from 'react';

const t = (lang, it, en) => lang === 'it' ? it : en;
const percent = (value, total) => `${Math.round((Number(value || 0) / Math.max(1, Number(total || 0))) * 100)}%`;

export function AnalyticsRowList({ rows, total, empty, helperLabel }) {
  if (!rows.length || rows.every((row) => !row.count)) return <p className="small-note analytics-empty-row">{empty}</p>;
  const max = Math.max(...rows.map((row) => Number(row.count || 0)), 1);
  return (
    <div className="analytics-row-list">
      {rows.map((row) => (
        <div className="analytics-row" key={row.label}>
          <span>{row.label}{row.helper !== undefined && <small>{helperLabel}: {row.helper}</small>}</span>
          <strong>{row.count}</strong>
          <em>{percent(row.count, total)}</em>
          <i><b style={{ width: `${Math.max(3, (Number(row.count || 0) / max) * 100)}%` }} /></i>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsWarningList({ warnings = [], lang = 'it', onOpenDetails }) {
  if (!warnings.length) return null;
  const normalized = warnings.map((warning) => (typeof warning === 'string' ? { type: 'diagnostic', message: warning, helper: '' } : warning));
  const groups = [
    ['critical', t(lang, 'Problemi critici di tracciamento', 'Critical tracking issues')],
    ['warning', t(lang, 'Avvisi da verificare', 'Warnings to review')],
    ['historical', t(lang, 'Diagnostica storica', 'Historical diagnostics')],
    ['diagnostic', t(lang, 'Note diagnostiche', 'Diagnostic notes')],
    ['attribution', t(lang, 'Note attribuzione', 'Attribution notes')],
    ['ux', t(lang, 'Note test UX', 'UX testing notes')]
  ];
  return (
    <div className="analytics-warning-list grouped" role="status">
      {groups.map(([type, fallbackTitle]) => {
        const items = normalized.filter((warning) => warning.type === type);
        if (!items.length) return null;
        return <section className={`analytics-warning-group ${type}`} key={type}>
          <h3>{fallbackTitle}</h3>
          {items.map((warning, index) => <p key={`${type}-${index}`}><span>{warning.message}</span>{warning.helper && <small>{warning.helper}</small>}</p>)}
        </section>;
      })}
      {onOpenDetails && <div className="analytics-warning-actions"><button className="button secondary analytics-details-button" type="button" onClick={onOpenDetails}>{t(lang, 'Dettagli analytics', 'Analytics details')}</button></div>}
    </div>
  );
}

export function AnalyticsHelperNote({ children }) {
  if (!children) return null;
  return <p className="small-note analytics-helper-note">{children}</p>;
}

export function AnalyticsTable({ columns = [], rows = [], empty }) {
  if (!rows.length) return <p className="small-note analytics-empty-row">{empty}</p>;
  return (
    <div className="analytics-table-scroll" role="region" tabIndex="0">
      <table className="analytics-drilldown-table">
        <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => (
          <tr key={row.id || row.path || row.experience || row.step || `${index}-${columns.map((column) => row[column.key]).join('-')}`}>
            {columns.map((column) => <td key={column.key}>{row[column.key] ?? '—'}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function AnalyticsPanel({ title, children }) {
  return <details className="admin-panel analytics-panel analytics-collapsible-panel"><summary className="analytics-collapsible-summary"><h2>{title}</h2></summary><div className="analytics-collapsible-body">{children}</div></details>;
}

export function AnalyticsStaticPanel({ title, children }) {
  return <section className="admin-panel analytics-panel analytics-static-panel"><header className="analytics-static-header"><h2>{title}</h2></header><div className="analytics-static-body">{children}</div></section>;
}

export function AnalyticsSubsection({ title, children }) {
  return <section className="analytics-subsection"><h3>{title}</h3><div className="analytics-subsection-body">{children}</div></section>;
}
