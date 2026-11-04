import React, { useEffect, useId, useRef, useState } from 'react';
import { loadPublicChallenge, mountPublicChallenge } from './publicChallenge.js';

export const PUBLIC_CHALLENGE_ENABLED = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);

export function usePublicChallenge(language) {
  const [token, setToken] = useState('');
  const currentToken = useRef(token);
  const [resetKey, setResetKey] = useState(0);
  const updateToken = (value) => { currentToken.current = value; setToken(value); };
  // Provider callbacks can expire a token before React commits the disabled
  // button. Existing submit closures must observe that revocation immediately.
  return { get token() { return currentToken.current; },
    get ready() { return !PUBLIC_CHALLENGE_ENABLED || Boolean(currentToken.current); },
    reset: () => { updateToken(''); setResetKey(value => value + 1); },
    element: <PublicChallenge language={language} onTokenChange={updateToken} resetKey={resetKey} /> };
}

export default function PublicChallenge({ language = 'it', onTokenChange, onStatusChange, resetKey = 0,
  siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY, action = 'public_submission' }) {
  const container = useRef(null);
  const callbacks = useRef({ onTokenChange, onStatusChange });
  callbacks.current = { onTokenChange, onStatusChange };
  const [status, setStatus] = useState('loading');
  const [retry, setRetry] = useState(0);
  const labelId = useId();
  const it = language === 'it';
  useEffect(() => {
    let alive = true;
    let remove = () => {};
    const update = (token, next) => {
      if (!alive) return;
      setStatus(next);
      callbacks.current.onTokenChange?.(token);
      callbacks.current.onStatusChange?.(next);
    };
    update('', siteKey ? 'loading' : 'disabled');
    if (siteKey) loadPublicChallenge().then((api) => {
      if (!alive || !container.current) return;
      update('', 'pending');
      remove = mountPublicChallenge(api, container.current, { siteKey, language, action, onChange: update });
    }).catch(() => update('', 'error'));
    return () => {
      alive = false;
      try { remove(); } catch { /* Widget may already have been removed by navigation. */ }
      callbacks.current.onTokenChange?.('');
    };
  }, [siteKey, language, action, resetKey, retry]);
  if (!siteKey) return null;
  const retryable = status === 'error' || status === 'expired';
  const messages = it ? {
    loading: 'Caricamento verifica di sicurezza…', pending: 'Completa la verifica di sicurezza.',
    complete: 'Verifica completata.', expired: 'Verifica scaduta. Riprova prima di inviare.',
    error: 'Verifica non disponibile. Controlla la connessione e riprova.'
  } : {
    loading: 'Loading security check…', pending: 'Complete the security check.',
    complete: 'Check complete.', expired: 'Check expired. Retry before submitting.',
    error: 'Check unavailable. Check your connection and retry.'
  };
  return <section className="public-challenge" aria-labelledby={labelId} style={{ width: '100%', marginBlock: '1rem' }}>
    <p id={labelId}>{it ? 'Verifica di sicurezza' : 'Security check'}</p>
    <div ref={container} style={{ minHeight: 140 }} />
    <p role="status" aria-live="polite">{messages[status] || ''}</p>
    {retryable && <button type="button" className="button secondary" onClick={() => setRetry((value) => value + 1)}>
      {it ? 'Riprova verifica' : 'Retry security check'}
    </button>}
  </section>;
}
