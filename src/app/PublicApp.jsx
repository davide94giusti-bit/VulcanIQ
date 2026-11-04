import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isSupabaseConfigured } from '../lib/supabaseClient.js';
import { listSiteMedia } from '../services/siteMediaService.js';
import { loadPublicSiteContent } from '../services/siteContentService.js';
import { createGiftCardRequest } from '../services/giftCards.js';
import { storeReferralJourney, validateAndRecordReferralClick } from '../services/referrals.js';
import { trackPageView, trackLanguageSwitch, trackBookingFormOpen, trackContactClick, trackEvent, startAnalyticsHeartbeat, getAnalyticsIdentitySnapshot, createFormJourney, markFormFieldStarted, markFormActivity, markFormSubmitted, markFormAbandoned, markFormRecoveredViaWhatsApp } from '../analytics.js';
import { canTrack } from '../analytics.js';
import { listNotificationInbox } from '../services/notificationService.js';
import { parseMoneyAmount } from '../utils/money.js';
import { applySeo } from '../seo.js';
import ReviewsPage from '../features/reviews/ReviewsPage.jsx';
import NotificationsPage from '../features/notifications/NotificationsPage.jsx';
import { unreadNotificationCount } from '../domain/notificationInbox.js';
import useBodyScrollLock from '../hooks/useBodyScrollLock.js';
import PrivacyPreferences from '../features/privacy/PrivacyPreferences.jsx';
import { usePublicChallenge } from '../features/privacy/PublicChallenge.jsx';
import { PRIVACY_PREFERENCES_EVENT } from '../services/privacyPreferences.js';
import useDialogFocusTrap from '../hooks/useDialogFocusTrap.js';
import { publicPageFromPathname, legalPageFromPathname, routeDefinitionFromPathname, isReferralPath } from '../app/publicRoutes.js';
import NotFoundPage from '../app/NotFoundPage.jsx';
import DomainErrorBoundary from '../app/DomainErrorBoundary.jsx';
import { ContactForm, EditableText, ExperienceAccordion, FastRequestModal, Header, Hero, Icon, LatestNewsPage, PartnershipsPage, SocialLinks, SocialPage, Team, adminCopy, buildAttributionContactMessage, buildBookingTrackingContext, buildMailto, buildSiteContentMap, contactActionConfirmLabel, encode, experiences, formatMoney, i18n, mergeTrackingContext, navigatePublicRoute, resolvePublicContactDetails, storePublicLanguage, text, todayIso, useContactAttributionGate, withBookingJourneyId } from './siteShared.jsx';

const AdminRouter = React.lazy(() => import('../features/admin/AdminApp.jsx'));

function buildMediaMap(items = []) {
  return (items || []).reduce((acc, item) => {
    if (item?.media_key && (item?.file_url || item?.active === false)) acc[item.media_key] = item;
    return acc;
  }, {});
}

function readInitialPublicLanguage() {
  if (typeof window === 'undefined') return 'it';
  try {
    const queryLang = new URLSearchParams(window.location.search).get('lang');
    if (queryLang === 'en' || queryLang === 'it') return queryLang;
    const stored = window.localStorage.getItem('vulcaniq_public_language');
    if (stored === 'en' || stored === 'it') return stored;
  } catch {}
  return 'it';
}

