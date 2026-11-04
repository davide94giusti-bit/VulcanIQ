import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useDialogFocusTrap from '../../hooks/useDialogFocusTrap.js';
import useBodyScrollLock from '../../hooks/useBodyScrollLock.js';
import { readPrivacyPreferences, writePrivacyPreferences } from '../../services/privacyPreferences.js';

export default function PrivacyPreferences({ lang }) {
  const [current, setCurrent] = useState(readPrivacyPreferences);
  const [open, setOpen] = useState(() => current.analytics === null);
  const panel = useRef(null);
  useBodyScrollLock(open);
  useDialogFocusTrap(open, panel, () => setOpen(false));
  const copy = (it, en) => lang === 'it' ? it : en;
  function save(analytics) { setCurrent(writePrivacyPreferences({ analytics })); setOpen(false); }
  return <>
    <div className="privacy-settings-link"><button type="button" className="button secondary" onClick={() => setOpen(true)}>{copy('Preferenze privacy', 'Privacy preferences')}</button></div>
    {open && createPortal(<div className="privacy-preferences-backdrop">
      <section className="privacy-preferences-dialog" ref={panel} tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="privacyPreferencesTitle">
        <h2 id="privacyPreferencesTitle">{copy('Privacy e analytics', 'Privacy and analytics')}</h2>
        <p>{copy('Gli analytics facoltativi sono pseudonimi e possono essere collegati alle richieste. Partono solo con il tuo consenso. Puoi rifiutare e continuare a usare tutte le funzioni.', 'Optional analytics are pseudonymous and may be linked to requests. They start only with your consent. You can decline and continue using all features.')}</p>
        <div className="privacy-preferences-actions">
          <button className="button secondary" onClick={() => save(false)}>{copy('Rifiuta analytics', 'Reject analytics')}</button>
          <button className="button primary" onClick={() => save(true)}>{copy('Accetta analytics', 'Accept analytics')}</button>
          <button className="button secondary" onClick={() => setOpen(false)}>{copy('Chiudi', 'Close')}</button>
        </div>
      </section>
    </div>, document.body)}
  </>;
}
