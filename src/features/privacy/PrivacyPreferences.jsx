import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useBodyScrollLock from '../../hooks/useBodyScrollLock.js';

function copy(lang, it, en) { return lang === 'it' ? it : en; }

export default function PrivacyPreferences({ lang, open, current, onSave, onClose }) {
  const [customizing, setCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(current?.analytics === true);
  const firstButtonRef = useRef(null);
  const analyticsCheckboxRef = useRef(null);
  const dialogRef = useRef(null);
  const requiredChoice = typeof current?.analytics !== 'boolean';
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;
    setCustomizing(false);
    setAnalytics(current?.analytics === true);
    const prior = document.activeElement;
    window.setTimeout(() => firstButtonRef.current?.focus(), 0);
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !requiredChoice) onClose?.();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); prior?.focus?.(); };
  }, [open, requiredChoice]);

  useEffect(() => {
    if (!open || !customizing) return undefined;
    const timeout = window.setTimeout(() => analyticsCheckboxRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, [customizing, open]);

  if (!open || typeof document === 'undefined') return null;
  const save = (value) => onSave?.({ analytics: value });

  return createPortal(
    <div className="privacy-preferences-backdrop motion-backdrop" role="presentation" onClick={() => { if (!requiredChoice) onClose?.(); }}>
      <section ref={dialogRef} className="privacy-preferences-dialog motion-panel" role="dialog" aria-modal="true" aria-labelledby="privacyPreferencesTitle" aria-describedby="privacyPreferencesDescription" onClick={(event) => event.stopPropagation()}>
        <div>
          <span className="kicker">{copy(lang, 'Le tue scelte', 'Your choices')}</span>
          <h2 id="privacyPreferencesTitle">{copy(lang, 'Privacy e analytics', 'Privacy and analytics')}</h2>
          <p id="privacyPreferencesDescription">{copy(lang, 'Usiamo le tecnologie necessarie per il funzionamento del sito. Le metriche analytics facoltative partono solo se scegli di accettarle.', 'We use technologies needed for the website to work. Optional analytics metrics start only if you choose to accept them.')}</p>
        </div>
        {customizing ? (
          <div className="privacy-preferences-options">
            <label><input type="checkbox" checked disabled/><span><strong>{copy(lang, 'Necessarie', 'Necessary')}</strong><small>{copy(lang, 'Lingua, sicurezza, moduli, PWA e notifiche richieste.', 'Language, security, forms, PWA and requested notifications.')}</small></span></label>
            <label><input ref={analyticsCheckboxRef} type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)}/><span><strong>Analytics</strong><small>{copy(lang, 'Metriche di utilizzo pseudonime e Cloudflare Web Analytics. Facoltative.', 'Pseudonymous usage metrics and Cloudflare Web Analytics. Optional.')}</small></span></label>
            <div className="privacy-preferences-actions">
              <button ref={firstButtonRef} className="button secondary" type="button" onClick={() => save(false)}>{copy(lang, 'Rifiuta analytics', 'Reject analytics')}</button>
              <button className="button primary" type="button" onClick={() => save(analytics)}>{copy(lang, 'Salva scelte', 'Save choices')}</button>
            </div>
          </div>
        ) : (
          <div className="privacy-preferences-actions">
            <button ref={firstButtonRef} className="button secondary" type="button" onClick={() => save(false)}>{copy(lang, 'Rifiuta', 'Reject')}</button>
            <button className="button secondary" type="button" onClick={() => setCustomizing(true)}>{copy(lang, 'Personalizza', 'Customize')}</button>
            <button className="button secondary" type="button" onClick={() => save(true)}>{copy(lang, 'Accetta analytics', 'Accept analytics')}</button>
          </div>
        )}
        <p className="small-note">{copy(lang, 'Puoi cambiare questa scelta in qualsiasi momento dal piè di pagina. Installazione, notifiche e richieste non dipendono dagli analytics.', 'You can change this choice at any time from the footer. Installation, notifications and requests do not depend on analytics.')}</p>
        {!requiredChoice && <button className="privacy-preferences-close" type="button" onClick={onClose}>{copy(lang, 'Chiudi', 'Close')}</button>}
      </section>
    </div>,
    document.body
  );
}
