import React from 'react';

function copy(lang, it, en) {
  return lang === 'it' ? it : en;
}

function MetricChip({ value, label, critical = false, muted = false }) {
  return (
    <span className={`admin-operational-chip${critical ? ' critical' : ''}${muted ? ' muted' : ''}`}>
      <strong>{Number(value || 0)}</strong>
      <small>{label}</small>
    </span>
  );
}

export default function OperationalSafeguardsBanner({
  lang,
  safeguards,
  isOwner,
  weeklyRecapState,
  onSendWeeklyRecapTest
}) {
  if (!safeguards) return null;

  const awaiting = Number(safeguards.notifications_not_sent || 0);
  const historical = Number(safeguards.notifications_historical_excluded || 0);
  const failed = Number(safeguards.failed_notifications || 0);
  const pending24 = Number(safeguards.pending_over_24h || 0);
  const upcoming = Number(safeguards.upcoming_unconfirmed_72h || 0);
  const failedReports = Number(safeguards.weekly_report_failures || 0);

  return (
    <section className="admin-operational-banner" aria-label={copy(lang, 'Avvisi operativi', 'Operational warnings')}>
      <div className="admin-operational-grid">
        <MetricChip value={safeguards.pending_requests} label={copy(lang, 'richieste pending', 'pending requests')} />
        <MetricChip value={safeguards.pending_over_12h} label={copy(lang, 'oltre 12h', 'over 12h')} />
        <MetricChip value={pending24} label={copy(lang, 'oltre 24h', 'over 24h')} critical={pending24 > 0} />
        <MetricChip value={failed} label={copy(lang, 'email fallite', 'failed emails')} critical={failed > 0} />
        <MetricChip value={awaiting} label={copy(lang, 'email in attesa', 'emails awaiting delivery')} critical={awaiting > 0} />
        <MetricChip value={safeguards.gift_cards_missing_code} label={copy(lang, 'Gift Card senza codice', 'Gift Cards missing code')} />
        <MetricChip value={upcoming} label={copy(lang, 'entro 72h da confermare', 'within 72h unconfirmed')} critical={upcoming > 0} />
        <MetricChip value={failedReports} label={copy(lang, 'report falliti', 'failed reports')} critical={failedReports > 0} />
        {historical > 0 && (
          <MetricChip
            value={historical}
            label={copy(lang, 'record storici esclusi', 'historical records excluded')}
            muted
          />
        )}
      </div>
      <div className="admin-operational-actions">
        {isOwner && (
          <button type="button" onClick={onSendWeeklyRecapTest} disabled={weeklyRecapState?.loading}>
            {weeklyRecapState?.loading ? copy(lang, 'Invio...', 'Sending...') : copy(lang, 'Test recap', 'Test recap')}
          </button>
        )}
        {weeklyRecapState?.message && <small>{weeklyRecapState.message}</small>}
      </div>
    </section>
  );
}