function GiftCardPage({ lang, siteContent, onClose }) {
  const challenge = usePublicChallenge(lang);
  const giftInFlightRef = useRef(false);
  const contact = resolvePublicContactDetails(siteContent);
  const journeyRef = useRef(null);
  const abandonedRef = useRef(false);
  const modalRef = useRef(null);
  useBodyScrollLock(true);
  const [started, setStarted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState({
    buyer_name: '',
    buyer_email: '',
    buyer_phone: '',
    recipient_name: '',
    experience_type: 'Etna Premium',
    budget: '',
    currency: 'EUR',
    preferred_delivery_date: '',
    message: ''
  });
  const [state, setState] = useState({ loading: false, error: '', success: '' });
  useDialogFocusTrap(true, modalRef, () => { if (!giftInFlightRef.current) attemptClose(); });

  const todayMinDate = todayIso();

  function sanitizeGiftCardPhone(value) {
    return String(value || '').replace(/[^\d+\s().-]/g, '');
  }

  function isValidGiftCardEmail(value) {
    const clean = String(value || '').trim();
    if (!clean) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
  }

  function isValidGiftCardPhone(value) {
    const clean = String(value || '').trim();
    if (!clean) return true;
    return clean.replace(/\D/g, '').length >= 7;
  }

  function isPastGiftCardDate(value) {
    const clean = String(value || '').trim();
    return Boolean(clean && clean < todayMinDate);
  }

  const sourceMetadata = { language: lang, source_section: 'gift_card_page', source_cta: 'gift_card_form', form_type: 'gift_card_request' };
  const stepDefinitions = [
    { key: 'buyer', title: lang === 'it' ? 'Chi acquista la Gift Card?' : 'Who is buying the Gift Card?' },
    { key: 'recipient', title: lang === 'it' ? 'A chi vuoi regalarla?' : 'Who is it for?' },
    { key: 'experience', title: lang === 'it' ? 'Che esperienza ti interessa?' : 'Which experience are you interested in?' },
    { key: 'budget', title: lang === 'it' ? 'Hai un budget indicativo?' : 'Do you have an indicative budget?' },
    { key: 'delivery', title: lang === 'it' ? 'Quando vorresti consegnarla?' : 'When would you like to deliver it?' },
    { key: 'message', title: lang === 'it' ? 'Vuoi aggiungere un messaggio?' : 'Would you like to add a message?' },
    { key: 'review', title: lang === 'it' ? 'Controlla e invia' : 'Review and send' }
  ];
  const currentStep = stepDefinitions[stepIndex] || stepDefinitions[0];
  const progressText = lang === 'it'
    ? `Passaggio ${stepIndex + 1} di ${stepDefinitions.length}`
    : `Step ${stepIndex + 1} of ${stepDefinitions.length}`;
  const progressPercent = Math.round(((stepIndex + 1) / stepDefinitions.length) * 100);
  const hasEnteredData = Boolean(
    String(form.buyer_name || '').trim() ||
    String(form.buyer_email || '').trim() ||
    String(form.buyer_phone || '').trim() ||
    String(form.recipient_name || '').trim() ||
    String(form.budget || '').trim() ||
    String(form.preferred_delivery_date || '').trim() ||
    String(form.message || '').trim()
  );

  useEffect(() => {
    journeyRef.current = createFormJourney('gift_card_request', sourceMetadata);
    trackEvent('gift_card_view', { ...sourceMetadata, journey_id: journeyRef.current?.journey_id || '' }, { dedupe: false });
  }, [lang]);

  useEffect(() => {
    const timer = window.setTimeout(() => modalRef.current?.focus?.(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') attemptClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  useEffect(() => {
    function handlePageHide() {
      abandonOnce({ transport: 'pagehide' });
    }
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [lang, form.budget, form.experience_type, form.preferred_delivery_date, hasEnteredData]);

  function abandonOnce(extra = {}) {
    if (abandonedRef.current || !hasEnteredData) return;
    abandonedRef.current = true;
    markFormAbandoned(journeyRef.current?.journey_id, {
      ...sourceMetadata,
      ...extra,
      step_index: started ? stepIndex + 1 : 0,
      step_key: started ? currentStep.key : 'intro',
      has_selected_experience: Boolean(form.experience_type),
      has_selected_date: Boolean(form.preferred_delivery_date),
      has_budget: Boolean(String(form.budget || '').trim())
    });
  }

  function attemptClose() {
    if (giftInFlightRef.current) return;
    if (hasEnteredData) {
      const confirmed = window.confirm(lang === 'it'
        ? 'Vuoi chiudere la richiesta Gift Card? I dati inseriti potrebbero andare persi.'
        : 'Close the Gift Card request? The details entered may be lost.');
      if (!confirmed) return;
    }
    abandonOnce({ close_action: 'manual_close' });
    if (typeof onClose === 'function') onClose();
  }

  function startQuestionnaire() {
    setStarted(true);
    setState({ loading: false, error: '', success: '' });
    trackEvent('gift_card_questionnaire_started', { ...sourceMetadata, journey_id: journeyRef.current?.journey_id || '', step_index: 1, step_key: 'buyer' }, { dedupe: false });
  }

  function update(field, value) {
    const nextValue = field === 'buyer_phone' ? sanitizeGiftCardPhone(value) : value;
    setState((current) => ({ ...current, error: '' }));
    setForm((current) => ({ ...current, [field]: nextValue }));
    markFormFieldStarted(journeyRef.current?.journey_id, field, {
      ...sourceMetadata,
      step_index: started ? stepIndex + 1 : 0,
      step_key: field
    });
    markFormActivity(journeyRef.current?.journey_id, {
      has_selected_experience: field === 'experience_type' ? Boolean(nextValue) : Boolean(form.experience_type),
      has_selected_date: field === 'preferred_delivery_date' ? Boolean(nextValue) : Boolean(form.preferred_delivery_date),
      has_budget: field === 'budget' ? Boolean(nextValue) : Boolean(form.budget)
    });
  }

  function validateStep(index = stepIndex) {
    const key = stepDefinitions[index]?.key;
    if (key === 'buyer') {
      const hasContact = String(form.buyer_email || '').trim() || String(form.buyer_phone || '').trim();
      if (!String(form.buyer_name || '').trim()) return lang === 'it' ? 'Inserisci il nome di chi acquista.' : 'Enter the buyer name.';
      if (!hasContact) return lang === 'it' ? 'Inserisci almeno email o telefono/WhatsApp.' : 'Enter at least an email or phone/WhatsApp.';
      if (!isValidGiftCardEmail(form.buyer_email)) return lang === 'it' ? 'Inserisci un indirizzo email valido.' : 'Enter a valid email address.';
      if (!isValidGiftCardPhone(form.buyer_phone)) return lang === 'it' ? 'Inserisci un numero WhatsApp / telefono valido.' : 'Enter a valid WhatsApp / phone number.';
    }
    if (key === 'recipient' && !String(form.recipient_name || '').trim()) {
      return lang === 'it' ? 'Inserisci il nome del destinatario.' : 'Enter the recipient name.';
    }
    if (key === 'experience' && !String(form.experience_type || '').trim()) {
      return lang === 'it' ? 'Seleziona un interesse o esperienza.' : 'Select an experience or interest.';
    }
    if (key === 'budget' && String(form.budget || '').trim() && parseMoneyAmount(form.budget) <= 0) {
      return lang === 'it' ? 'Inserisci un budget valido oppure lascia il campo vuoto.' : 'Enter a valid budget or leave the field empty.';
    }
    if (key === 'delivery' && isPastGiftCardDate(form.preferred_delivery_date)) {
      return lang === 'it' ? 'Seleziona una data di oggi o futura.' : 'Select today or a future date.';
    }
    return '';
  }

  function validateAll() {
    for (let index = 0; index < stepDefinitions.length - 1; index += 1) {
      const error = validateStep(index);
      if (error) return error;
    }
    return '';
  }

  function goNext() {
    const error = validateStep();
    if (error) {
      setState({ loading: false, error, success: '' });
      return;
    }
    trackEvent('gift_card_questionnaire_step_completed', {
      ...sourceMetadata,
      journey_id: journeyRef.current?.journey_id || '',
      step_index: stepIndex + 1,
      step_key: currentStep.key,
      has_budget: Boolean(String(form.budget || '').trim()),
      has_preferred_delivery_date: Boolean(form.preferred_delivery_date)
    }, { dedupe: false });
    setStepIndex((current) => Math.min(current + 1, stepDefinitions.length - 1));
  }

  function goBack() {
    setState((current) => ({ ...current, error: '' }));
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  function budgetLabel() {
    return String(form.budget || '').trim()
      ? formatMoney(parseMoneyAmount(form.budget), form.currency || 'EUR', lang)
      : (lang === 'it' ? 'Da definire' : 'To define');
  }

  function buildGiftCardMessage() {
    const budget = budgetLabel();
    return lang === 'it'
      ? `Ciao Leonardo,\n\nvorrei informazioni per regalare una Gift Card vulcanIQ.\n\nNome: ${form.buyer_name || '-'}\nContatto: ${form.buyer_phone || form.buyer_email || '-'}\nGift Card per: ${form.recipient_name || '-'}\nEsperienza/interesse: ${form.experience_type || '-'}\nBudget indicativo: ${budget}\nData consegna preferita: ${form.preferred_delivery_date || '-'}\n\n${form.message || ''}\n\nGrazie!`
      : `Hi Leonardo,\n\nI would like information about gifting a vulcanIQ Gift Card.\n\nName: ${form.buyer_name || '-'}\nContact: ${form.buyer_phone || form.buyer_email || '-'}\nGift Card for: ${form.recipient_name || '-'}\nExperience/interest: ${form.experience_type || '-'}\nIndicative budget: ${budget}\nPreferred delivery date: ${form.preferred_delivery_date || '-'}\n\n${form.message || ''}\n\nThank you!`;
  }

  async function submitWebsiteRequest() {
    if (giftInFlightRef.current || !challenge.ready) return;
    const error = validateAll();
    if (error) {
      setState({ loading: false, error, success: '' });
      return;
    }
    giftInFlightRef.current = true;
    setState({ loading: true, error: '', success: '' });
    try {
      const identity = getAnalyticsIdentitySnapshot('gift_card_page');
      const created = await createGiftCardRequest({
        ...form,
        ...identity,
        turnstile_token: challenge.token,
        buyer_preferred_language: lang,
        language: lang,
        currency: form.currency || 'EUR',
        analytics_journey_id: journeyRef.current?.journey_id,
        form_started_at: journeyRef.current?.opened_at,
        submission_idempotency_key: journeyRef.current?.journey_id,
        submission_fingerprint: journeyRef.current?.journey_id,
        website: ''
      });
      trackEvent('gift_card_request_created', {
        gift_card_request_id: created?.id || '',
        journey_id: journeyRef.current?.journey_id || '',
        form_type: 'gift_card_request',
        language: lang,
        source_section: 'gift_card_page',
        source_cta: 'website_submit',
        has_budget: Boolean(String(form.budget || '').trim()),
        has_preferred_delivery_date: Boolean(form.preferred_delivery_date)
      }, { dedupe: false });
      markFormSubmitted(journeyRef.current?.journey_id, {
        ...sourceMetadata,
        channel: 'website',
        step_index: stepDefinitions.length,
        step_key: 'review',
        has_selected_experience: Boolean(form.experience_type),
        has_selected_date: Boolean(form.preferred_delivery_date),
        has_budget: Boolean(String(form.budget || '').trim())
      });
      setState({ loading: false, error: '', success: lang === 'it' ? 'Richiesta Gift Card inviata. Ti contatteremo manualmente per conferma e pagamento esterno.' : 'Gift Card request sent. We will contact you manually for confirmation and external payment.' });
      setForm({ buyer_name: '', buyer_email: '', buyer_phone: '', recipient_name: '', experience_type: 'Etna Premium', budget: '', currency: 'EUR', preferred_delivery_date: '', message: '' });
      setStarted(false);
      setStepIndex(0);
      abandonedRef.current = false;
      journeyRef.current = createFormJourney('gift_card_request', sourceMetadata);
    } catch (error) {
      setState({ loading: false, error: lang === 'it' ? 'Richiesta non inviata. Puoi usare WhatsApp.' : 'Request not sent. You can use WhatsApp.', success: '' });
    } finally { giftInFlightRef.current = false; challenge.reset(); }
  }

  function handleWhatsappClick(event) {
    const error = validateAll();
    if (error) {
      event.preventDefault();
      setState({ loading: false, error, success: '' });
      return;
    }
    abandonOnce({ recovery_channel: 'whatsapp' });
    markFormRecoveredViaWhatsApp(journeyRef.current?.journey_id, {
      ...sourceMetadata,
      step_index: stepDefinitions.length,
      step_key: 'review',
      has_selected_experience: Boolean(form.experience_type),
      has_selected_date: Boolean(form.preferred_delivery_date),
      has_budget: Boolean(String(form.budget || '').trim())
    });
    trackEvent('gift_card_whatsapp_request_clicked', {
      journey_id: journeyRef.current?.journey_id || '',
      form_type: 'gift_card_request',
      language: lang,
      source_section: 'gift_card_page',
      source_cta: 'whatsapp_submit',
      has_budget: Boolean(String(form.budget || '').trim()),
      has_preferred_delivery_date: Boolean(form.preferred_delivery_date)
    }, { dedupe: false });
    trackEvent('gift_card_request_click', { language: lang, source_section: 'gift_card_page', source_cta: 'whatsapp' }, { dedupe: false });
  }

  const whatsappUrl = `https://wa.me/${contact.phoneWa}?text=${encode(buildGiftCardMessage())}`;

  function renderReviewDetails() {
    return (
      <div className="gift-card-review-card">
        <dl>
          <div><dt>{lang === 'it' ? 'Nome' : 'Name'}</dt><dd>{form.buyer_name || '-'}</dd></div>
          <div><dt>{lang === 'it' ? 'Contatto' : 'Contact'}</dt><dd>{form.buyer_phone || form.buyer_email || '-'}</dd></div>
          <div><dt>{lang === 'it' ? 'Destinatario' : 'Recipient'}</dt><dd>{form.recipient_name || '-'}</dd></div>
          <div><dt>{lang === 'it' ? 'Esperienza' : 'Experience'}</dt><dd>{form.experience_type || '-'}</dd></div>
          <div><dt>{lang === 'it' ? 'Budget' : 'Budget'}</dt><dd>{budgetLabel()}</dd></div>
          <div><dt>{lang === 'it' ? 'Consegna' : 'Delivery'}</dt><dd>{form.preferred_delivery_date || '-'}</dd></div>
        </dl>
        {form.message && <p className="small-note"><strong>{lang === 'it' ? 'Messaggio' : 'Message'}:</strong> {form.message}</p>}
      </div>
    );
  }

  function renderQuestion() {
    switch (currentStep.key) {
      case 'buyer':
        return (
          <div className="admin-form-grid gift-card-step-grid">
            <label className="admin-field full"><span>{lang === 'it' ? 'Nome di chi acquista' : 'Buyer name'}</span><input value={form.buyer_name} onChange={(event) => update('buyer_name', event.target.value)} autoComplete="name" /></label>
            <label className="admin-field"><span>Email</span><input type="email" inputMode="email" value={form.buyer_email} onChange={(event) => update('buyer_email', event.target.value)} autoComplete="email" /></label>
            <label className="admin-field"><span>WhatsApp / Phone</span><input type="tel" inputMode="tel" value={form.buyer_phone} onChange={(event) => update('buyer_phone', event.target.value)} autoComplete="tel" pattern="[0-9+\s().-]*" /></label>
          </div>
        );
      case 'recipient':
        return <label className="admin-field full"><span>{lang === 'it' ? 'Nome destinatario' : 'Recipient name'}</span><input value={form.recipient_name} onChange={(event) => update('recipient_name', event.target.value)} /></label>;
      case 'experience':
        return (
          <label className="admin-field full"><span>{lang === 'it' ? 'Esperienza/interesse' : 'Experience/interest'}</span>
            <select value={form.experience_type} onChange={(event) => update('experience_type', event.target.value)}>
              {experiences.map((item) => <option key={item.id} value={item.title}>{item.title}</option>)}
              <option value={lang === 'it' ? 'Non so ancora' : 'Not sure yet'}>{lang === 'it' ? 'Non so ancora' : 'Not sure yet'}</option>
            </select>
          </label>
        );
      case 'budget':
        return (
          <div className="admin-form-grid gift-card-step-grid">
            <label className="admin-field"><span>{lang === 'it' ? 'Budget indicativo' : 'Indicative budget'}</span><input inputMode="decimal" value={form.budget} onChange={(event) => update('budget', event.target.value)} placeholder="150" /></label>
            <label className="admin-field"><span>{lang === 'it' ? 'Valuta' : 'Currency'}</span><select value={form.currency} onChange={(event) => update('currency', event.target.value)}><option value="EUR">EUR</option><option value="CHF">CHF</option><option value="USD">USD</option><option value="GBP">GBP</option></select></label>
          </div>
        );
      case 'delivery':
        return <label className="admin-field full"><span>{lang === 'it' ? 'Data consegna preferita' : 'Preferred delivery date'}</span><input type="date" min={todayMinDate} value={form.preferred_delivery_date} onChange={(event) => update('preferred_delivery_date', event.target.value)} /></label>;
      case 'message':
        return <label className="admin-field full"><span>{lang === 'it' ? 'Messaggio opzionale' : 'Optional message'}</span><textarea rows={6} value={form.message} onChange={(event) => update('message', event.target.value)} /></label>;
      case 'review':
      default:
        return renderReviewDetails();
    }
  }

  return createPortal((
    <div className="gift-card-flow-backdrop motion-backdrop" role="presentation" onClick={attemptClose}>
      <section className="gift-card-flow-modal motion-panel" role="dialog" aria-modal="true" aria-labelledby="giftCardFlowTitle" ref={modalRef} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        <header className="gift-card-flow-header">
          <div>
            <span className="kicker">Gift Card</span>
            <h1 id="giftCardFlowTitle">{lang === 'it' ? 'Regala un’esperienza sull’Etna' : 'Gift a Mount Etna experience'}</h1>
          </div>
          <button className="modal-close-button" type="button" onClick={attemptClose}>{text(lang, 'close')}</button>
        </header>

        {!started ? (
          <main className="gift-card-intro-screen">
            <div className="gift-card-intro-grid">
              <article className="info-card">
                <h2>{lang === 'it' ? 'Come funziona' : 'How it works'}</h2>
                <p>{lang === 'it' ? 'Invia i dettagli, ricevi una conferma manuale e paga esternamente solo dopo essere stato contattato dal team.' : 'Send the details, receive manual confirmation and pay externally only after the team contacts you.'}</p>
              </article>
              <article className="info-card">
                <h2>{lang === 'it' ? 'Ideale per' : 'Best for'}</h2>
                <p>{lang === 'it' ? 'Coppie, famiglie, compleanni, anniversari, lauree e regali aziendali.' : 'Couples, families, birthdays, anniversaries, graduations and company gifts.'}</p>
              </article>
            </div>
            {state.success && <p className="form-status success" role="status">{state.success}</p>}
            <div className="modal-actions gift-card-intro-actions">
              <button className="button primary" type="button" onClick={startQuestionnaire}>{lang === 'it' ? 'Inizia il questionario' : 'Start the questionnaire'}</button>
            </div>
          </main>
        ) : (
          <main className="gift-card-questionnaire-screen">
            <div className="questionnaire-progress gift-card-progress" aria-label={progressText} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progressPercent}>
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="gift-card-progress-label">{progressText}</p>
            <section className={`gift-card-question-card ${currentStep.key === 'review' ? 'review-step' : ''}`.trim()} aria-live="polite">
              <h2>{currentStep.title}</h2>
              {renderQuestion()}
              {state.error && <p className="form-status error" role="alert">{state.error}</p>}
              {state.success && <p className="form-status success" role="status">{state.success}</p>}
            </section>
            <footer className={`gift-card-flow-footer ${currentStep.key === 'review' ? 'review-step' : ''}`.trim()}>
              {currentStep.key !== 'review' ? (
                <>
                  <button className="button secondary" type="button" onClick={goBack} disabled={stepIndex === 0 || state.loading}>{lang === 'it' ? 'Indietro' : 'Back'}</button>
                  <button className="button primary" type="button" onClick={goNext} disabled={state.loading}>{lang === 'it' ? 'Avanti' : 'Next'}</button>
                </>
              ) : (
                <div className="gift-card-review-actions-stack">
                  {challenge.element}
                  <button className="button secondary" type="button" onClick={goBack} disabled={stepIndex === 0 || state.loading}>{lang === 'it' ? 'Indietro' : 'Back'}</button>
                  <button className="button primary" type="button" onClick={submitWebsiteRequest} disabled={state.loading || !challenge.ready}>{state.loading ? (lang === 'it' ? 'Invio...' : 'Sending...') : (lang === 'it' ? 'Invia richiesta Gift Card dal sito' : 'Send Gift Card request via website')}</button>
                  <a className="button secondary gift-card-whatsapp-action" href={whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={handleWhatsappClick}>{lang === 'it' ? 'Invia richiesta Gift Card via WhatsApp' : 'Send Gift Card request via WhatsApp'}</a>
                </div>
              )}
            </footer>
          </main>
        )}
      </section>
    </div>
  ), document.body);
}

function LegalPage({ lang, page, siteContent, modal = false }) {
  const contact = resolvePublicContactDetails(siteContent);
  const updated = '30/06/2026';
  const content = {
    privacy: {
      title: adminCopy(lang, 'Privacy Policy', 'Privacy Policy'),
      intro: adminCopy(lang, 'Questa informativa descrive in modo pratico come vulcanIQ tratta i dati inviati tramite il sito.', 'This policy explains in practical terms how vulcanIQ processes data submitted through the website.'),
      sections: [
        [adminCopy(lang, 'Titolare del trattamento', 'Data controller'), adminCopy(lang, 'Il sito è gestito da vulcanIQ. Per richieste privacy puoi usare l’indirizzo email indicato nei contatti del sito.', 'The site is managed by vulcanIQ. For privacy requests, use the email address listed in the website contact details.')],
        [adminCopy(lang, 'Dati raccolti', 'Data collected'), adminCopy(lang, 'Possiamo ricevere dati inseriti nei moduli di contatto o prenotazione, come nome, telefono, email, preferenze di contatto, data richiesta, numero di partecipanti e testo del messaggio.', 'We may receive data entered in contact or booking forms, such as name, phone, email, contact preference, requested date, party size and message text.')],
        [adminCopy(lang, 'Dati analytics', 'Analytics data'), adminCopy(lang, 'Con il tuo consenso, gli analytics facoltativi usano identificatori pseudonimi che possono essere collegati alle richieste. Non sono dati anonimi. Nomi, email, telefoni e testo dei messaggi sono esclusi. Puoi modificare la scelta nelle Preferenze privacy.', 'With your consent, optional analytics use pseudonymous identifiers that may be linked to requests. They are not anonymous. Names, email addresses, phone numbers and message text are excluded. You can change your choice in Privacy preferences.')],
        [adminCopy(lang, 'Finalità', 'Purposes'), adminCopy(lang, 'I dati sono usati per rispondere alle richieste, gestire disponibilità e prenotazioni, migliorare il sito e mantenere sicurezza tecnica.', 'Data is used to answer requests, manage availability and bookings, improve the site and maintain technical security.')],
        [adminCopy(lang, 'Servizi terzi', 'Third-party services'), adminCopy(lang, 'Il sito può collegarsi a servizi esterni come WhatsApp, email, Google Maps, social network, Supabase e Cloudflare. Quando apri un link esterno, si applicano anche le policy del relativo servizio.', 'The site may link to external services such as WhatsApp, email, Google Maps, social networks, Supabase and Cloudflare. When you open an external link, that service’s policies also apply.')],
        [adminCopy(lang, 'Conservazione e diritti', 'Retention and rights'), adminCopy(lang, 'I dati vengono conservati per il tempo necessario alla gestione della richiesta e agli obblighi organizzativi o legali. Puoi chiedere accesso, rettifica o cancellazione contattando il team.', 'Data is retained for the time needed to manage the request and organizational or legal obligations. You may request access, correction or deletion by contacting the team.')],
        [adminCopy(lang, 'Contatto', 'Contact'), contact.email]
      ]
    },
    terms: {
      title: adminCopy(lang, 'Termini e condizioni', 'Terms and Conditions'),
      intro: adminCopy(lang, 'Queste condizioni regolano l’uso del sito e l’invio di richieste per esperienze vulcanIQ.', 'These terms govern use of the site and submission of requests for vulcanIQ experiences.'),
      sections: [
        [adminCopy(lang, 'Uso del sito', 'Website use'), adminCopy(lang, 'Le informazioni sono fornite per presentare esperienze, disponibilità indicative e modalità di contatto. Non usare il sito in modo illecito o dannoso.', 'Information is provided to present experiences, indicative availability and contact methods. Do not use the site in unlawful or harmful ways.')],
        [adminCopy(lang, 'Richieste e conferme', 'Requests and confirmations'), adminCopy(lang, 'L’invio di una richiesta non costituisce conferma automatica. La prenotazione è confermata solo dopo risposta esplicita del team vulcanIQ.', 'Submitting a request is not an automatic confirmation. A booking is confirmed only after explicit confirmation from the vulcanIQ team.')],
        [adminCopy(lang, 'Disponibilità, prezzi e programmi', 'Availability, prices and programs'), adminCopy(lang, 'Disponibilità, prezzi, orari, itinerari e programmi possono cambiare in base a meteo, ordinanze, attività vulcanica, logistica e valutazione della guida.', 'Availability, prices, times, routes and programs may change based on weather, regulations, volcanic activity, logistics and guide assessment.')],
        [adminCopy(lang, 'Responsabilità del cliente', 'Customer responsibilities'), adminCopy(lang, 'Il cliente deve fornire informazioni corrette su partecipanti, età, condizioni fisiche, esigenze specifiche e contatti utili alla gestione dell’esperienza.', 'Customers must provide accurate information about participants, age, fitness level, specific needs and contact details required to manage the experience.')],
        [adminCopy(lang, 'Sicurezza Etna e meteo', 'Etna safety and weather'), adminCopy(lang, 'Le esperienze sull’Etna dipendono da condizioni naturali variabili. La guida può modificare, rinviare o annullare l’attività per motivi di sicurezza.', 'Etna experiences depend on variable natural conditions. The guide may change, postpone or cancel the activity for safety reasons.')],
        [adminCopy(lang, 'Link esterni e proprietà intellettuale', 'External links and intellectual property'), adminCopy(lang, 'I link esterni sono forniti per utilità. Testi, immagini, logo e contenuti vulcanIQ non possono essere copiati senza autorizzazione.', 'External links are provided for convenience. vulcanIQ text, images, logo and content may not be copied without permission.')],
        [adminCopy(lang, 'Contatto', 'Contact'), contact.email]
      ]
    },
    cookies: {
      title: adminCopy(lang, 'Cookie Policy', 'Cookie Policy'),
      intro: adminCopy(lang, 'Questa pagina spiega l’uso di cookie e tecnologie simili sul sito vulcanIQ.', 'This page explains the use of cookies and similar technologies on the vulcanIQ website.'),
      sections: [
        [adminCopy(lang, 'Cosa sono i cookie', 'What cookies are'), adminCopy(lang, 'I cookie sono piccoli file o identificatori tecnici usati dal browser per far funzionare un sito o ricordare alcune informazioni.', 'Cookies are small files or technical identifiers used by the browser to operate a site or remember certain information.')],
        [adminCopy(lang, 'Cookie essenziali', 'Essential cookies'), adminCopy(lang, 'Il sito può usare dati tecnici essenziali per lingua, sessione, sicurezza, invio dei moduli e funzionamento dell’interfaccia.', 'The site may use essential technical data for language, session, security, form submission and interface operation.')],
        [adminCopy(lang, 'Analytics', 'Analytics'), adminCopy(lang, 'Le metriche del sito sono configurate per essere anonime e diagnostiche. Se il browser invia preferenze Do Not Track o segnali simili, il tracciamento viene limitato quando supportato dal sito.', 'Site metrics are configured to be anonymous and diagnostic. If the browser sends Do Not Track preferences or similar signals, tracking is limited where supported by the site.')],
        [adminCopy(lang, 'Servizi terzi', 'Third-party services'), adminCopy(lang, 'Link a Google Maps, social network, WhatsApp o altri servizi possono usare cookie propri solo dopo l’apertura del servizio esterno.', 'Links to Google Maps, social networks, WhatsApp or other services may use their own cookies only after the external service is opened.')],
        [adminCopy(lang, 'Gestione cookie', 'Managing cookies'), adminCopy(lang, 'Puoi gestire o cancellare i cookie dalle impostazioni del browser. Il blocco di alcuni elementi tecnici può ridurre il corretto funzionamento del sito.', 'You can manage or delete cookies in your browser settings. Blocking some technical elements may reduce proper site functionality.')],
        [adminCopy(lang, 'Contatto', 'Contact'), contact.email]
      ]
    }
  };
  const selected = content[page] || content.privacy;
  return (
    <section className={`section page-section legal-page-section ${modal ? 'is-modal-content' : ''}`.trim()}>
      <div className="container legal-page-card">
        <div className="section-header refined-section-header">
          <h1 id={modal ? 'legalModalTitle' : undefined}>{selected.title}</h1>

        </div>
        <div className="legal-section-list">
          {selected.sections.map(([title, body]) => (
            <article className="legal-section-card" key={title}>
              <h2>{title}</h2>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer({ lang, siteContent, editor }) {
  const legalPanelRef = useRef(null);
  const contact = resolvePublicContactDetails(siteContent);
  const [footerBookNowOpen, setFooterBookNowOpen] = useState(false);
  const [phoneChoicesOpen, setPhoneChoicesOpen] = useState(false);
  const [legalModalPage, setLegalModalPage] = useState(null);
  const phoneChoiceRef = useRef(null);
  useBodyScrollLock(Boolean(legalModalPage));
  useDialogFocusTrap(Boolean(legalModalPage), legalPanelRef, () => setLegalModalPage(null));
  const { requestContactAttribution, contactAttributionModal } = useContactAttributionGate(lang);
  const baseMetadata = buildBookingTrackingContext({ requestType: 'contact', sourceSection: 'footer', sourceCta: 'contact_direct', ctaLocation: 'footer', language: lang });
  const subject = text(lang, 'emailSubject');

  useEffect(() => {
    if (!phoneChoicesOpen) return undefined;
    function closeMenu() {
      setPhoneChoicesOpen(false);
    }
    function handlePointerDown(event) {
      if (!phoneChoiceRef.current || phoneChoiceRef.current.contains(event.target)) return;
      closeMenu();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('hashchange', closeMenu);
    window.addEventListener('popstate', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('hashchange', closeMenu);
      window.removeEventListener('popstate', closeMenu);
    };
  }, [phoneChoicesOpen]);

  return (
    <footer className="footer public-footer">
      <div className="container footer-grid public-footer-grid">
        <section className="footer-column footer-brand-column">
          <h2>vulcanIQ</h2>
        </section>
        <section className="footer-column footer-contact-column">
          <h3>{adminCopy(lang, 'Contatti', 'Contact')}</h3>
          <p className="footer-contact-list">
            <a
              href={buildMailto(contact.email, subject, text(lang, 'defaultMessage'))}
              onClick={(event) => requestContactAttribution(event, {
                type: 'email',
                location: 'footer',
                metadata: { ...baseMetadata, source_cta: 'email_direct' },
                confirmLabel: contactActionConfirmLabel('email', lang),
                buildUrl: (_selectedMetadata, source, detail) => buildMailto(contact.email, subject, buildAttributionContactMessage(source, detail, lang))
              })}
            >{contact.email}</a>
            <span className="footer-phone-choice" ref={phoneChoiceRef}>
              <button
                className="footer-phone-choice-trigger"
                type="button"
                onClick={() => setPhoneChoicesOpen((open) => !open)}
                aria-expanded={phoneChoicesOpen}
              >
                {contact.phoneDisplay}
              </button>
              {phoneChoicesOpen && (
                <span className="footer-phone-choice-menu" role="group" aria-label={lang === 'it' ? 'Scegli come contattare Leonardo' : 'Choose how to contact Leonardo'}>
                  <a href={`tel:${contact.phoneTel}`} onClick={() => { setPhoneChoicesOpen(false); trackContactClick('phone', 'footer_phone_menu', { ...baseMetadata, cta_location: 'footer_phone_menu', source_cta: 'phone_direct' }); }}>{lang === 'it' ? 'Chiama' : 'Call'}</a>
                  <a
                    href={`https://wa.me/${contact.phoneWa}?text=${encode(text(lang, 'defaultMessage'))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => {
                      setPhoneChoicesOpen(false);
                      requestContactAttribution(event, {
                        type: 'whatsapp',
                        target: '_blank',
                        location: 'footer_phone_menu',
                        metadata: { ...baseMetadata, cta_location: 'footer_phone_menu', source_cta: 'whatsapp_direct' },
                        confirmLabel: contactActionConfirmLabel('whatsapp', lang),
                        buildUrl: (_selectedMetadata, source, detail) => `https://wa.me/${contact.phoneWa}?text=${encode(buildAttributionContactMessage(source, detail, lang))}`
                      });
                    }}
                  >WhatsApp</a>
                </span>
              )}
            </span>
          </p>
        </section>
        <section className="footer-column">
          <h3>{adminCopy(lang, 'Legale', 'Legal')}</h3>
          <button className="footer-link-button" type="button" onClick={() => setLegalModalPage('privacy')}>Privacy Policy</button>
          <button className="footer-link-button" type="button" onClick={() => setLegalModalPage('terms')}>{adminCopy(lang, 'Termini e condizioni', 'Terms and Conditions')}</button>
          <button className="footer-link-button" type="button" onClick={() => setLegalModalPage('cookies')}>Cookie Policy</button>
        </section>
        <section className="footer-column">
          <h3>{adminCopy(lang, 'Social', 'Social')}</h3>
          <SocialLinks lang={lang} siteContent={siteContent} className="footer-social-links" compact location="footer" />
        </section>
        <section className="footer-column">
          <h3>Etna</h3>
          <a href="/latest-news">{adminCopy(lang, 'Notizie live sull’Etna', 'Etna live news')}</a>
          <a
            href="/contact"
            onClick={(event) => {
              event.preventDefault();
              setFooterBookNowOpen(true);
            }}
          >{adminCopy(lang, 'Prenota ora', 'Book now')}</a>
        </section>
      </div>
      <div className="container footer-bottom-row">
        <p>{adminCopy(lang, '© 2026 vulcanIQ – Tutti i diritti riservati', '© 2026 vulcanIQ – All rights reserved')}</p>
      </div>
      {legalModalPage && (
        <div className="legal-modal-backdrop motion-backdrop" role="presentation" onClick={() => setLegalModalPage(null)}>
          <article ref={legalPanelRef} tabIndex={-1} className="legal-modal-panel motion-panel" role="dialog" aria-modal="true" aria-labelledby="legalModalTitle" onClick={(event) => event.stopPropagation()}>
            <div className="legal-modal-header">
              <span>{adminCopy(lang, 'Documento legale', 'Legal document')}</span>
              <button className="modal-close-button" type="button" onClick={() => setLegalModalPage(null)}>{text(lang, 'close')}</button>
            </div>
            <LegalPage lang={lang} page={legalModalPage} siteContent={siteContent} modal />
          </article>
        </div>
      )}
      {footerBookNowOpen && (
        <FastRequestModal
          lang={lang}
          siteContent={siteContent}
          sourceSection="footer"
          sourceCta="book_now"
          ctaLocation="footer_book_now"
          flowType="fast_request"
          onClose={() => setFooterBookNowOpen(false)}
        />
      )}
      {contactAttributionModal}
    </footer>
  );
}

function StickyMobileBar({ lang, siteContent }) {
  const contact = resolvePublicContactDetails(siteContent);
  const { requestContactAttribution, contactAttributionModal } = useContactAttributionGate(lang);
  const metadata = buildBookingTrackingContext({ requestType: 'contact', sourceSection: 'sticky_contact_bar', sourceCta: 'contact_direct', ctaLocation: 'sticky_contact_bar', language: lang });
  const subject = text(lang, 'emailSubject');
  const fallbackMessage = text(lang, 'defaultMessage');
  const whatsappUrl = `https://wa.me/${contact.phoneWa}?text=${encode(fallbackMessage)}`;
  const emailUrl = buildMailto(contact.email, subject, fallbackMessage);
  return (
    <>
      <div className="mobile-sticky-bar" aria-label="Mobile contact actions">
        <a href={`tel:${contact.phoneTel}`} onClick={() => trackContactClick('phone', 'sticky_contact_bar', { ...metadata, source_cta: 'phone_direct' })}><Icon name="phone" />{lang === 'it' ? 'Chiama' : 'Call'}</a>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => requestContactAttribution(event, {
            type: 'whatsapp',
            target: '_blank',
            location: 'sticky_contact_bar',
            metadata: { ...metadata, source_cta: 'whatsapp_direct' },
            confirmLabel: contactActionConfirmLabel('whatsapp', lang),
            buildUrl: (_selectedMetadata, source, detail) => `https://wa.me/${contact.phoneWa}?text=${encode(buildAttributionContactMessage(source, detail, lang))}`
          })}
        ><Icon name="chat" />WhatsApp</a>
        <a
          href={emailUrl}
          onClick={(event) => requestContactAttribution(event, {
            type: 'email',
            location: 'sticky_contact_bar',
            metadata: { ...metadata, source_cta: 'email_direct' },
            confirmLabel: contactActionConfirmLabel('email', lang),
            buildUrl: (_selectedMetadata, source, detail) => buildMailto(contact.email, subject, buildAttributionContactMessage(source, detail, lang))
          })}
        ><Icon name="mail" />Email</a>
      </div>
      {contactAttributionModal}
    </>
  );
}

function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const handlePop = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const navigate = useCallback((path) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
      setPathname(path);
      window.scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
    }
  }, []);

  return [pathname, navigate];
}

function App() {
  const [analyticsConsentVersion, setAnalyticsConsentVersion] = useState(0);
  useEffect(() => {
    const changed = () => setAnalyticsConsentVersion(value => value + 1);
    window.addEventListener(PRIVACY_PREFERENCES_EVENT, changed);
    window.addEventListener('storage', changed);
    return () => { window.removeEventListener(PRIVACY_PREFERENCES_EVENT, changed); window.removeEventListener('storage', changed); };
  }, []);
  const [pathname, navigate] = usePathname();
  const [lang, setLang] = useState(() => readInitialPublicLanguage());
  const referralChallenge = usePublicChallenge(lang);
  const [referralAttempt, setReferralAttempt] = useState(0);
  const [referralError, setReferralError] = useState(false);
  const [formState, setFormState] = useState(() => ({ language: lang, requestType: 'private', partyType: 'solo', adults: '1', children: '0', childrenUnder3Count: '0', heardAboutUs: '', heardAboutUsDetail: '', message: text(lang, 'defaultMessage') }));
  const [activePage, setActivePage] = useState(() => publicPageFromPathname(window.location.pathname) || 'home');
  const [siteMedia, setSiteMedia] = useState({});
  const [siteContent, setSiteContent] = useState({});
  const [cmsStatus, setCmsStatus] = useState(() => isSupabaseConfigured ? 'loading' : 'error');
  const [publicUnreadCount, setPublicUnreadCount] = useState(null);
  const contactRef = useRef(null);
  const analyticsContextRef = useRef({ section: 'home', language: 'it' });
  const analyticsDisabledForRoute = pathname.startsWith('/admin');

  const refreshPublicUnread = useCallback(async () => {
    try {
      const result = await listNotificationInbox('public');
      setPublicUnreadCount(unreadNotificationCount(result.items || []));
    } catch {
      setPublicUnreadCount(null);
    }
  }, []);

  useEffect(() => {
    if (pathname.startsWith('/admin')) {
      setPublicUnreadCount(null);
      return undefined;
    }
    if (activePage !== 'install') refreshPublicUnread();
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') refreshPublicUnread(); };
    const handleServiceWorkerMessage = (event) => { if (event.data?.type === 'vulcaniq-public-inbox-changed') refreshPublicUnread(); };
    window.addEventListener('focus', refreshPublicUnread);
    window.addEventListener('pageshow', refreshPublicUnread);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    navigator.serviceWorker?.addEventListener?.('message', handleServiceWorkerMessage);
    return () => {
      window.removeEventListener('focus', refreshPublicUnread);
      window.removeEventListener('pageshow', refreshPublicUnread);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      navigator.serviceWorker?.removeEventListener?.('message', handleServiceWorkerMessage);
    };
  }, [activePage, pathname, refreshPublicUnread]);

  useEffect(() => {
    const match = pathname.match(/^\/r\/ref\/([^/?#]+)/);
    if (!match || !referralChallenge.ready) return;
    const code = match[1];
    const params = new URLSearchParams(window.location.search || '');
    const routeLang = params.get('lang') === 'en' ? 'en' : params.get('lang') === 'it' ? 'it' : lang;
    let cancelled = false;
    async function resolveReferral() {
      setReferralError(false);
      try {
      const result = await validateAndRecordReferralClick(code, { turnstile_token: referralChallenge.token });
      if (cancelled) return;
      if (result.valid) {
        storeReferralJourney(result.code, { language: routeLang });
        trackEvent('referral_link_click', { referral_code: result.code, source_type: 'customer_referral', language: routeLang }, { dedupe: false });
      } else {
        trackEvent('referral_invalid_link_click', { referral_code: code, source_type: 'customer_referral', language: routeLang }, { dedupe: false });
      }
      const query = new URLSearchParams();
      if (routeLang === 'en') query.set('lang', 'en');
      if (result.valid && canTrack()) {
        query.set('utm_source', 'referral');
        query.set('utm_medium', 'customer');
        query.set('utm_campaign', `referral_${result.code}`);
      }
      window.history.replaceState({}, '', `/${query.toString() ? `?${query.toString()}` : ''}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
      setActivePage('home');
      } catch {
        if (!cancelled) setReferralError(true);
      }
    }
    resolveReferral();
    return () => { cancelled = true; };
  }, [pathname, referralChallenge.token, referralAttempt]);

  useEffect(() => {
    analyticsContextRef.current = { section: activePage, language: lang };
  }, [activePage, lang]);

  useEffect(() => {
    if (analyticsDisabledForRoute) return undefined;
    return startAnalyticsHeartbeat(() => analyticsContextRef.current);
  }, [analyticsDisabledForRoute, analyticsConsentVersion]);

  useEffect(() => {
    if (pathname.startsWith('/admin')) return;
    const legalPage = legalPageFromPathname(pathname);
    const route = routeDefinitionFromPathname(pathname);
    const notFound = !legalPage && !route && !isReferralPath(pathname);
    const trackedSection = notFound ? 'not_found' : (legalPage ? `legal_${legalPage}` : activePage);
    const trackedPath = notFound || legalPage ? pathname : `/${activePage === 'home' ? '' : activePage}`;
    trackPageView(trackedSection, { path: trackedPath, language: lang });
  }, [activePage, lang, pathname, analyticsConsentVersion]);

  useEffect(() => {
    if (pathname.startsWith('/admin') || legalPageFromPathname(pathname)) return;
    const routePage = publicPageFromPathname(pathname);
    if (routePage) setActivePage(routePage);
  }, [pathname]);

  useEffect(() => {
    const adminVariant = pathname.startsWith('/admin');
    const manifest = document.querySelector('link[rel="manifest"]');
    if (manifest) manifest.setAttribute('href', adminVariant ? '/admin-manifest.webmanifest' : '/manifest.webmanifest');
    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) appleTitle.setAttribute('content', adminVariant ? 'vulcanIQ Admin' : 'vulcanIQ');
  }, [pathname]);

  // The optional second-party beacon is not injected here: removing its script
  // cannot revoke already-installed navigation/unload listeners after opt-out.
  // Canonical custom analytics below/above observes the live consent decision.
  // Dashboard-injected beacons must be checked separately before deployment.

  useEffect(() => {
    if (pathname.startsWith('/admin')) return;
    const legalPage = legalPageFromPathname(pathname);
    const route = routeDefinitionFromPathname(pathname);
    const notFound = !legalPage && !route && !isReferralPath(pathname);
    applySeo({ page: notFound ? 'notFound' : (legalPage || activePage), lang, pathname, forceNoIndex: notFound || route?.indexable === false });
  }, [activePage, lang, pathname]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setCmsStatus('error');
      return undefined;
    }
    let active = true;
    setCmsStatus('loading');
    Promise.allSettled([listSiteMedia({ activeOnly: true }), loadPublicSiteContent()])
      .then(([mediaResult, contentResult]) => {
        if (!active) return;
        const mediaReady = mediaResult.status === 'fulfilled';
        const contentReady = contentResult.status === 'fulfilled';
        setSiteMedia(mediaReady ? buildMediaMap(mediaResult.value) : {});
        setSiteContent(contentReady ? buildSiteContentMap(contentResult.value) : {});
        setCmsStatus(mediaReady || contentReady ? 'ready' : 'error');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    setFormState((current) => ({
      ...current,
      language: current.language || lang,
      message: current.message && current.message !== i18n.it.defaultMessage && current.message !== i18n.en.defaultMessage ? current.message : text(lang, 'defaultMessage')
    }));
  }, [lang]);

  function setPublicLanguage(nextLang) {
    setLang((current) => {
      const resolved = typeof nextLang === 'function' ? nextLang(current) : nextLang;
      if (resolved && resolved !== current) trackLanguageSwitch(current, resolved);
      if (resolved) {
        storePublicLanguage(resolved);
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin')) {
          const url = new URL(window.location.href);
          if (resolved === 'en') url.searchParams.set('lang', 'en');
          else url.searchParams.delete('lang');
          window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        }
      }
      return resolved || current;
    });
  }

  function scrollContactIntoView() {
    setActivePage('contact');
    navigatePublicRoute('/contact', lang);
    window.setTimeout(() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  function scrollToForm(metadata = {}) {
    const trackingContext = withBookingJourneyId(buildBookingTrackingContext({
      experienceId: formState.experienceId || '',
      requestType: formState.requestType || 'private',
      sourceSection: metadata.source_section || 'hero',
      sourceCta: metadata.source_cta || 'contact_direct',
      ctaLocation: metadata.cta_location || 'hero',
      selectedDate: formState.requestedDate || '',
      hasFixedExcursion: formState.requestType === 'fixed',
      language: lang
    }), formState.trackingContext, { forceNew: !formState.trackingContext?.booking_journey_id });
    trackBookingFormOpen(formState.experienceId || formState.requestType || 'private', mergeTrackingContext(trackingContext, metadata));
    setFormState((current) => ({ ...current, trackingContext: mergeTrackingContext(trackingContext, metadata) }));
    scrollContactIntoView();
  }

  function fillForm({ experienceId, message, requestType, fixedExcursionId, requestedDate, adults, children, childrenUnder3Count, trackingContext, scroll = false }) {
    setFormState((current) => ({
      ...current,
      experienceId: experienceId || current.experienceId,
      requestType: requestType || current.requestType || 'private',
      fixedExcursionId: fixedExcursionId !== undefined ? fixedExcursionId : current.fixedExcursionId,
      requestedDate: requestedDate || current.requestedDate,
      adults: adults !== undefined ? adults : current.adults,
      children: children !== undefined ? children : current.children,
      childrenUnder3Count: childrenUnder3Count !== undefined ? childrenUnder3Count : current.childrenUnder3Count,
      privateExperience: requestType ? requestType === 'private' : current.privateExperience,
      message: message || current.message,
      language: lang,
      trackingContext: trackingContext ? withBookingJourneyId(trackingContext, current.trackingContext) : current.trackingContext
    }));
    if (scroll) scrollContactIntoView();
  }

  function renderPublicPage() {
    const legalPage = legalPageFromPathname(pathname);
    if (legalPage) return <LegalPage lang={lang} page={legalPage} siteContent={siteContent} />;
    if (!routeDefinitionFromPathname(pathname) && !isReferralPath(pathname)) {
      return <NotFoundPage lang={lang} onHome={() => navigatePublicRoute('/', lang)} />;
    }
    switch (activePage) {
      case 'experiences':
        return <ExperienceAccordion lang={lang} fillForm={fillForm} siteMedia={siteMedia} siteContent={siteContent} />;
      case 'partnerships':
        return <PartnershipsPage lang={lang} siteContent={siteContent} />;
      case 'about':
        return <Team lang={lang} siteMedia={siteMedia} siteContent={siteContent} />;
      case 'reviews':
        return <ReviewsPage lang={lang} siteContent={siteContent} EditableTextComponent={EditableText} />;
      case 'social':
        return <SocialPage lang={lang} siteContent={siteContent} />;
      case 'latestNews':
        return <LatestNewsPage lang={lang} siteContent={siteContent} />;
      case 'contact':
        return <ContactForm lang={lang} formState={formState} setFormState={setFormState} siteMedia={siteMedia} siteContent={siteContent} />;
      case 'giftCard':
        return <GiftCardPage lang={lang} siteContent={siteContent} onClose={() => { setActivePage('home'); navigatePublicRoute('/', lang); }} />;
      case 'install':
        return <NotificationsPage variant="public" lang={lang} onPublicUnreadCountChange={setPublicUnreadCount} />;
      case 'home':
      default:
        return <Hero lang={lang} setActivePage={setActivePage} scrollToForm={scrollToForm} fillForm={fillForm} siteMedia={siteMedia} siteContent={siteContent} cmsStatus={cmsStatus} />;
    }
  }

  if (pathname.startsWith('/admin')) {
    return <DomainErrorBoundary resetKey={pathname} lang={lang}><React.Suspense fallback={<main aria-busy="true" role="status">{lang === 'it' ? 'Caricamento area riservata…' : 'Loading private area…'}</main>}><AdminRouter pathname={pathname} navigate={navigate} lang={lang} setLang={setPublicLanguage} /></React.Suspense></DomainErrorBoundary>;
  }

  if (isReferralPath(pathname)) {
    return <main className="container section"><h1>{lang === 'it' ? 'Apri invito' : 'Open invitation'}</h1>{referralChallenge.element}
      {referralError && <p role="alert">{lang === 'it' ? 'Invito non verificato. Controlla la connessione e riprova.' : 'Invitation could not be checked. Check your connection and retry.'} <button className="button secondary" type="button" onClick={() => { referralChallenge.reset(); setReferralAttempt(value => value + 1); }}>{lang === 'it' ? 'Riprova' : 'Retry'}</button></p>}
      <a href="/">{lang === 'it' ? 'Continua senza attribuzione' : 'Continue without attribution'}</a></main>;
  }

  return (
    <>
      <Header lang={lang} setLang={setPublicLanguage} activePage={activePage} setActivePage={setActivePage} siteMedia={siteMedia} publicUnreadCount={publicUnreadCount} />
      <main ref={contactRef} className={`public-page-shell public-page-${activePage}`}>
        <DomainErrorBoundary resetKey={`${pathname}:${lang}`} lang={lang}>{renderPublicPage()}</DomainErrorBoundary>
      </main>
      <Footer lang={lang} siteContent={siteContent} />
      <PrivacyPreferences lang={lang} />
      <StickyMobileBar lang={lang} siteContent={siteContent} />
    </>
  );
}

export default App;
