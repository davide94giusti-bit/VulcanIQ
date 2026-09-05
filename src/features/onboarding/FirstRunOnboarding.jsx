import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useBodyScrollLock from '../../hooks/useBodyScrollLock.js';
import { completeFirstRunOnboarding, firstRunStep, readFirstRunCompletion } from '../../services/firstRunOnboarding.js';
import { hasExplicitPublicLanguage, suggestedPublicLanguage } from '../../services/languagePreference.js';
import {
  completePublicNotificationOnboarding,
  deferPublicNotificationOnboarding,
  enableNotifications,
  installState,
  promptInstall,
  publicNotificationOnboardingState,
  readPublicNotificationOnboarding
} from '../../services/notificationService.js';

function c(lang, it, en) { return lang === 'it' ? it : en; }

function notificationDue(now = Date.now()) {
  const choice = readPublicNotificationOnboarding();
  return choice.status !== 'not_now' || choice.nextPromptAt <= Number(now);
}

export default function FirstRunOnboarding({ lang, eligible = true, blocked = false, privacyPreferences, onLanguage, onPrivacy }) {
  const [step, setStep] = useState('');
  const [languageChoice, setLanguageChoice] = useState(() => lang || suggestedPublicLanguage());
  const [customizing, setCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [platform, setPlatform] = useState(() => installState());
  const [notificationRequired, setNotificationRequired] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);
  const firstActionRef = useRef(null);
  useBodyScrollLock(Boolean(step));

  useEffect(() => {
    if (!eligible || blocked || step) return undefined;
    let cancelled = false;
    let timeout;
    async function resolve() {
      const languageExplicit = hasExplicitPublicLanguage();
      const privacyResolved = typeof privacyPreferences?.analytics === 'boolean';
      const notificationState = await publicNotificationOnboardingState();
      const due = notificationDue() && !['subscription_active', 'permission_denied'].includes(notificationState);
      setNotificationRequired(due);
      const next = firstRunStep({ languageExplicit, privacyResolved, notificationDue: due });
      if (cancelled) return;
      if (!next) {
        if (!readFirstRunCompletion()) completeFirstRunOnboarding();
        return;
      }
      const returningNotificationPrompt = readFirstRunCompletion() && next === 'notifications';
      timeout = window.setTimeout(() => { if (!cancelled) setStep(next); }, returningNotificationPrompt ? 1400 : 0);
    }
    resolve();
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [blocked, eligible, privacyPreferences?.analytics, step]);

  useEffect(() => {
    if (!step) return undefined;
    const prior = document.activeElement;
    const focusTimer = window.setTimeout(() => firstActionRef.current?.focus(), 0);
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && step === 'notifications') {
        deferPublicNotificationOnboarding();
        completeFirstRunOnboarding();
        setStep('');
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { window.clearTimeout(focusTimer); document.removeEventListener('keydown', onKeyDown); prior?.focus?.(); };
  }, [step, customizing]);

  useEffect(() => {
    const sync = () => setPlatform(installState());
    window.addEventListener('vulcaniq-install-state-changed', sync);
    return () => window.removeEventListener('vulcaniq-install-state-changed', sync);
  }, []);

  function chooseLanguage(value) {
    setLanguageChoice(value);
    onLanguage(value);
    if (typeof privacyPreferences?.analytics !== 'boolean') setStep('privacy');
    else if (notificationRequired) setStep('notifications');
    else { completeFirstRunOnboarding(); setStep(''); }
  }

  function choosePrivacy(value) {
    onPrivacy({ analytics: value });
    setCustomizing(false);
    if (notificationRequired) setStep('notifications');
    else { completeFirstRunOnboarding(); setStep(''); }
  }

  function finishNotifications() {
    deferPublicNotificationOnboarding();
    completeFirstRunOnboarding();
    setStep('');
  }

  async function enable() {
    setBusy(true); setError('');
    try {
      await enableNotifications({ variant: 'public', currentLanguage: lang });
      completePublicNotificationOnboarding();
      completeFirstRunOnboarding();
      setStep('');
    } catch (err) {
      if (['notification_permission_not_granted', 'notification_permission_denied'].includes(err.code)) finishNotifications();
      else setError(c(lang, 'Non è stato possibile attivare le notifiche. Puoi riprovare da Le mie notifiche.', 'Notifications could not be enabled. You can retry from My notifications.'));
    } finally { setBusy(false); }
  }

  async function install() {
    setBusy(true); setError('');
    try {
      await promptInstall();
      const next = installState();
      setPlatform(next);
      if (next !== 'already_installed') finishNotifications();
    } catch {
      setError(c(lang, 'Installazione non completata. Puoi continuare senza notifiche.', 'Installation was not completed. You can continue without notifications.'));
    } finally { setBusy(false); }
  }

  if (!step || typeof document === 'undefined') return null;
  const installed = platform === 'already_installed';
  return createPortal(
    <div className="first-run-onboarding-backdrop motion-backdrop" role="presentation" onClick={() => { if (step === 'notifications') finishNotifications(); }}>
      <section ref={dialogRef} className="first-run-onboarding-dialog motion-panel" role="dialog" aria-modal="true" aria-labelledby="firstRunTitle" aria-describedby="firstRunDescription" onClick={(event) => event.stopPropagation()}>
        <div className="first-run-progress" aria-label={c(lang, 'Avanzamento configurazione', 'Setup progress')}><span className={step === 'language' ? 'active' : ''}>1</span><span className={step === 'privacy' ? 'active' : ''}>2</span><span className={step === 'notifications' ? 'active' : ''}>3</span></div>
        {step === 'language' && <>
          <span className="kicker">vulcanIQ</span>
          <h2 id="firstRunTitle">Choose your language<br/><span lang="it">Scegli la lingua</span></h2>
          <p id="firstRunDescription">Your device language is the initial recommendation. You can change this later.</p>
          <div className="first-run-language-actions" role="group" aria-label="Language / Lingua">
            <button ref={firstActionRef} className={`button ${languageChoice === 'it' ? 'primary' : 'secondary'}`} type="button" lang="it" aria-pressed={languageChoice === 'it'} onClick={() => chooseLanguage('it')}>Italiano</button>
            <button className={`button ${languageChoice === 'en' ? 'primary' : 'secondary'}`} type="button" lang="en" aria-pressed={languageChoice === 'en'} onClick={() => chooseLanguage('en')}>English</button>
          </div>
        </>}
        {step === 'privacy' && <>
          <span className="kicker">{c(lang, 'Le tue scelte', 'Your choices')}</span>
          <h2 id="firstRunTitle">{c(lang, 'Privacy e analytics', 'Privacy & analytics')}</h2>
          <p id="firstRunDescription">{c(lang, 'Usiamo le tecnologie necessarie per il funzionamento del sito. Le metriche analytics facoltative partono solo se scegli di accettarle.', 'We use the technologies necessary for the site to work. Optional analytics metrics are enabled only if you choose to accept them.')}</p>
          {customizing ? <div className="privacy-preferences-options">
            <label><input type="checkbox" checked disabled/><span><strong>{c(lang, 'Necessarie', 'Necessary')}</strong><small>{c(lang, 'Lingua, sicurezza, moduli, PWA e notifiche richieste.', 'Language, security, forms, PWA and requested notifications.')}</small></span></label>
            <label><input ref={firstActionRef} type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)}/><span><strong>Analytics</strong><small>{c(lang, 'Facoltative e disattivate per impostazione iniziale.', 'Optional and initially off.')}</small></span></label>
            <div className="first-run-actions"><button className="button secondary" type="button" onClick={() => choosePrivacy(false)}>{c(lang, 'Rifiuta analytics', 'Reject analytics')}</button><button className="button primary" type="button" onClick={() => choosePrivacy(analytics)}>{c(lang, 'Salva scelte', 'Save choices')}</button></div>
          </div> : <div className="first-run-actions">
            <button ref={firstActionRef} className="button secondary" type="button" onClick={() => choosePrivacy(false)}>{c(lang, 'Rifiuta', 'Reject')}</button>
            <button className="button secondary" type="button" onClick={() => { setAnalytics(false); setCustomizing(true); }}>{c(lang, 'Personalizza', 'Customize')}</button>
            <button className="button primary" type="button" onClick={() => choosePrivacy(true)}>{c(lang, 'Accetta analytics', 'Accept analytics')}</button>
          </div>}
          <p className="small-note">{c(lang, 'Installazione, notifiche e richieste restano disponibili anche rifiutando gli analytics.', 'Installation, notifications and requests remain available when analytics is rejected.')}</p>
        </>}
        {step === 'notifications' && <>
          <span className="kicker">vulcanIQ</span>
          <h2 id="firstRunTitle">{installed ? c(lang, 'Vuoi restare aggiornato?', 'Stay updated?') : c(lang, 'Installa vulcanIQ', 'Install vulcanIQ')}</h2>
          <div id="firstRunDescription">
            {installed && <p>{c(lang, 'Vuoi ricevere le notifiche vulcanIQ su questo dispositivo?', 'Would you like to receive vulcanIQ notifications on this device?')}</p>}
            {platform === 'needs_ios_home_screen' && <><p>{c(lang, 'Installa vulcanIQ per abilitare le notifiche su questo dispositivo.', 'Install vulcanIQ to enable notifications on this device.')}</p><ol><li>{c(lang, 'Apri questa pagina in Safari.', 'Open this page in Safari.')}</li><li>{c(lang, 'Tocca Condividi, poi Aggiungi alla schermata Home.', 'Tap Share, then Add to Home Screen.')}</li><li>{c(lang, 'Apri vulcanIQ dalla schermata Home.', 'Open vulcanIQ from the Home Screen.')}</li></ol></>}
            {platform === 'install_available' && <p>{c(lang, 'Installa l’app per un accesso rapido e per configurare le notifiche dopo l’apertura.', 'Install the app for quick access and to configure notifications after opening it.')}</p>}
            {['unsupported', 'install_dismissed'].includes(platform) && <p>{c(lang, 'Il browser non offre ora l’installazione. Puoi continuare e configurare le notifiche in seguito.', 'The browser is not offering installation now. You can continue and configure notifications later.')}</p>}
          </div>
          {error && <p className="notification-error" role="alert">{error}</p>}
          <div className="first-run-actions">
            {installed && <button ref={firstActionRef} className="button primary" type="button" disabled={busy} onClick={enable}>{c(lang, 'Attiva notifiche', 'Enable notifications')}</button>}
            {platform === 'install_available' && <button ref={firstActionRef} className="button primary" type="button" disabled={busy} onClick={install}>{c(lang, 'Installa app', 'Install app')}</button>}
            {platform === 'needs_ios_home_screen' && <button ref={firstActionRef} className="button primary" type="button" disabled={busy} onClick={finishNotifications}>{c(lang, 'Ho capito', 'Got it')}</button>}
            <button ref={!installed && !['install_available', 'needs_ios_home_screen'].includes(platform) ? firstActionRef : undefined} className="button secondary" type="button" disabled={busy} onClick={finishNotifications}>{installed ? c(lang, 'Non ora', 'Not now') : c(lang, 'Continua senza notifiche', 'Continue without notifications')}</button>
          </div>
        </>}
      </section>
    </div>,
    document.body
  );
}
