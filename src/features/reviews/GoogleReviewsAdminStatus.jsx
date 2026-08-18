import React, { useEffect, useState } from 'react';
import { getGoogleReviewsSyncStatus, refreshGoogleReviewsNow } from '../../services/googleReviewsService.js';

function formatWhen(value, lang) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function GoogleReviewsAdminStatus({ lang = 'it' }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const it = lang !== 'en';

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      setStatus(await getGoogleReviewsSyncStatus());
    } catch (err) {
      setError(err?.message || (it ? 'Stato Google Reviews non disponibile.' : 'Google Reviews status unavailable.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function syncNow() {
    setSyncing(true);
    setError('');
    try {
      await refreshGoogleReviewsNow();
      await refresh();
    } catch (err) {
      const raw = String(err?.message || '');
      setError(raw.includes('not_configured') || raw.includes('503')
        ? (it ? 'Integrazione non ancora autorizzata/configurata. Segui GOOGLE_REVIEWS_SETUP.md.' : 'Integration is not authorized/configured yet. Follow GOOGLE_REVIEWS_SETUP.md.')
        : (it ? 'Sincronizzazione Google Reviews non riuscita.' : 'Google Reviews sync failed.'));
    } finally {
      setSyncing(false);
    }
  }

  const state = status?.status || 'not_configured';
  const stateLabel = state === 'connected'
    ? (it ? 'Connesso' : 'Connected')
    : state === 'error'
      ? (it ? 'Errore di sincronizzazione' : 'Sync error')
      : (it ? 'In attesa autorizzazione Google' : 'Awaiting Google authorization');

  return (
    <section className="google-reviews-admin-status" aria-labelledby="googleReviewsAdminTitle">
      <div className="admin-panel-header">
        <div>
          <span className="kicker">Google Business Profile</span>
          <h3 id="googleReviewsAdminTitle">Google Reviews</h3>
        </div>
        <button className="button secondary" type="button" onClick={syncNow} disabled={syncing || loading}>{syncing ? (it ? 'Sincronizzazione...' : 'Syncing...') : (it ? 'Aggiorna ora' : 'Refresh now')}</button>
      </div>
      {loading ? <p className="small-note">{it ? 'Caricamento stato...' : 'Loading status...'}</p> : (
        <dl className="google-reviews-status-grid">
          <div><dt>{it ? 'Stato' : 'Status'}</dt><dd>{stateLabel}</dd></div>
          <div><dt>{it ? 'Ultimo aggiornamento' : 'Last successful refresh'}</dt><dd>{formatWhen(status?.last_success_at, lang)}</dd></div>
          <div><dt>{it ? 'Posizione' : 'Location'}</dt><dd>{status?.location_resource_name ? (it ? 'Configurata' : 'Configured') : '—'}</dd></div>
          <div><dt>{it ? 'Ultimo errore' : 'Last error'}</dt><dd>{status?.last_error_code || '—'}</dd></div>
        </dl>
      )}
      {error && <div className="admin-alert warning" role="status">{error}</div>}
      <p className="small-note">{it ? 'Le recensioni Google vengono mantenute in una cache temporanea separata dalle recensioni proprietarie vulcanIQ. Le credenziali OAuth restano solo lato server.' : 'Google reviews are kept in a temporary provider cache separate from first-party vulcanIQ reviews. OAuth credentials remain server-side only.'}</p>
    </section>
  );
}
