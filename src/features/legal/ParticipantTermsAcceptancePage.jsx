import React, { useEffect, useRef, useState } from 'react';
import { TermsDocumentModal } from './TermsAcceptanceControl.jsx';
import {
  confirmParticipantTermsAcceptance,
  consumeParticipantTermsToken,
  resolveParticipantTermsInvitation
} from '../../services/participantTermsAcceptance.js';
import './participantTermsAcceptance.css';

function copy(lang, it, en) { return lang === 'it' ? it : en; }
function localizedDate(value, lang) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-GB') : '';
}

function acceptanceContext(result) {
  const invitation = result?.invitation || result?.item || {};
  const terms = result?.terms || invitation.terms || null;
  return {
    participantName: String(invitation.participantName || invitation.participant_name || result?.participantName || ''),
    actorName: String(invitation.actorName || invitation.actor_name || result?.actorName || ''),
    representation: String(invitation.representationType || invitation.representation_type || result?.representationType || 'self'),
    experienceName: String(result?.experience?.name || result?.experienceName || ''),
    experienceDate: String(result?.experience?.date || result?.experienceDate || ''),
    terms
  };
}

export default function ParticipantTermsAcceptancePage({ lang = 'it' }) {
  const [token] = useState(() => consumeParticipantTermsToken());
  const [state, setState] = useState(token ? 'loading' : 'unavailable');
  const [context, setContext] = useState(null);
  const [checked, setChecked] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [error, setError] = useState('');
  const checkboxRef = useRef(null);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    resolveParticipantTermsInvitation(token)
      .then((result) => {
        if (cancelled) return;
        const next = acceptanceContext(result);
        if (!next.participantName || !next.terms?.version || !next.terms?.locale || !next.terms?.content) throw new Error('terms_acceptance_unavailable');
        setContext(next);
        setState('ready');
      })
      .catch(() => { if (!cancelled) setState('unavailable'); });
    return () => { cancelled = true; };
  }, [token]);

  const effectiveLang = context?.terms?.locale === 'en' ? 'en' : context?.terms?.locale === 'it' ? 'it' : lang === 'en' ? 'en' : 'it';

  async function confirm(event) {
    event.preventDefault();
    if (!checked) {
      setError(copy(effectiveLang, 'Devi accettare i Termini per continuare.', 'You must accept the Terms to continue.'));
      checkboxRef.current?.focus();
      return;
    }
    setState('submitting');
    setError('');
    try {
      await confirmParticipantTermsAcceptance(token);
      setState('accepted');
    } catch {
      setState('unavailable');
    }
  }

  if (state === 'loading') return <section className="participant-terms-page" aria-labelledby="participantTermsTitle"><div className="participant-terms-card"><span className="kicker">vulcanIQ</span><h1 id="participantTermsTitle">{copy(lang, 'Accettazione dei Termini', 'Terms acceptance')}</h1><p role="status">{copy(lang, 'Verifica del collegamento sicuro…', 'Checking the secure link…')}</p></div></section>;

  if (state === 'unavailable') return <section className="participant-terms-page" aria-labelledby="participantTermsTitle"><div className="participant-terms-card"><span className="kicker">vulcanIQ</span><h1 id="participantTermsTitle">{copy(lang, 'Collegamento non disponibile', 'Link unavailable')}</h1><p role="alert">{copy(lang, 'Questo collegamento non è disponibile. Chiedi all’organizzatore di crearne uno nuovo.', 'This link is unavailable. Ask the organizer to create a new one.')}</p><a className="button secondary" href={`/privacy-policy${lang === 'en' ? '?lang=en' : ''}`}>{copy(lang, 'Informativa Privacy', 'Privacy Notice')}</a></div></section>;

  if (state === 'accepted') return <section className="participant-terms-page" aria-labelledby="participantTermsTitle"><div className="participant-terms-card participant-terms-success"><span className="kicker">vulcanIQ</span><h1 id="participantTermsTitle">{copy(effectiveLang, 'Accettazione registrata', 'Acceptance recorded')}</h1><p role="status">{copy(effectiveLang, 'Grazie. La tua accettazione è stata registrata per la versione mostrata.', 'Thank you. Your acceptance was recorded for the version shown.')}</p></div></section>;

  const guardian = context.representation === 'parent_or_guardian';
  const checkboxId = 'participantTermsAccepted';
  const effectiveDate = localizedDate(context.terms.effectiveAt, effectiveLang);
  return <section className="participant-terms-page" aria-labelledby="participantTermsTitle"><div className="participant-terms-card"><header><span className="kicker">vulcanIQ</span><h1 id="participantTermsTitle">{copy(effectiveLang, 'Termini dell’esperienza', 'Experience Terms & Conditions')}</h1></header><dl className="participant-terms-context"><div><dt>{copy(effectiveLang, 'Partecipante', 'Participant')}</dt><dd>{context.participantName}</dd></div>{guardian && context.actorName && <div><dt>{copy(effectiveLang, 'Genitore o tutore', 'Parent or guardian')}</dt><dd>{context.actorName}</dd></div>}{context.experienceName && <div><dt>{copy(effectiveLang, 'Esperienza', 'Experience')}</dt><dd>{context.experienceName}{context.experienceDate ? ` · ${context.experienceDate}` : ''}</dd></div>}<div><dt>{copy(effectiveLang, 'Versione dei Termini', 'Terms version')}</dt><dd>{context.terms.version} · {context.terms.locale.toUpperCase()}{effectiveDate?` · ${effectiveDate}`:''}</dd></div></dl><button className="button secondary participant-terms-review" type="button" onClick={() => setReviewOpen(true)}>{copy(effectiveLang, 'Leggi i Termini', 'Review Terms')}</button><form onSubmit={confirm} noValidate><div className="participant-terms-checkbox"><input ref={checkboxRef} id={checkboxId} type="checkbox" checked={checked} aria-invalid={Boolean(error)} aria-describedby={error ? `${checkboxId}Error` : undefined} onChange={(event) => { setChecked(event.target.checked); if (event.target.checked) setError(''); }}/><label htmlFor={checkboxId}>{guardian ? copy(effectiveLang, 'Confermo di essere il genitore o tutore responsabile di questo partecipante e accetto i Termini e Condizioni applicabili per suo conto.', 'I confirm that I am the parent or guardian responsible for this participant and accept the applicable Terms & Conditions on their behalf.') : copy(effectiveLang, 'Ho letto e accetto i Termini e Condizioni applicabili a questa esperienza.', 'I have read and accept the Terms & Conditions applicable to this experience.')}</label></div>{error && <p id={`${checkboxId}Error`} className="form-status error" role="alert">{error}</p>}{guardian&&<p className="small-note">{copy(effectiveLang, 'La formulazione per genitori e tutori richiede revisione legale.', 'Parent and guardian wording requires legal review.')}</p>}<div className="participant-terms-actions"><button className="button primary" type="submit" disabled={state === 'submitting'}>{state === 'submitting' ? copy(effectiveLang, 'Registrazione…', 'Recording…') : copy(effectiveLang, 'Conferma accettazione', 'Confirm acceptance')}</button><a href={`/privacy-policy${effectiveLang === 'en' ? '?lang=en' : ''}`} target="_blank" rel="noopener noreferrer">{copy(effectiveLang, 'Informativa Privacy', 'Privacy Notice')}</a></div></form></div>{reviewOpen && <TermsDocumentModal lang={effectiveLang} terms={context.terms} onClose={() => setReviewOpen(false)}/>}</section>;
}
