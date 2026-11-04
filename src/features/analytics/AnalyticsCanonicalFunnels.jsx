import React from 'react';
import { normalizeSummary, formatPercentValue } from './contract.js';

function t(lang, it, en) { return lang === 'it' ? it : en; }
function Funnel({ title, rate, rows, helper }) {
  const max = Math.max(1, Number(rows[0]?.[1] || 0));
  return (
    <article className="analytics-canonical-funnel">
      <header><strong>{title}</strong>{rate !== undefined && <span>{formatPercentValue(rate)}</span>}</header>
      {rows.map(([label, value]) => {
        const count = Number(value || 0);
        return <div className="analytics-canonical-step" key={label}>
          <div><span>{label}</span><strong>{count}</strong></div>
          <i><b style={{ width: `${Math.max(count ? 3 : 0, Math.min(100, (count / max) * 100))}%` }} /></i>
        </div>;
      })}
      {helper && <p className="analytics-canonical-scope">{helper}</p>}
    </article>
  );
}

export default function AnalyticsCanonicalFunnels({ lang = 'en', payload = {} }) {
  const data = normalizeSummary(payload);
  const w = data.funnels.website;
  const f = data.funnels.fastRequest;
  const g = data.funnels.giftCard;
  const b = data.funnels.bookingCode;
  return (
    <section className="analytics-canonical-section">
      <div className="analytics-section-intro">
        <h2>{t(lang, 'Funnel canonici', 'Canonical funnels')}</h2>
        <p>{t(lang, 'Ogni percorso è calcolato separatamente dal contratto analytics server-side. Le attività WhatsApp, Gift Card e booking-code non possono gonfiare la conversione del modulo sito.', 'Each journey is calculated separately by the server-side analytics contract. WhatsApp, Gift Card, and booking-code activity cannot inflate website-form conversion.')}</p>
      </div>
      <div className="analytics-canonical-grid">
        <Funnel title={t(lang, 'Prenotazione sito', 'Website booking')} rate={data.rates.website_funnel_completion} helper={t(lang, 'Richieste compatibili dal contratto di tracking corrente.', 'Compatible requests since the current tracking contract.')} rows={[
          [t(lang, 'Aperture modulo', 'Form opens'), w.form_opens],
          [t(lang, 'Avvii modulo', 'Form starts'), w.form_starts],
          [t(lang, 'Tentativi invio', 'Submit attempts'), w.submit_attempts],
          [t(lang, 'Invii riusciti', 'Submit successes'), w.submit_successes],
          [t(lang, 'Richieste tracciate compatibili', 'Compatible tracked requests'), w.database_requests]
        ]} />
        <Funnel title="Fast Request / WhatsApp" helper={f.contract_version === '20261027-authoritative-website'
          ? t(lang, 'Le richieste salvate usano il nuovo contratto server. Lo storico precedente è misto; un’apertura WhatsApp non prova invio o prenotazione.', 'Saved requests use the new server contract. Earlier history is mixed; opening WhatsApp does not prove a sent message or booking.')
          : t(lang, 'Storico precedente: i vecchi completamenti possono includere passaggi a WhatsApp, non richieste salvate.', 'Legacy history: old completions may include WhatsApp handoffs, not saved requests.')} rows={[
          [t(lang, 'Avvii', 'Starts'), f.starts],
          [f.contract_version === '20261027-authoritative-website'
            ? t(lang, 'Richieste salvate (contratto corrente)', 'Saved requests (current contract)')
            : t(lang, 'Completamenti storici (misti)', 'Legacy completions (mixed)'), f.submit_successes],
          [t(lang, 'Aperture WhatsApp', 'WhatsApp handoffs'), f.whatsapp_outcomes]
        ]} />
        <Funnel title="Gift Card" helper={t(lang, 'Richieste compatibili dal contratto di tracking corrente.', 'Compatible requests since the current tracking contract.')} rows={[
          [t(lang, 'Viste', 'Views'), g.views],
          [t(lang, 'Questionari avviati', 'Questionnaire starts'), g.questionnaire_starts],
          [t(lang, 'Eventi richiesta creata', 'Request-created events'), g.request_created_events],
          [t(lang, 'Richieste tracciate compatibili', 'Compatible tracked requests'), g.database_requests]
        ]} />
        <Funnel title={t(lang, 'Codice prenotazione', 'Booking code')} rate={data.rates.booking_code_redeem_rate} helper={t(lang, 'Richieste compatibili dal contratto di tracking corrente.', 'Compatible requests since the current tracking contract.')} rows={[
          [t(lang, 'Tentativi riscatto', 'Redeem attempts'), b.redeem_attempts],
          [t(lang, 'Riscatti riusciti', 'Redeem successes'), b.redeem_successes],
          [t(lang, 'Richieste tracciate compatibili', 'Compatible tracked requests'), b.database_requests]
        ]} />
      </div>
    </section>
  );
}
