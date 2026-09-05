import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useBodyScrollLock from '../../hooks/useBodyScrollLock.js';
import {
  completePublicNotificationOnboarding,
  deferPublicNotificationOnboarding,
  enableNotifications,
  publicNotificationOnboardingState
} from '../../services/notificationService.js';

function copy(lang, it, en) { return lang === 'it' ? it : en; }

export default function NotificationOnboarding({ lang, activePage, blocked = false }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);
  const enableRef = useRef(null);
  useBodyScrollLock(open);

  useEffect(() => {
    if (activePage !== 'home' || blocked || open) return undefined;
    let cancelled = false;
    let timeout = null;
    const consider = async () => {
      if (cancelled) return;
      if (document.body.classList.contains('modal-scroll-lock')) {
        timeout = window.setTimeout(consider, 1000);
        return;
      }
      const state = await publicNotificationOnboardingState();
      if (!cancelled && ['never_asked', 'permission_granted'].includes(state)) setOpen(true);
    };
    timeout = window.setTimeout(consider, 1400);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [activePage, blocked, open]);

  useEffect(() => {
    if (!open) return undefined;
    const prior = document.activeElement;
    window.setTimeout(() => enableRef.current?.focus(), 0);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        deferPublicNotificationOnboarding();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const buttons = [...dialogRef.current.querySelectorAll('button:not(:disabled)')];
      if (!buttons.length) return;
      const first = buttons[0]; const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); prior?.focus?.(); };
  }, [open]);

  function dismiss() {
    deferPublicNotificationOnboarding();
    setOpen(false);
  }

  async function enable() {
    setBusy(true); setError('');
    try {
      await enableNotifications({ variant: 'public', currentLanguage: lang });
      completePublicNotificationOnboarding();
      setOpen(false);
    } catch (err) {
      if (err.code === 'notification_permission_not_granted') {
        deferPublicNotificationOnboarding();
        setOpen(false);
      } else {
        setError(err.code === 'notification_permission_denied'
          ? copy(lang, 'Le notifiche sono bloccate nelle impostazioni del dispositivo. Puoi gestirle da Le mie notifiche.', 'Notifications are blocked in device settings. You can manage them from My notifications.')
          : copy(lang, 'Non è stato possibile attivare le notifiche. Riprova da Le mie notifiche.', 'Notifications could not be enabled. Try again from My notifications.'));
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="notification-onboarding-backdrop motion-backdrop" role="presentation" onClick={dismiss}>
      <section ref={dialogRef} className="notification-onboarding-dialog motion-panel" role="dialog" aria-modal="true" aria-labelledby="notificationOnboardingTitle" aria-describedby="notificationOnboardingDescription" onClick={(event) => event.stopPropagation()}>
        <span className="kicker">vulcanIQ</span>
        <h2 id="notificationOnboardingTitle">{copy(lang, 'Vuoi restare aggiornato?', 'Stay updated?')}</h2>
        <p id="notificationOnboardingDescription">{copy(lang, 'Vuoi ricevere le notifiche vulcanIQ su questo dispositivo?', 'Would you like to receive vulcanIQ notifications on this device?')}</p>
        {error && <p className="notification-error" role="alert">{error}</p>}
        <div className="notification-onboarding-actions">
          <button ref={enableRef} className="button primary" type="button" disabled={busy} onClick={enable}>{copy(lang, 'Attiva notifiche', 'Enable notifications')}</button>
          <button className="button secondary" type="button" disabled={busy} onClick={dismiss}>{copy(lang, 'Non ora', 'Not now')}</button>
        </div>
      </section>
    </div>,
    document.body
  );
}
