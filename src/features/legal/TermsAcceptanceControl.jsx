import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useBodyScrollLock from '../../hooks/useBodyScrollLock.js';
import { getApplicableTerms } from '../../services/termsService.js';

function copy(lang, it, en) { return lang === 'it' ? it : en; }

export function TermsDocumentModal({ lang, terms, onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  useBodyScrollLock(true);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    function onKeyDown(event) {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled),a[href]')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus?.(); };
  }, [onClose]);
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="terms-document-backdrop motion-backdrop" role="presentation" onClick={onClose}>
    <article ref={dialogRef} className="terms-document-dialog motion-panel" role="dialog" aria-modal="true" aria-labelledby="termsDocumentTitle" onClick={(event) => event.stopPropagation()}>
      <header><div><span className="kicker">vulcanIQ</span><h2 id="termsDocumentTitle">{copy(lang,'Termini e condizioni','Terms & Conditions')}</h2><p>{copy(lang,'Versione','Version')} {terms.version}</p></div><button ref={closeRef} className="modal-close-button" type="button" onClick={onClose}>{copy(lang,'Chiudi','Close')}</button></header>
      <div className="terms-document-body"><p>{terms.content.intro}</p>{terms.content.sections.map((section)=><section key={section.title}><h3>{section.title}</h3><p>{section.body}</p></section>)}</div>
    </article>
  </div>, document.body);
}

export default function TermsAcceptanceControl({ lang, purpose = 'booking_request', idPrefix, checked, onChange, onVersionChange, error = '' }) {
  const [terms,setTerms]=useState(null);const [loading,setLoading]=useState(true);const [loadError,setLoadError]=useState('');const [open,setOpen]=useState(false);const checkboxRef=useRef(null);
  const checkboxId=`${idPrefix}TermsAccepted`;
  useEffect(()=>{let cancelled=false;setLoading(true);setLoadError('');setTerms(null);onChange(false);onVersionChange('');getApplicableTerms(purpose,lang).then((value)=>{if(cancelled)return;setTerms(value);onVersionChange(value.id);}).catch(()=>{if(!cancelled)setLoadError(copy(lang,'I Termini non sono disponibili. La richiesta via sito non può essere inviata.','Terms are unavailable. The website request cannot be sent.'));}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};},[lang,purpose]);
  useEffect(()=>{if(error)checkboxRef.current?.focus();},[error]);
  const acceptanceLabel=purpose==='excursion_booking'
    ? copy(lang,'Ho letto e accetto i Termini e Condizioni applicabili a questa esperienza confermata e confermo di aver preso visione dell’Informativa Privacy.','I have read and accept the Terms & Conditions applicable to this confirmed experience and confirm that I have been provided with the Privacy Notice.')
    : copy(lang,'Ho letto e accetto i Termini e Condizioni applicabili a questa richiesta e confermo di aver preso visione dell’Informativa Privacy.','I have read and accept the Terms & Conditions applicable to this request and confirm that I have been provided with the Privacy Notice.');
  return <div className="terms-acceptance-control">
    <div className="terms-acceptance-check"><input ref={checkboxRef} id={checkboxId} type="checkbox" checked={checked} disabled={loading||Boolean(loadError)||!terms} aria-invalid={Boolean(error)} aria-describedby={error?`${checkboxId}Error`:undefined} onChange={(event)=>onChange(event.target.checked)}/><label htmlFor={checkboxId}>{acceptanceLabel}</label></div>
    <div className="terms-acceptance-links">{terms&&<button type="button" onClick={()=>setOpen(true)}>{copy(lang,'Termini e condizioni','Terms & Conditions')}</button>}<a href={`/privacy-policy${lang==='en'?'?lang=en':''}`} target="_blank" rel="noopener noreferrer">{copy(lang,'Informativa Privacy','Privacy Notice')}</a>{terms&&<small>{copy(lang,'Versione','Version')} {terms.version} · {terms.locale.toUpperCase()}</small>}</div>
    {loading&&<p className="small-note" role="status">{copy(lang,'Caricamento Termini…','Loading Terms…')}</p>}
    {loadError&&<p className="form-status error" role="alert">{loadError}</p>}
    {error&&<p id={`${checkboxId}Error`} className="form-status error" role="alert">{error}</p>}
    {open&&terms&&<TermsDocumentModal lang={lang} terms={terms} onClose={()=>setOpen(false)}/>}</div>;
}
