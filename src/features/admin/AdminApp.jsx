import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js';
import { getAdminAccess, requestAdminPasswordReset, signInOwner, signOutOwner, updateCurrentAdminPassword } from '../../services/adminAuth.js';
import { createManualBookingRequest, listBookingRequests, updateBookingRequest, approveBookingRequest, declineBookingRequest, cancelBookingRequest, markBookingRequestReviewRequested, markBookingRequestReviewReceived, markBookingRequestReviewLinkCopied, bookingRequestCanConfirmIncome, getBookingRequestIncomeState, confirmBookingRequestIncome } from '../../services/bookingRequests.js';
import { getBookingRequestCounts } from '../../services/bookingRequests.js';
import { listBookingCodes, createBookingCode, cancelBookingCode, markBookingCodeCompleted, getBookingCodePaymentState, recordBookingCodePayment, markBookingCodeNoShow, markBookingCodeReviewRequested, markBookingCodeReviewReceived, markBookingCodeReviewLinkCopied } from '../../services/bookingCodes.js';
import { loadPublicFixedExcursions, listAvailabilityBlocks, createAvailabilityBlock, updateAvailabilityBlock, deactivateAvailabilityBlock, listFixedExcursions, createFixedExcursion, updateFixedExcursion, deactivateFixedExcursion, listMonthlyLeaflets, createMonthlyLeaflet, updateMonthlyLeaflet, deactivateMonthlyLeaflet, uploadMonthlyLeafletFile, removeMonthlyLeafletFile, uploadFixedExcursionLeafletFile, removeBlockedDatesFile, defaultReason } from '../../services/availabilityService.js';
import { listPartnerships, createPartnership, updatePartnership, deactivatePartnership, uploadPartnershipImage, removePartnershipImage } from '../../services/partnershipService.js';
import { listReviews, createManualReview, updateReviewDetails, updateReviewVisibility, updateReviewAdminReply, deleteReviewAdminReply, deleteReview } from '../../services/reviewsService.js';
import { listSiteMedia, upsertSiteMedia, uploadSiteMediaFile, removeSiteMediaFile } from '../../services/siteMediaService.js';
import { listSiteContent, upsertSiteContent } from '../../services/siteContentService.js';
import { listFinanceEntries, createFinanceEntry, updateFinanceEntry, archiveFinanceEntry, reverseFinanceEntry } from '../../services/financeService.js';
import { getFinanceTotals } from '../../services/financeService.js';
import { downloadFinancialAudit } from '../../services/financeAuditService.js';
import { assignPartnerToBookingRequest, calculatePartnerCommission, listPartnerCommissions, listPartnerCommissionSummary, updatePartnerCommissionStatus, upsertPartnerCommissionForSource } from '../../services/partnerCommissions.js';
import { getAdminAnalyticsSummary, listAnalyticsEventPage, listAnalyticsSessionPage, setAnalyticsReportingBaseline, clearAnalyticsReportingBaseline } from '../../services/analyticsService.js';
import { createDatabaseBackup, downloadLatestDatabaseBackup, getBackupSchedule, getBackupStatus, saveBackupSchedule } from '../../services/backupService.js';
import { listGiftCardRequests, updateGiftCardRequest } from '../../services/giftCards.js';
import { getOperationalSafeguards, retryRequestNotification, sendWeeklyAdminRecap } from '../../services/operationsService.js';
import { createCustomerReferralCode, disableCustomerReferralCode, listCustomerReferralCodes, referralLink } from '../../services/referrals.js';
import { trackBookingFormOpen, trackEvent, isAnalyticsBrowserExcluded, setAnalyticsBrowserExcluded, markFormFieldStarted, markFormActivity } from '../../analytics.js';
import { buildApprovalReply, buildDeclineReply, replySubject, requestLang, normalizePhoneForWhatsApp, hasLikelyCountryCode } from '../../services/replyMessages.js';
import { publishCustomerNotificationEvent, disableNotifications } from '../../services/notificationService.js';
import { normalizeCurrency, parseMoneyAmount } from '../../utils/money.js';
import { paymentSummary, financeEntryHasBusinessSource, financeEntryIsRecognized, calculateLedgerSummary, buildFinancialReconciliation } from '../../domain/financeModel.js';
import { financeDetailMoney, financeEntryActions } from '../../domain/financeModel.js';
import { ADMIN_ROLES, listAdminUsers, updateAdminUser } from '../../services/adminUsers.js';
import OperationalSafeguardsBanner from '../../features/admin/OperationalSafeguardsBanner.jsx';
import VideoOptimizer from '../../features/admin/media/VideoOptimizer.jsx';
import WeeklyReportsAdminPanel from '../../features/system/WeeklyReportsAdminPanel.jsx';
import { CURRENT_TRACKING_ACTIVATION_MS, SMALL_SAMPLE_VISITOR_THRESHOLD, isCurrentTrackingRecord } from '../../features/analytics/integrity.js';
import { ANALYTICS_PERIODS as CANONICAL_ANALYTICS_PERIODS, analyticsPeriodLabel as canonicalAnalyticsPeriodLabel, analyticsDateRange as canonicalAnalyticsDateRange, summaryToAdminModelPatch, defaultAnalyticsCustomRange } from '../../features/analytics/contract.js';
import AnalyticsHealthPanel from '../../features/analytics/AnalyticsHealthPanel.jsx';
import AnalyticsCanonicalFunnels from '../../features/analytics/AnalyticsCanonicalFunnels.jsx';
import ReviewsPage from '../../features/reviews/ReviewsPage.jsx';
import GoogleReviewsAdminStatus from '../../features/reviews/GoogleReviewsAdminStatus.jsx';
import NotificationsPage from '../../features/notifications/NotificationsPage.jsx';
import AskNeoPanel from '../../features/neo/AskNeoPanel.jsx';
import { normalizeReviewText, reviewSourceLabel } from '../../features/reviews/reviewModel.js';
import useBodyScrollLock from '../../hooks/useBodyScrollLock.js';
import useDialogFocusTrap from '../../hooks/useDialogFocusTrap.js';
import { replaceBilingualAssets } from '../../domain/assetReplacement.js';
import useLatestQuery from '../../hooks/useLatestQuery.js';
import { ADMIN_CONTENT_DEFINITIONS, BRAND, BlockedDatesAttachment, ContactActions, ContactForm, EMAIL, EditableImage, EditableText, ExperienceAccordion, FormattedDescription, FormattedText, Header, Hero, LatestNewsPage, MEDIA, MEDIA_ADMIN_ITEMS, MeetingPointDetailCard, PARTNERSHIP_CATEGORIES, PHONE_TEL, PartnershipsPage, SITE_CONTENT_DEFINITIONS, SOCIAL_LINKS_CONTENT_KEY, SOCIAL_PLATFORM_OPTIONS, SocialPage, Team, adminCopy, adminExperienceLabel, buildBookingTrackingContext, buildFixedExcursionMessage, buildSiteContentMap, cleanHeardAboutUsDetail, contentSettingValue, contentText, dateToIso, defaultSocialLinks, editorContentItem, editorMediaItem, encode, experienceById, experiences, fixedExcursionField, fixedExcursionLabel, fixedExcursionLeafletFile, fixedExcursionProgram, fixedExcursionTitle, formatDateForMessage, formatMoney, getCalendarDays, getContentDefinition, getItemsByDate, getMediaDefinition, heardAboutUsDisplay, heardAboutUsLabel, heardAboutUsOptions, latestNewsContentKey, mediaUrlKindFromValue, monthLabel, monthlyLeafletField, monthlyLeafletFile, needsHeardAboutUsDetail, normalizeGoogleMapsUrl, normalizeHeardAboutUs, normalizeSocialLink, openDefaultEmailApp, parseBooleanSetting, parseSocialLinksJson, partnershipCategoryKey, partnershipCategoryLabel, partnershipCategoryOption, resolveEditableTextStyle, safeExternalUrl, socialLinkLabel, socialPlatformLabel, socialPlatformOption, startOfMonth, text, textStyleClass, todayIso, withBookingJourneyId } from '../../app/siteShared.jsx';
import '../../styles/admin-system.css';
import '../../styles/analytics-consolidated.css';

const ADMIN_NAV_SECTIONS = [
  { key: 'today', path: '/admin/today', labelIt: 'Oggi', labelEn: 'Today', editable: true },
  { key: 'calendar', path: '/admin/calendar', labelIt: 'Calendario', labelEn: 'Calendar', editable: true },
  { key: 'upcoming', path: '/admin/upcoming', labelIt: 'Prossime', labelEn: 'Upcoming', editable: true },
  { key: 'requests', path: '/admin/requests', labelIt: 'Richieste prenotazione', labelEn: 'Booking requests', editable: true },
  { key: 'bookingCodes', path: '/admin/booking-codes', labelIt: 'Codici prenotazione', labelEn: 'Booking codes', editable: true },
  { key: 'giftCards', path: '/admin/gift-cards', labelIt: 'Gift Card', labelEn: 'Gift Cards', editable: true },
  { key: 'notifications', path: '/admin/notifications', labelIt: 'Installazione e notifiche', labelEn: 'Install & notifications', editable: false },
  { key: 'account', path: '/admin/account', labelIt: 'Account', labelEn: 'Account', editable: false },
  { key: 'availability', path: '/admin/availability', labelIt: 'Disponibilità', labelEn: 'Availability', editable: true },
  { key: 'partnerships', path: '/admin/partnerships', labelIt: 'Collaborazioni', labelEn: 'Collaborations', editable: true },
  { key: 'edit', path: '/admin/edit', labelIt: 'Modifica sito e recensioni', labelEn: 'Edit website & reviews', editable: true },
  { key: 'finance', path: '/admin/finance', labelIt: 'Finanze', labelEn: 'Finance', editable: true },
  { key: 'analytics', path: '/admin/analytics', labelIt: 'Analytics', labelEn: 'Analytics', editable: true },
  { key: 'backup', path: '/admin/system/backup', labelIt: 'Sistema e backup', labelEn: 'System & backup', editable: false, ownerOnly: true },
  { key: 'users', path: '/admin/users', labelIt: 'Utenti admin', labelEn: 'Admin users', editable: false, ownerOnly: true },
  { key: 'publicSite', path: '/', labelIt: 'Visualizza sito pubblico', labelEn: 'View public site', editable: true, external: true }
];

const ADMIN_NAV_GROUPS = [
  { key: 'operations', labelIt: 'Operazioni', labelEn: 'Operations', items: ['today', 'upcoming', 'calendar'] },
  { key: 'bookings', labelIt: 'Prenotazioni', labelEn: 'Bookings', items: ['requests', 'bookingCodes', 'giftCards', 'availability', 'notifications'] },
  { key: 'website', labelIt: 'Gestione sito', labelEn: 'Website management', items: ['edit', 'publicSite'] },
  { key: 'business', labelIt: 'Business', labelEn: 'Business', items: ['partnerships', 'finance', 'analytics'] },
  { key: 'system', labelIt: 'Sistema', labelEn: 'System', items: ['account', 'backup', 'users'] }
];

function adminNavLabel(section, lang) {
  return lang === 'it' ? section.labelIt : section.labelEn;
}

function isAdminNavSectionActive(normalizedPath, section) {
  if (!section || section.external) return false;
  if (section.key === 'analytics') return normalizedPath.includes('/analytics') || normalizedPath.includes('/data');
  if (section.key === 'bookingCodes') return normalizedPath.includes('/booking-codes');
  if (section.key === 'giftCards') return normalizedPath.includes('/gift-cards');
  if (section.key === 'backup') return normalizedPath.includes('/system') || normalizedPath.includes('/backup');
  if (section.key === 'users') return normalizedPath.includes('/users');
  if (section.key === 'edit') return normalizedPath.includes('/edit') || normalizedPath.includes('/website') || normalizedPath.includes('/content') || normalizedPath.includes('/media');
  if (section.key === 'partnerships') return normalizedPath.includes('/partnerships');
  return normalizedPath.includes(`/${section.key}`);
}

function adminPathFromLocation(pathname) {
  const normalizedPath = pathname === '/admin' ? '/admin/requests' : pathname;
  return ADMIN_NAV_SECTIONS.find((section) => !section.external && isAdminNavSectionActive(normalizedPath, section))?.path || '/admin/requests';
}

function visibleAdminNavSections(profile) {
  const isOwner = profile?.role === 'owner' && profile?.active !== false;
  return ADMIN_NAV_SECTIONS.filter((section) => !section.ownerOnly || isOwner);
}

const questionnaireOptions = {
  travelingWith: [
    { value: 'solo', it: 'Singolo', en: 'Solo traveler' },
    { value: 'couple-small', it: 'Coppia / piccolo gruppo', en: 'Couple / small group' },
    { value: 'family', it: 'Famiglia', en: 'Family' },
    { value: 'school', it: 'Gruppo scolastico', en: 'School group' },
    { value: 'company', it: 'Azienda / team', en: 'Company / team' }
  ],
  interest: [
    { value: 'private-exclusive', it: 'Esperienza privata ed esclusiva', en: 'Exclusive private experience' },
    { value: 'volcanic-activity', it: 'Attività vulcanica', en: 'Volcanic activity' },
    { value: 'local-culture', it: 'Cultura locale, cibo o workshop', en: 'Local culture, food, or workshops' },
    { value: 'learning', it: 'Apprendimento e contenuto educativo', en: 'Learning and educational content' }
  ],
  pace: [
    { value: 'slow-comfortable', it: 'Lento e confortevole', en: 'Slow and comfortable' },
    { value: 'balanced', it: 'Bilanciato', en: 'Balanced' },
    { value: 'active', it: 'Più attivo', en: 'More active' }
  ],
  private: [
    { value: 'yes', it: 'Sì', en: 'Yes' },
    { value: 'no', it: 'No', en: 'No' }
  ],
  children: [
    { value: 'no', it: 'No', en: 'No' },
    { value: 'yes', it: 'Sì', en: 'Yes' },
    { value: 'under3', it: 'Sì, sotto i 3 anni', en: 'Yes, under 3' }
  ]
};

const statusLabels = {
  available: { it: 'Disponibile', en: 'Available' },
  limited: { it: 'Disponibilità limitata', en: 'Limited availability' },
  closed: { it: 'Non disponibile', en: 'Closed' },
  'on-request': { it: 'Su richiesta', en: 'On request' }
};

function partnershipCategoryLabelsForKey(key) {
  const option = partnershipCategoryOption(key);
  return { category_key: option.key, category_it: option.it, category_en: option.en };
}

function socialLinksToJson(links = []) {
  return JSON.stringify((links || []).map((link, index) => normalizeSocialLink({ ...link, order: link.order || index + 1 }, index)), null, 2);
}

function AdminEditableText({ as: Tag = 'span', itemKey, lang, adminContent, editor, fallback = '', className = '', children }) {
  const source = editor?.contentMap || adminContent || {};
  const item = editorContentItem(source, itemKey, fallback || children || '');
  const hidden = item.active === false || item.visible === false;
  if (hidden && !editor?.isEditing) return null;
  const resolved = contentText(source, itemKey, lang, fallback || children || item.default_it || item.default_en || '');
  const isSelected = editor?.selected?.type === 'text' && editor.selected.key === itemKey;
  return (
    <Tag
      className={`${className} admin-editable-text ${textStyleClass(item)} ${editor?.isEditing ? 'editor-selectable editor-selectable-text admin-editor-selectable-text' : ''} ${hidden ? 'editor-hidden-public' : ''} ${isSelected ? 'selected' : ''}`.trim()}
      onClick={editor?.isEditing ? (event) => {
        event.preventDefault();
        event.stopPropagation();
        editor.select({ type: 'text', key: itemKey, label: lang === 'it' ? item.label_it : item.label_en, section: item.section });
      } : undefined}
      role={editor?.isEditing ? 'button' : undefined}
      tabIndex={editor?.isEditing ? 0 : undefined}
    >
      {editor?.isEditing && <span className="editor-badge">{lang === 'it' ? 'Modifica testo' : 'Edit text'}</span>}
      {resolved || (editor?.isEditing ? (lang === 'it' ? 'Testo vuoto' : 'Empty text') : fallback || children || '')}
    </Tag>
  );
}

function EditableImageSlot({ mediaKey, lang, siteMedia, editor, fallbackSrc, fallbackAlt, ratio = 'standard' }) {
  return (
    <figure className={`image-slot ${ratio}`}>
      <EditableImage mediaKey={mediaKey} lang={lang} siteMedia={siteMedia} editor={editor} fallbackSrc={fallbackSrc} fallbackAlt={fallbackAlt} />
    </figure>
  );
}

function optionLabel(group, value, lang) {
  const option = questionnaireOptions[group].find((item) => item.value === value);
  return option ? option[lang] : value;
}

function validDateFromValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLocalDateTime(value, lang, fallback = '') {
  const date = validDateFromValue(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function buildQuestionnaireMessage(result, lang) {
  const details = result.details;
  if (lang === 'it') {
    return `Ciao Leonardo,\nvorrei informazioni su un’esperienza vulcanIQ sull’Etna.\n\nEsperienza consigliata: ${result.recommended.title}\nAlternativa: ${result.alternative.title}\n\nDettagli:\n- Viaggio con: ${details.travelingWith}\n- Interesse principale: ${details.interest}\n- Ritmo preferito: ${details.pace}\n- Esperienza privata: ${details.private}\n- Bambini nel gruppo: ${details.children}\n\nVorrei sapere disponibilità, durata indicativa, prezzo e consigli sull’abbigliamento.\n\nGrazie.`;
  }
  return `Hi Leonardo,\nI would like more information about a vulcanIQ experience on Mount Etna.\n\nRecommended experience: ${result.recommended.title}\nAlternative: ${result.alternative.title}\n\nDetails:\n- Traveling with: ${details.travelingWith}\n- Main interest: ${details.interest}\n- Preferred pace: ${details.pace}\n- Private experience: ${details.private}\n- Children in the group: ${details.children}\n\nI would like to know availability, approximate duration, price, and clothing recommendations.\n\nThank you.`;
}

function partyTypeLabel(value, lang) {
  const labels = {
    solo: { it: 'Singolo', en: 'Solo traveler' },
    couple: { it: 'Coppia', en: 'Couple' },
    family: { it: 'Famiglia', en: 'Family' },
    group: { it: 'Gruppo', en: 'Group' },
    company: { it: 'Azienda', en: 'Company' },
    school: { it: 'Scuola', en: 'School' },
    other: { it: 'Altro', en: 'Other' }
  };
  return labels[value]?.[lang] || labels.solo[lang];
}

function buildCalendarMessage({ experience, date, status, note }, lang) {
  const dateText = formatDateForMessage(date, lang);
  const statusText = statusLabels[status]?.[lang] || status;
  const noteText = note || (lang === 'it' ? 'In base alle condizioni.' : 'Depending on conditions.');
  if (lang === 'it') {
    return `Ciao Leonardo,\nvorrei informazioni su ${experience.title} per il giorno ${dateText}.\n\nHo visto questa disponibilità sul calendario vulcanIQ:\nStato: ${statusText}\nNota: ${noteText}\n\nVorrei sapere se la data è confermabile e quali sono le condizioni previste.\n\nGrazie.`;
  }
  return `Hi Leonardo,\nI would like information about ${experience.title} for ${dateText}.\n\nI saw this availability on the vulcanIQ calendar:\nStatus: ${statusText}\nNote: ${noteText}\n\nI would like to know whether the date can be confirmed and what conditions are expected.\n\nThank you.`;
}

async function copyText(value) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function ImageSlot({ src, alt, label, lang, ratio = 'wide', className = '' }) {
  const [missing, setMissing] = useState(false);
  return (
    <figure className={`image-slot ${ratio} ${missing ? 'is-missing' : ''} ${className}`.trim()}>
      {!missing && <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setMissing(true)} />}
      {missing && (
        <div className="image-placeholder" aria-label={`${text(lang, 'realPhotoPlaceholder')}: ${src}`}>
          <strong>{text(lang, 'realPhotoPlaceholder')}</strong>
          <span>{text(lang, 'replaceWith')} {src}</span>
        </div>
      )}
    </figure>
  );
}

function BrandLogo({ compact = false, siteMedia, editor }) {
  return (
    <span className={`brand-logo-wrap ${compact ? 'compact' : ''}`}>
      <EditableImage mediaKey="brand_logo_main" lang={editor?.lang || 'it'} siteMedia={siteMedia} editor={editor} fallbackSrc={BRAND.logo} fallbackAlt={editor?.lang === 'en' ? 'vulcanIQ logo — premium Etna experiences' : 'Logo vulcanIQ — esperienze premium sull’Etna'} className="brand-logo" loading="eager" />
    </span>
  );
}

const FIND_EXPERIENCE_INTERESTS = [
  { value: 'lava-activity', it: 'Lava / attività', en: 'Lava / activity', experienceId: 'etna-live' },
  { value: 'geology', it: 'Geologia', en: 'Geology', experienceId: 'etna-learning' },
  { value: 'local-culture', it: 'Cultura locale', en: 'Local culture', experienceId: 'etna-stories' },
  { value: 'photography', it: 'Fotografia', en: 'Photography', experienceId: 'etna-live' },
  { value: 'premium', it: 'Premium', en: 'Premium', experienceId: 'etna-premium' }
];

const FIND_EXPERIENCE_GROUPS = [
  { value: 'solo-couple', it: 'Singolo / coppia', en: 'Solo / couple' },
  { value: 'family', it: 'Famiglia', en: 'Family' },
  { value: 'group', it: 'Gruppo', en: 'Group' },
  { value: 'school-company', it: 'Scuola / azienda', en: 'School / company' }
];

function recommendationFromFindAnswers(interest, group) {
  const selected = FIND_EXPERIENCE_INTERESTS.find((item) => item.value === interest) || FIND_EXPERIENCE_INTERESTS[0];
  if (group === 'school-company' && interest !== 'premium') return experienceById('etna-learning');
  if (group === 'family' && interest === 'lava-activity') return experienceById('etna-learning');
  return experienceById(selected.experienceId);
}

function FindExperienceModal({ lang, onClose, onRequestExperience }) {
  const [step, setStep] = useState(0);
  const [interest, setInterest] = useState('');
  const [group, setGroup] = useState('');
  const modalRef = useRef(null);
  useBodyScrollLock(true);

  useEffect(() => {
    trackEvent('find_experience_started', { language: lang }, { dedupe: false });
    const timer = window.setTimeout(() => modalRef.current?.querySelector('button')?.focus?.(), 0);
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lang, onClose]);

  const selectedExperience = recommendationFromFindAnswers(interest, group);
  const selectedInterest = FIND_EXPERIENCE_INTERESTS.find((item) => item.value === interest);
  const selectedGroup = FIND_EXPERIENCE_GROUPS.find((item) => item.value === group);

  function selectInterest(value) {
    setInterest(value);
    trackEvent('find_experience_interest_selected', { interest: value, language: lang }, { dedupe: false });
  }

  function selectGroup(value) {
    setGroup(value);
    trackEvent('find_experience_group_selected', { group: value, language: lang }, { dedupe: false });
  }

  function goNext() {
    if (step === 0 && !interest) return;
    if (step === 1 && !group) return;
    if (step >= 1) {
      trackEvent('find_experience_completed', { recommended_experience_id: selectedExperience.id, interest, group, language: lang }, { dedupe: false });
    }
    setStep((current) => Math.min(current + 1, 2));
  }

  function requestExperience() {
    onRequestExperience?.(selectedExperience, {
      interest: selectedInterest?.[lang === 'en' ? 'en' : 'it'] || interest,
      group: selectedGroup?.[lang === 'en' ? 'en' : 'it'] || group
    });
  }

  return createPortal((
    <div className="find-experience-backdrop motion-backdrop" role="presentation" onClick={onClose}>
      <section className="find-experience-modal motion-panel" role="dialog" aria-modal="true" aria-labelledby="findExperienceTitle" ref={modalRef} onClick={(event) => event.stopPropagation()}>
        <header className="find-experience-header">
          <div>
            <h2 id="findExperienceTitle">{text(lang, 'findExperience')}</h2>
            <p>{text(lang, 'findExperienceModalIntro')}</p>
          </div>
          <button className="date-modal-close" type="button" onClick={onClose} aria-label={text(lang, 'close')}>{text(lang, 'close')}</button>
        </header>
        <main className="find-experience-body">
          {step === 0 && (
            <section className="find-experience-step" aria-live="polite">
              <h3>{text(lang, 'findExperienceInterestQuestion')}</h3>
              <div className="find-experience-choice-grid">
                {FIND_EXPERIENCE_INTERESTS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`find-experience-choice ${interest === option.value ? 'active' : ''}`}
                    onClick={() => selectInterest(option.value)}
                    aria-pressed={interest === option.value}
                  >
                    {option[lang === 'en' ? 'en' : 'it']}
                  </button>
                ))}
              </div>
            </section>
          )}
          {step === 1 && (
            <section className="find-experience-step" aria-live="polite">
              <h3>{text(lang, 'findExperienceGroupQuestion')}</h3>
              <div className="find-experience-choice-grid compact">
                {FIND_EXPERIENCE_GROUPS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`find-experience-choice ${group === option.value ? 'active' : ''}`}
                    onClick={() => selectGroup(option.value)}
                    aria-pressed={group === option.value}
                  >
                    {option[lang === 'en' ? 'en' : 'it']}
                  </button>
                ))}
              </div>
            </section>
          )}
          {step === 2 && (
            <section className="find-experience-result" aria-live="polite">
              <span className="kicker">{text(lang, 'findExperienceResultTitle')}</span>
              <h3>{selectedExperience.title}</h3>
              <p>{selectedExperience.summary[lang === 'en' ? 'en' : 'it']}</p>
              <dl>
                <div><dt>{text(lang, 'interest')}</dt><dd>{selectedInterest?.[lang === 'en' ? 'en' : 'it'] || '-'}</dd></div>
                <div><dt>{text(lang, 'travelingWith')}</dt><dd>{selectedGroup?.[lang === 'en' ? 'en' : 'it'] || '-'}</dd></div>
              </dl>
              <button className="button primary" type="button" onClick={requestExperience}>{text(lang, 'requestThis')}</button>
            </section>
          )}
        </main>
        <footer className="find-experience-footer">
          <button className="button secondary" type="button" onClick={() => step === 0 ? onClose() : setStep((current) => Math.max(current - 1, 0))}>{text(lang, 'back')}</button>
          {step < 2 && <button className="button primary" type="button" onClick={goNext} disabled={(step === 0 && !interest) || (step === 1 && !group)}>{text(lang, 'next')}</button>}
        </footer>
      </section>
    </div>
  ), document.body);
}

function Philosophy({ lang, siteMedia, editor }) {
  const paragraphs = text(lang, 'philosophyText').split('\n\n');
  return (
    <section className="section compact-section">
      <div className="container philosophy-grid">
        <div className="editorial-card story-card">
          <span className="kicker">{text(lang, 'philosophyKicker')}</span>
          <h2>{text(lang, 'philosophyTitle')}</h2>
          <div className="story-text">
            {paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
        </div>
        <div className="mission-grid">
          <article className="mission-card visual-note">
            <EditableImageSlot mediaKey="mission_main_image" lang={lang} siteMedia={siteMedia} editor={editor} fallbackSrc={MEDIA.landscape} fallbackAlt={text(lang, 'safetyAlt')} ratio="wide" />
          </article>
          <article className="mission-card accent">
            <span>{text(lang, 'vision')}</span>
            <p>{text(lang, 'visionText')}</p>
          </article>
        </div>
      </div>
    </section>
  );
}

function MissionPage({ lang, siteMedia, siteContent, editor }) {
  const missionTitle = contentText(siteContent, 'mission.mission.title', lang, text(lang, 'mission'));
  const visionTitle = contentText(siteContent, 'mission.vision.title', lang, text(lang, 'vision'));
  const missionBody = contentText(siteContent, 'mission.mission.body', lang, text(lang, 'missionText'));
  const visionBody = contentText(siteContent, 'mission.vision.body', lang, text(lang, 'visionText'));

  return (
    <section className="section page-section mission-redesign" id="mission">
      <div className="container mission-balanced-layout">
        <div className="mission-top-row titled-mission-row">
          <div className="mission-card-stack">
            <EditableText as="h2" itemKey="mission.mission.title" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'mission')} />
            <article className="mission-card mission-copy-card balanced-mission-card">
              <EditableText as="p" itemKey="mission.mission.body" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'missionText')} />
            </article>
          </div>
          <div className="mission-card-stack">
            <EditableText as="h2" itemKey="mission.vision.title" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'vision')} />
            <article className="mission-card accent vision-copy-card balanced-mission-card">
              <EditableText as="p" itemKey="mission.vision.body" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'visionText')} />
            </article>
          </div>
        </div>
        <div className="mission-bottom-row mission-image-only-row">
          <article className="mission-image-feature centered-mission-image">
            <EditableImageSlot mediaKey="mission_main_image" lang={lang} siteMedia={siteMedia} editor={editor} fallbackSrc={MEDIA.landscape} fallbackAlt={text(lang, 'safetyAlt')} ratio="wide" />
          </article>
        </div>
      </div>
    </section>
  );
}

function PublicUpcomingExcursions({ lang, fillForm, siteContent, editor }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthDate, setMonthDate] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayIso());

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadPublicFixedExcursions()
      .then((data) => {
        if (!active) return;
        const rows = data || [];
        setItems(rows);
      })
      .catch(() => { if (active) setItems([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const days = useMemo(() => getCalendarDays(monthDate), [monthDate]);
  const byDate = useMemo(() => getItemsByDate(items), [items]);
  const selectedItems = byDate[selectedDate] || [];

  function requestItem(item) {
    const trackingContext = withBookingJourneyId(buildBookingTrackingContext({
      experienceId: item?.experience_id || '',
      requestType: 'fixed',
      sourceSection: 'today',
      sourceCta: 'fixed_excursion',
      ctaLocation: 'today_section',
      selectedDate: item?.date || '',
      hasFixedExcursion: true,
      language: lang
    }));
    trackBookingFormOpen(item?.experience_id || 'fixed', trackingContext);
    const message = buildFixedExcursionMessage({ fixedExcursion: item, people: '' }, lang);
    fillForm({
      experienceId: item.experience_id,
      requestType: 'fixed',
      fixedExcursionId: item.id,
      requestedDate: item.date,
      message,
      trackingContext,
      scroll: true
    });
  }

  function changeMonth(delta) {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function renderDetails(item) {
    const title = fixedExcursionTitle(item, lang);
    const description = fixedExcursionProgram(item, lang) || item[`note_${lang}`] || item.note_it || item.note_en || '';
    const meeting = fixedExcursionField(item, 'meeting_point', lang);
    const difficulty = fixedExcursionField(item, 'difficulty', lang);
    const price = fixedExcursionField(item, 'price_note', lang);
    const timeRange = item.start_time ? `${String(item.start_time).slice(0, 5)}${item.end_time ? `–${String(item.end_time).slice(0, 5)}` : ''}` : text(lang, 'onRequest');
    return (
      <article className="upcoming-card compact-upcoming-card" key={item.id}>
        <div className="selected-date-heading-row">
          <h3>{formatDateForMessage(item.date, lang)}</h3>
          <span>{timeRange}</span>
        </div>
        <h4 className="selected-excursion-title">{title}</h4>
        <FormattedDescription textValue={description || experienceById(item.experience_id).summary[lang]} />
        <dl className="public-details-grid">
          <div><dt>{text(lang, 'experienceLabel')}</dt><dd>{adminExperienceLabel(item.experience_id, lang)}</dd></div>
          <MeetingPointDetailCard item={item} lang={lang} />
          {difficulty && <div><dt>{text(lang, 'difficulty')}</dt><dd>{difficulty}</dd></div>}
          {price && <div><dt>{text(lang, 'priceNote')}</dt><dd>{price}</dd></div>}
          <div><dt>{text(lang, 'placesAvailable')}</dt><dd>{item.places_remaining}/{item.capacity}</dd></div>
        </dl>
        <BlockedDatesAttachment item={item} lang={lang} onOpenFile={(file, label) => openLeafletModal(file, label || text(lang, 'openExcursionProgram'))} />
        <button className="button primary" type="button" onClick={() => requestItem(item)}>{text(lang, 'requestAvailability')}</button>
      </article>
    );
  }

  return (
    <section className="section page-section alt-section" id="upcoming">
      <div className="container">
        <div className="section-header refined-section-header">
          <EditableText as="h2" itemKey="upcoming.page.title" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'upcomingExcursions')} />
          <EditableText as="p" itemKey="upcoming.page.intro" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'availabilityIntro')} />
        </div>
        {loading ? <p>{lang === 'it' ? 'Caricamento...' : 'Loading...'}</p> : (
          <div className="public-calendar-layout">
            <article className="calendar-card public-excursion-calendar">
              <div className="calendar-topline simplified-calendar-header">
                <button type="button" onClick={() => changeMonth(-1)} aria-label={text(lang, 'previousMonth')}>‹</button>
                <h3 className="calendar-month-title">{monthLabel(monthDate, lang)}</h3>
                <button type="button" onClick={() => changeMonth(1)} aria-label={text(lang, 'nextMonth')}>›</button>
              </div>
              <div className="calendar-legend compact-legend">
                <span><i className="legend-dot fixed" />{text(lang, 'availableDates')}</span>
              </div>
              <div className="weekdays" aria-hidden="true">
                {(lang === 'it' ? ['L', 'M', 'M', 'G', 'V', 'S', 'D'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']).map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
              </div>
              <div className="calendar-grid public-calendar-grid">
                {days.map((date) => {
                  const iso = dateToIso(date);
                  const hasFixed = Boolean(byDate[iso]?.length);
                  const outside = date.getMonth() !== monthDate.getMonth();
                  return (
                    <button
                      type="button"
                      key={iso}
                      className={`date-button public-date-button ${outside ? 'outside' : ''} ${hasFixed ? 'has-fixed' : ''} ${selectedDate === iso ? 'selected' : ''}`}
                      onClick={() => setSelectedDate(iso)}
                    >
                      <strong>{date.getDate()}</strong>
                      {hasFixed && <span className="date-marker green-circle" aria-label={text(lang, 'availableDates')} />}
                    </button>
                  );
                })}
              </div>
            </article>
            <aside className="date-detail-panel">
              <span className="micro-label details-label">{text(lang, 'dateDetails')}</span>
              {selectedItems.length === 0 && <h3>{selectedDate ? formatDateForMessage(selectedDate, lang) : text(lang, 'dateDetails')}</h3>}
              {items.length === 0 ? (
                <article className="empty-state-card"><p>{text(lang, 'upcomingEmpty')}</p><button className="button primary" type="button" onClick={() => {
                  const trackingContext = withBookingJourneyId(buildBookingTrackingContext({ requestType: 'private', sourceSection: 'today', sourceCta: 'prepare_request', ctaLocation: 'today_section', language: lang }));
                  trackBookingFormOpen('private', trackingContext);
                  fillForm({ requestType: 'private', trackingContext, scroll: true });
                }}>{text(lang, 'contact')}</button></article>
              ) : selectedItems.length === 0 ? (
                <p>{text(lang, 'noExcursionsOnDate')}</p>
              ) : (
                <div className="selected-excursion-list">{selectedItems.map(renderDetails)}</div>
              )}
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}

function WearReviewsSafety({ lang }) {
  const wearItems = lang === 'it'
    ? ['Scarpe chiuse con buona suola', 'Giacca antivento e strato caldo', 'Acqua personale e protezione solare', 'No abbigliamento fragile o inadatto al terreno lavico']
    : ['Closed shoes with good grip', 'Windproof jacket and warm layer', 'Personal water and sun protection', 'No fragile clothing unsuitable for lava terrain'];
  const safetyItems = lang === 'it'
    ? ['Meteo e visibilità', 'Ordinanze e accessibilità', 'Attività vulcanica reale', 'Età, mobilità e abbigliamento del gruppo']
    : ['Weather and visibility', 'Regulations and access', 'Actual volcanic activity', 'Group age, mobility, and clothing'];
  const review = lang === 'it'
    ? 'Esperienza intensa e ben organizzata sull’Etna. Le indicazioni sull’abbigliamento sono state chiare e il ritmo dell’escursione è rimasto adatto al gruppo, con pause gestite bene e spiegazioni utili sul territorio.'
    : 'A well-organized Etna experience with clear clothing guidance, a suitable pace for the group, well-managed breaks, and useful explanations about the territory.';

  return (
    <>
      <section className="section compact-section" id="safety">
        <div className="container three-column-section">
          <article className="content-card">
            <span className="kicker">{text(lang, 'wearKicker')}</span>
            <h2>{text(lang, 'wearTitle')}</h2>
            <p>{text(lang, 'wearIntro')}</p>
            <ul className="check-list">{wearItems.map((item) => <li key={item}>{item}</li>)}</ul>
            <p className="small-note gear-extra">{text(lang, 'gearExtra')}</p>
          </article>
          <article className="content-card image-info-card">
            <ImageSlot src={MEDIA.liveSafe} alt={text(lang, 'liveAlt')} lang={lang} ratio="wide" />
            <div className="info-card-copy">
              <h3>{lang === 'it' ? 'Distanza sicura, sempre.' : 'Safe distance, always.'}</h3>
              <p>{lang === 'it' ? 'L’itinerario resta flessibile e viene scelto solo dopo una valutazione reale delle condizioni.' : 'The route stays flexible and is chosen only after real assessment of conditions.'}</p>
            </div>
          </article>
          <article className="content-card dark-card readable-safety-card">
            <span className="kicker light">{text(lang, 'safetyKicker')}</span>
            <h2>{text(lang, 'safetyTitle')}</h2>
            <p>{text(lang, 'safetyIntro')}</p>
            <ul className="check-list">{safetyItems.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
        </div>
      </section>
      <section className="section image-strip-section">
        <div className="container gallery-grid detail-gallery">
          <ImageSlot src={MEDIA.landscape} alt={text(lang, 'safetyAlt')} lang={lang} />
          <ImageSlot src={MEDIA.lavaRock} alt={text(lang, 'gallery01Alt')} lang={lang} />
          <ImageSlot src={MEDIA.guide} alt={text(lang, 'gallery02Alt')} lang={lang} />
          <ImageSlot src={MEDIA.naturalLight} alt={text(lang, 'gallery03Alt')} lang={lang} />
        </div>
      </section>
      <section className="section compact-section" id="reviews">
        <div className="container reviews-panel">
          <div className="section-header">
            <h2>{text(lang, 'reviewsTitle')}</h2>
            <p>{text(lang, 'reviewsIntro')}</p>
          </div>
          <article className="testimonial-card">
            {lang === 'it' && <span className="micro-label">{text(lang, 'reviewOriginalLabel')}</span>}
            <blockquote>{review}</blockquote>
            <p className="small-note">Leonardo · Etna experience</p>
          </article>
        </div>
      </section>
    </>
  );
}

function FinalCTA({ lang, siteContent }) {
  return (
    <section className="section final-cta">
      <div className="container final-panel">
        <div>
          <h2>{text(lang, 'finalTitle')}</h2>
          <p>{text(lang, 'finalText')}</p>
        </div>
        <ContactActions lang={lang} compact siteContent={siteContent} />
      </div>
    </section>
  );
}

const REQUEST_STATUSES = ['pending', 'accepted', 'declined', 'cancelled', 'archived'];

const LEAD_STATUSES = ['new_lead', 'contacted', 'waiting_customer', 'quoted', 'deposit_sent', 'deposit_paid', 'confirmed', 'completed', 'review_requested', 'review_received', 'lost', 'cancelled'];

const LEAD_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const LEAD_STATUS_LABELS = {
  new_lead: { it: 'Nuovo lead', en: 'New lead' },
  contacted: { it: 'Contattato', en: 'Contacted' },
  waiting_customer: { it: 'In attesa cliente', en: 'Waiting customer' },
  quoted: { it: 'Preventivo inviato', en: 'Quoted' },
  deposit_sent: { it: 'Acconto richiesto', en: 'Deposit sent' },
  deposit_paid: { it: 'Acconto pagato', en: 'Deposit paid' },
  confirmed: { it: 'Confermato', en: 'Confirmed' },
  completed: { it: 'Completato', en: 'Completed' },
  review_requested: { it: 'Recensione richiesta', en: 'Review requested' },
  review_received: { it: 'Recensione ricevuta', en: 'Review received' },
  lost: { it: 'Perso', en: 'Lost' },
  cancelled: { it: 'Annullato', en: 'Cancelled' }
};

const LEAD_PRIORITY_LABELS = {
  low: { it: 'Bassa', en: 'Low' },
  normal: { it: 'Normale', en: 'Normal' },
  high: { it: 'Alta', en: 'High' },
  urgent: { it: 'Urgente', en: 'Urgent' }
};

function leadStatusLabel(status, lang) { return LEAD_STATUS_LABELS[status]?.[lang] || status || '-'; }

function leadPriorityLabel(priority, lang) { return LEAD_PRIORITY_LABELS[priority]?.[lang] || priority || '-'; }

function requestMoneyValue(request) { return parseMoneyAmount(request.quoted_amount ?? request.expected_value ?? 0); }

function isRequestConfirmedRevenue(request) {
  if (request.source === 'booking_code') return false;
  return ['accepted', 'confirmed', 'completed'].includes(request.status) || ['confirmed', 'completed', 'deposit_paid', 'review_requested', 'review_received'].includes(request.lead_status);
}

function isRequestLost(request) { return ['declined', 'cancelled', 'archived'].includes(request.status) || ['lost', 'cancelled'].includes(request.lead_status); }

const PARTNER_COMMISSION_STATUSES = ['pending', 'approved', 'paid', 'cancelled'];

const PARTNER_COMMISSION_STATUS_LABELS = {
  pending: { it: 'In attesa', en: 'Pending' },
  approved: { it: 'Approvata non pagata', en: 'Approved unpaid' },
  paid: { it: 'Pagata', en: 'Paid' },
  cancelled: { it: 'Annullata', en: 'Cancelled' }
};

const PARTNER_COMMISSION_TYPE_LABELS = {
  none: { it: 'Nessuna', en: 'None' },
  fixed_amount: { it: 'Importo fisso', en: 'Fixed amount' },
  percentage: { it: 'Percentuale', en: 'Percentage' }
};

const PARTNER_COMMISSION_APPLIES_TO_LABELS = {
  request_created: { it: 'Richiesta creata', en: 'Request created' },
  booking_confirmed: { it: 'Prenotazione confermata', en: 'Booking confirmed' },
  revenue_confirmed: { it: 'Pagamento registrato', en: 'Recorded payment' }
};

function partnerCommissionStatusLabel(status, lang) { return PARTNER_COMMISSION_STATUS_LABELS[status]?.[lang] || status || '-'; }

function partnerCommissionTypeLabel(type, lang) { return PARTNER_COMMISSION_TYPE_LABELS[type]?.[lang] || type || '-'; }

function partnerCommissionAppliesToLabel(value, lang) { return PARTNER_COMMISSION_APPLIES_TO_LABELS[value]?.[lang] || value || '-'; }

function partnerCommissionRuleLabel(item, lang) {
  if (!item || item.commission_enabled === false || item.commission_type === 'none') return adminCopy(lang, 'Nessuna commissione', 'No commission');
  if (item.commission_type === 'percentage') return `${parseMoneyAmount(item.commission_value)}%`;
  if (item.commission_type === 'fixed_amount') return formatMoney(item.commission_value, item.commission_currency || item.currency || 'EUR', lang);
  return partnerCommissionTypeLabel(item.commission_type, lang);
}

function partnerCommissionEligibleForRequest(request = {}, partner = {}) {
  const appliesTo = partner?.commission_applies_to || 'revenue_confirmed';
  if (appliesTo === 'request_created') return true;
  if (appliesTo === 'booking_confirmed') return isRequestConfirmedRevenue(request);
  return isRequestConfirmedRevenue(request) && requestMoneyValue(request) > 0;
}

function partnerCommissionGrossAmountForRequest(request = {}) { return requestMoneyValue(request); }

function partnerCommissionSourceLabel(item = {}, lang) {
  if (item.source_type === 'booking_request') return adminCopy(lang, 'Richiesta', 'Request');
  if (item.source_type === 'booking_code') return adminCopy(lang, 'Codice prenotazione', 'Booking code');
  if (item.source_type === 'manual_booking') return adminCopy(lang, 'Prenotazione manuale', 'Manual booking');
  if (item.source_type === 'gift_card') return 'Gift Card';
  return item.source_type || '-';
}

function requestSourceKey(request) {
  if (request.referral_code || request.referral_source === 'customer_referral') return 'customer_referral';
  if (request.source === 'booking_code') return 'booking_code';
  if (request.source) return request.source;
  if (request.utm_source === 'referral') return 'referral';
  return request.utm_source || request.heard_about_us || 'unknown';
}

function requestExperienceKey(request, lang) { return adminExperienceLabel(request.experience_id, lang) || request.experience_id || 'unknown'; }

function buildRequestsCrmSummary(requests, lang) {
  const now = new Date();
  const today = todayIso();
  const due = requests.filter((request) => request.next_follow_up_at && String(request.next_follow_up_at).slice(0, 10) <= today && !isRequestLost(request));
  const overdue = due.filter((request) => new Date(request.next_follow_up_at) < new Date(`${today}T00:00:00`));
  const confirmed = requests.filter((request) => isRequestConfirmedRevenue(request) && !isRequestLost(request));
  const pipeline = requests.filter((request) => !isRequestLost(request) && !isRequestConfirmedRevenue(request));
  const confirmedRevenue = confirmed.reduce((sum, request) => sum + requestMoneyValue(request), 0);
  const expectedPipeline = pipeline.reduce((sum, request) => sum + requestMoneyValue(request), 0);
  const sourceMap = new Map();
  const experienceMap = new Map();
  confirmed.forEach((request) => {
    sourceMap.set(requestSourceKey(request), (sourceMap.get(requestSourceKey(request)) || 0) + requestMoneyValue(request));
    experienceMap.set(requestExperienceKey(request, lang), (experienceMap.get(requestExperienceKey(request, lang)) || 0) + requestMoneyValue(request));
  });
  return {
    total: requests.length,
    due: due.length,
    overdue: overdue.length,
    confirmedRevenue,
    expectedPipeline,
    averageBookingValue: confirmed.length ? confirmedRevenue / confirmed.length : 0,
    leadToConfirmedRate: requests.length ? (confirmed.length / requests.length) * 100 : 0,
    highPriority: requests.filter((request) => ['high', 'urgent'].includes(request.lead_priority)).length,
    lost: requests.filter(isRequestLost).length,
    sourceBreakdown: [...sourceMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    experienceBreakdown: [...experienceMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    generatedAt: now.toISOString()
  };
}

const REQUEST_SOURCES = ['website', 'whatsapp', 'phone', 'email', 'manual', 'booking_code', 'referral', 'customer_referral'];

const ADMIN_EXPERIENCE_OPTIONS = ['etna-premium', 'etna-learning', 'etna-live', 'etna-stories', 'unsure'];

const AVAILABILITY_STATUSES = ['closed', 'limited', 'on-request'];

const requestStatusLabels = {
  pending: { it: 'In attesa', en: 'Pending' },
  accepted: { it: 'Accettata', en: 'Accepted' },
  declined: { it: 'Rifiutata', en: 'Declined' },
  cancelled: { it: 'Annullata', en: 'Cancelled' },
  archived: { it: 'Archiviata', en: 'Archived' }
};

const adminAvailabilityStatusLabels = {
  closed: { it: 'Non disponibile', en: 'Closed' },
  limited: { it: 'Disponibilità limitata', en: 'Limited availability' },
  'on-request': { it: 'Su richiesta', en: 'On request' }
};

function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateToIso(date);
}

function ownerDisplayName(profile, lang) {
  return profile?.full_name || adminCopy(lang, 'Co-owner vulcanIQ', 'vulcanIQ Co-owner');
}

function AdminLogin({ lang, setLang, navigate }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInOwner({ email: email.trim(), password });
      const access = await getAdminAccess();
      if (!access.isAdmin) {
        await signOutOwner();
        setError(adminCopy(lang, 'Accesso negato: questo utente non è un owner attivo.', 'Access denied: this user is not an active owner.'));
        return;
      }
      const returnPath = window.sessionStorage.getItem('vulcaniq.admin.returnPath');
      window.sessionStorage.removeItem('vulcaniq.admin.returnPath');
      navigate(returnPath?.startsWith('/admin') && returnPath !== '/admin/login' && returnPath !== '/admin/reset-password' ? returnPath : '/admin/requests');
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Login non riuscito.', 'Login failed.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleRecovery(event) {
    event.preventDefault();
    setLoading(true); setError(''); setRecoveryMessage('');
    try {
      await requestAdminPasswordReset(email, `${window.location.origin}/admin/reset-password`);
    } catch {
      // A neutral response prevents account enumeration. Delivery/configuration is verified operationally.
    } finally {
      setRecoveryMessage(adminCopy(lang, 'Se esiste un account per questa email, sono state inviate le istruzioni per reimpostare la password.', 'If an account exists for this email, password reset instructions have been sent.'));
      setLoading(false);
    }
  }

  return (
    <main className="admin-login-shell">
      <section className="admin-login-card" aria-labelledby="adminLoginTitle">
        <div>
          <span className="kicker">{adminCopy(lang, 'Area owner', 'Owner area')}</span>
          <h1 id="adminLoginTitle">{adminCopy(lang, 'Accesso admin', 'Admin login')}</h1>
          <p>{adminCopy(lang, 'Accesso riservato agli amministratori attivi di vulcanIQ secondo il ruolo assegnato.', 'Access is restricted to active vulcanIQ administrators according to their assigned role.')}</p>
        </div>
        {!isSupabaseConfigured && (
          <div className="admin-alert warning">
            {adminCopy(lang, 'Supabase non è configurato. Aggiungi VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.', 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')}
          </div>
        )}
        <form className="admin-form" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="adminEmail">Email</label>
          <input id="adminEmail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          <label className="field-label" htmlFor="adminPassword">Password</label>
          <input id="adminPassword" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          <button className="admin-forgot-password" type="button" onClick={() => { setRecoveryOpen((open) => !open); setRecoveryMessage(''); }}>{adminCopy(lang, 'Password dimenticata?', 'Forgot password?')}</button>
          {error && <div className="admin-alert error" role="alert">{error}</div>}
          <button className="button primary admin-wide-button" type="submit" disabled={loading || !isSupabaseConfigured}>{loading ? adminCopy(lang, 'Accesso...', 'Signing in...') : adminCopy(lang, 'Entra', 'Sign in')}</button>
        </form>
        {recoveryOpen && <form className="admin-form admin-recovery-form" onSubmit={handleRecovery} aria-label={adminCopy(lang, 'Recupero password', 'Password recovery')}><p>{adminCopy(lang, 'Inserisci l’email Admin. Il link sicuro sarà generato da Supabase Auth.', 'Enter the Admin email. The secure link will be generated by Supabase Auth.')}</p><label className="field-label" htmlFor="adminRecoveryEmail">Email</label><input id="adminRecoveryEmail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />{recoveryMessage && <div className="admin-alert success" role="status">{recoveryMessage}</div>}<button className="button secondary admin-wide-button" type="submit" disabled={loading || !isSupabaseConfigured}>{adminCopy(lang, 'Invia istruzioni', 'Send instructions')}</button></form>}
        <div className="admin-login-actions">
          <button className="button secondary" type="button" onClick={() => setLang(lang === 'it' ? 'en' : 'it')}>{lang === 'it' ? 'English' : 'Italiano'}</button>
          <a className="button secondary" href="/">{adminCopy(lang, 'Torna al sito', 'Back to public site')}</a>
        </div>
      </section>
    </main>
  );
}

function passwordValidationMessage(password, confirmation, lang) {
  if (password.length < 12) return adminCopy(lang, 'Usa almeno 12 caratteri.', 'Use at least 12 characters.');
  if (password !== confirmation) return adminCopy(lang, 'Le password non coincidono.', 'Passwords do not match.');
  return '';
}

function AdminResetPassword({ lang, navigate }) {
  const [state, setState] = useState({ loading: true, valid: false, error: '' });
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    getAdminAccess().then((access) => { if (alive) setState({ loading: false, valid: Boolean(access.session), error: '' }); }).catch(() => { if (alive) setState({ loading: false, valid: false, error: 'invalid' }); });
    return () => { alive = false; };
  }, []);
  async function submit(event) {
    event.preventDefault(); const validation = passwordValidationMessage(password, confirmation, lang); if (validation) { setState((current) => ({ ...current, error: validation })); return; }
    setSaving(true); setState((current) => ({ ...current, error: '' }));
    try { await updateCurrentAdminPassword(password); setState({ loading: false, valid: true, error: 'success' }); window.setTimeout(() => navigate('/admin'), 900); }
    catch { setState((current) => ({ ...current, error: adminCopy(lang, 'Link scaduto o aggiornamento non riuscito. Richiedi un nuovo link.', 'Expired link or update failed. Request a new link.') })); }
    finally { setSaving(false); }
  }
  if (state.loading) return <main className="admin-loading"><p>{adminCopy(lang, 'Verifica del link di recupero…', 'Checking recovery link…')}</p></main>;
  if (!state.valid) return <main className="admin-login-shell"><section className="admin-login-card"><h1>{adminCopy(lang, 'Link non valido o scaduto', 'Invalid or expired link')}</h1><p>{adminCopy(lang, 'Torna al login e richiedi nuove istruzioni.', 'Return to login and request new instructions.')}</p><button className="button primary" type="button" onClick={() => navigate('/admin/login')}>{adminCopy(lang, 'Torna al login', 'Back to login')}</button></section></main>;
  return <main className="admin-login-shell"><section className="admin-login-card"><span className="kicker">vulcanIQ Admin</span><h1>{adminCopy(lang, 'Scegli una nuova password', 'Choose a new password')}</h1><form className="admin-form" onSubmit={submit}><label htmlFor="newAdminPassword">{adminCopy(lang, 'Nuova password', 'New password')}</label><input id="newAdminPassword" type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required/><label htmlFor="confirmAdminPassword">{adminCopy(lang, 'Conferma password', 'Confirm password')}</label><input id="confirmAdminPassword" type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required/>{state.error === 'success' ? <div className="admin-alert success" role="status">{adminCopy(lang, 'Password aggiornata. Ritorno all’area Admin…', 'Password updated. Returning to Admin…')}</div> : state.error && <div className="admin-alert error" role="alert">{state.error}</div>}<button className="button primary" type="submit" disabled={saving}>{saving ? adminCopy(lang, 'Aggiornamento…', 'Updating…') : adminCopy(lang, 'Aggiorna password', 'Update password')}</button></form></section></main>;
}

function AdminRouter({ pathname, navigate, lang, setLang }) {
  if (pathname === '/admin/login') {
    return <AdminLogin lang={lang} setLang={setLang} navigate={navigate} />;
  }

  if (pathname === '/admin/reset-password') {
    return <AdminResetPassword lang={lang} navigate={navigate} />;
  }

  return <ProtectedAdminArea pathname={pathname} navigate={navigate} lang={lang} setLang={setLang} />;
}

function ProtectedAdminArea({ pathname, navigate, lang, setLang }) {
  const [state, setState] = useState({ loading: true, session: null, profile: null, error: '' });

  useEffect(() => {
    let alive = true;
    let accessRequest = 0;

    async function checkAccess() {
      const request = ++accessRequest;
      if (!isSupabaseConfigured) {
        setState({ loading: false, session: null, profile: null, error: 'supabase-missing' });
        return;
      }

      try {
        const access = await getAdminAccess();
        if (!alive || request !== accessRequest) return;
        if (!access.session) {
          setState({ loading: false, session: null, profile: null, error: 'signed-out' });
          if (pathname !== '/admin/login' && pathname !== '/admin/reset-password') window.sessionStorage.setItem('vulcaniq.admin.returnPath', pathname);
          navigate('/admin/login');
          return;
        }
        setState({ loading: false, session: access.session, profile: access.profile, error: access.isAdmin ? '' : 'not-admin' });
      } catch (err) {
        if (alive && request === accessRequest) setState({ loading: false, session: null, profile: null, error: 'access-error' });
      }
    }

    checkAccess();
    // Never await nested auth calls inside Supabase's auth callback.
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      accessRequest += 1;
      setState({ loading: Boolean(session), session: null, profile: null, error: session ? '' : 'signed-out' });
      if (session) setTimeout(() => { if (alive) checkAccess(); }, 0);
      else navigate('/admin/login');
    }).data.subscription;
    const recheck = () => { if (document.visibilityState === 'visible') checkAccess(); };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      alive = false;
      accessRequest += 1;
      subscription?.unsubscribe();
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [navigate, pathname]);

  if (state.loading) {
    return <main className="admin-loading"><span className="kicker">vulcanIQ</span><p>{adminCopy(lang, 'Controllo accesso...', 'Checking access...')}</p></main>;
  }

  if (state.error === 'supabase-missing') {
    return (
      <main className="admin-loading">
        <span className="kicker">Setup</span>
        <h1>{adminCopy(lang, 'Supabase non configurato', 'Supabase is not configured')}</h1>
        <p>{adminCopy(lang, 'Aggiungi le variabili VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY in Cloudflare Pages e in locale.', 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Cloudflare Pages and locally.')}</p>
        <a className="button primary" href="/">{adminCopy(lang, 'Torna al sito', 'Back to public site')}</a>
      </main>
    );
  }

  if (state.error) {
    return (
      <main className="admin-loading">
        <span className="kicker">Accesso</span>
        <h1>{adminCopy(lang, 'Accesso negato', 'Access denied')}</h1>
        <p>{state.error === 'not-admin' ? adminCopy(lang, 'Il tuo account non ha un ruolo amministrativo attivo.', 'Your account does not have an active administrative role.') : adminCopy(lang, 'Accedi nuovamente per verificare i permessi.', 'Sign in again to verify access.')}</p>
        <button className="button secondary" type="button" onClick={() => navigate('/admin/login')}>{adminCopy(lang, 'Vai al login', 'Go to login')}</button>
      </main>
    );
  }

  return <AdminLayout key={state.session?.user?.id} pathname={pathname} navigate={navigate} lang={lang} setLang={setLang} session={state.session} profile={state.profile} />;
}

function AdminMenuDropdown({ lang, visibleSections, normalizedPath, currentNavValue, navigate, safeguards }) {
  const [open, setOpen] = useState(false);
  const shellRef = useRef(null);
  const sectionByKey = useMemo(() => visibleSections.reduce((acc, section) => ({ ...acc, [section.key]: section }), {}), [visibleSections]);
  const currentSection = visibleSections.find((section) => !section.external && section.path === currentNavValue)
    || visibleSections.find((section) => !section.external && isAdminNavSectionActive(normalizedPath, section))
    || visibleSections.find((section) => section.key === 'today');
  const currentLabel = currentSection ? adminNavLabel(currentSection, lang) : adminCopy(lang, 'Oggi', 'Today');

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!shellRef.current?.contains(event.target)) setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function openSection(section) {
    setOpen(false);
    if (!section?.external) navigate(section.path);
  }

  return (
    <div className="admin-menu-shell" ref={shellRef}>
      <button
        className="admin-menu-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {adminCopy(lang, 'Menu', 'Menu')} <span aria-hidden="true">▾</span>
      </button>
      <span className="admin-menu-current"><span>{adminCopy(lang, 'Sezione', 'Current')}</span>{currentLabel}</span>
      {open && (
        <div className="admin-menu-dropdown" role="menu" aria-label={adminCopy(lang, 'Navigazione admin', 'Admin navigation')}>
          {ADMIN_NAV_GROUPS.map((group) => {
            const groupItems = group.items.map((key) => sectionByKey[key]).filter(Boolean);
            if (!groupItems.length) return null;
            return (
              <section className="admin-menu-group" key={group.key}>
                <h2 className="admin-menu-group-title">{lang === 'it' ? group.labelIt : group.labelEn}</h2>
                <div className="admin-menu-group-items">
                  {groupItems.map((section) => {
                    const active = !section.external && isAdminNavSectionActive(normalizedPath, section);
                    return section.external ? (
                      <a
                        key={section.key}
                        className="admin-menu-item"
                        href={section.path}
                        target="_blank"
                        rel="noopener noreferrer"
                        role="menuitem"
                        onClick={() => setOpen(false)}
                      >
                        {adminNavLabel(section, lang)}
                      </a>
                    ) : (
                      <button
                        key={section.key}
                        className={`admin-menu-item ${active ? 'admin-menu-item-active' : ''}`}
                        type="button"
                        role="menuitem"
                        aria-current={active ? 'page' : undefined}
                        onClick={() => openSection(section)}
                      >
                        <span>{adminNavLabel(section, lang)}</span>
                        {section.key === 'requests' && Number(safeguards?.pending_requests || 0) > 0 && <strong className="admin-nav-badge">{safeguards.pending_requests}</strong>}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminUsersPage({ lang }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const savingUserRef = useRef(false);
  const [savingUser, setSavingUser] = useState(false);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      setUsers(await listAdminUsers());
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Utenti non caricati.', 'Users not loaded.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function save(user, changes) {
    if (savingUserRef.current) return;
    const changeLabel = changes.role !== undefined
      ? `${user.role} → ${changes.role}`
      : changes.active ? adminCopy(lang, 'Riattiva account', 'Reactivate account') : adminCopy(lang, 'Disattiva account', 'Deactivate account');
    if (!window.confirm(`${adminCopy(lang, 'Confermare la modifica per', 'Confirm change for')} ${user.email || user.full_name || user.user_id}?\n${changeLabel}`)) return;
    savingUserRef.current = true;
    setSavingUser(true);
    setError('');
    setFeedback('');
    try {
      await updateAdminUser(user.user_id, { ...changes, expected_updated_at: user.updated_at });
      setFeedback(adminCopy(lang, 'Utente aggiornato.', 'User updated.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Aggiornamento non riuscito.', 'Update failed.'));
    } finally {
      savingUserRef.current = false;
      setSavingUser(false);
    }
  }

  return (
    <section className="admin-panel admin-users-page">
      <div className="admin-panel-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Owner only', 'Owner only')}</span>
          <h1>{adminCopy(lang, 'Utenti admin', 'Admin users')}</h1>
          <p>{adminCopy(lang, 'Gestisci ruoli e stato degli account già presenti in Supabase Auth. La creazione sicura di nuovi account resta manuale in Supabase.', 'Manage roles and status for accounts already present in Supabase Auth. Secure creation of new accounts remains manual in Supabase.')}</p>
        </div>
      </div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      <div className="admin-users-help">
        <button className="button secondary admin-users-details-button" type="button" onClick={() => setDetailsOpen((open) => !open)}>
          {detailsOpen ? adminCopy(lang, 'Nascondi dettagli', 'Hide details') : adminCopy(lang, 'Dettagli aggiunta utente', 'User creation details')}
        </button>
        {detailsOpen && (
          <div className="admin-alert warning admin-users-details-panel">
            {adminCopy(lang, 'Per aggiungere un nuovo utente: crea prima l’utente in Supabase Auth, poi inserisci o aggiorna il profilo in admin_profiles con ruolo e active=true. Non usare mai service-role key nel frontend.', 'To add a new user: first create the user in Supabase Auth, then insert or update the profile in admin_profiles with role and active=true. Never use a service-role key in the frontend.')}
          </div>
        )}
      </div>
      {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : (
        <div className="admin-table-wrap admin-users-table">
          <table className="admin-table">
            <thead><tr><th>{adminCopy(lang, 'Nome', 'Name')}</th><th>Email</th><th>{adminCopy(lang, 'Ruolo', 'Role')}</th><th>{adminCopy(lang, 'Attivo', 'Active')}</th><th>{adminCopy(lang, 'Ultimo accesso', 'Last seen')}</th><th>{adminCopy(lang, 'Azioni', 'Actions')}</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.user_id}>
                  <td data-label={adminCopy(lang, 'Nome', 'Name')}>{user.full_name || '-'}</td>
                  <td data-label="Email">{user.email || '-'}</td>
                  <td data-label={adminCopy(lang, 'Ruolo', 'Role')}><select disabled={savingUser} value={user.role || 'manager'} onChange={(event) => save(user, { role: event.target.value })}>{ADMIN_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></td>
                  <td data-label={adminCopy(lang, 'Attivo', 'Active')}>{user.active === false ? adminCopy(lang, 'No', 'No') : adminCopy(lang, 'Sì', 'Yes')}</td>
                  <td data-label={adminCopy(lang, 'Ultimo accesso', 'Last seen')}>{user.last_seen_at ? new Date(user.last_seen_at).toLocaleString(lang === 'it' ? 'it-IT' : 'en-GB') : '-'}</td>
                  <td data-label={adminCopy(lang, 'Azioni', 'Actions')}><button className="button secondary" type="button" disabled={savingUser} onClick={() => save(user, { active: user.active === false })}>{user.active === false ? adminCopy(lang, 'Riattiva', 'Reactivate') : adminCopy(lang, 'Disattiva', 'Deactivate')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AdminAccountPage({ lang, session, onSignOut }) {
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  async function submit(event) {
    event.preventDefault(); setMessage(''); const validation = passwordValidationMessage(password, confirmation, lang); if (validation) { setError(validation); return; }
    setSaving(true); setError('');
    try { await updateCurrentAdminPassword(password); setPassword(''); setConfirmation(''); setMessage(adminCopy(lang, 'Password aggiornata.', 'Password updated.')); }
    catch { setError(adminCopy(lang, 'Aggiornamento password non riuscito.', 'Password update failed.')); }
    finally { setSaving(false); }
  }
  return <section className="admin-panel admin-account-page"><div className="admin-panel-header"><div><span className="kicker">vulcanIQ Admin</span><h1>Account</h1><p>{adminCopy(lang, 'Gestisci le credenziali del tuo account Supabase Auth.', 'Manage your Supabase Auth account credentials.')}</p></div></div><div className="admin-card-grid"><article className="admin-card"><h2>Email</h2><p>{session?.user?.email || '-'}</p></article><article className="admin-card"><h2>{adminCopy(lang, 'Cambia password', 'Change password')}</h2><form className="admin-form" onSubmit={submit}><label htmlFor="accountPassword">{adminCopy(lang, 'Nuova password', 'New password')}</label><input id="accountPassword" type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required/><label htmlFor="accountPasswordConfirmation">{adminCopy(lang, 'Conferma password', 'Confirm password')}</label><input id="accountPasswordConfirmation" type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required/>{message && <div className="admin-alert success" role="status">{message}</div>}{error && <div className="admin-alert error" role="alert">{error}</div>}<button className="button primary" type="submit" disabled={saving}>{adminCopy(lang, 'Aggiorna password', 'Update password')}</button></form></article><article className="admin-card"><h2>{adminCopy(lang, 'Sessione', 'Session')}</h2><button className="button secondary" type="button" onClick={onSignOut}>{adminCopy(lang, 'Esci da vulcanIQ Admin', 'Sign out of vulcanIQ Admin')}</button></article></div></section>;
}

function AdminLayout({ pathname, navigate, lang, setLang, session, profile }) {
  const normalizedPath = pathname === '/admin' ? '/admin/requests' : pathname;
  const currentAdminPath = adminPathFromLocation(pathname);
  const visibleSections = visibleAdminNavSections(profile);
  const currentNavValue = visibleSections.some((section) => section.path === currentAdminPath) ? currentAdminPath : '/admin/requests';
  const isOwner = profile?.role === 'owner' && profile?.active !== false;
  const isBackupPage = normalizedPath.includes('/system') || normalizedPath.includes('/backup');
  const isUsersPage = normalizedPath.includes('/users');

  const [adminContentRows, setAdminContentRows] = useState([]);
  const [globalBackupProgress, setGlobalBackupProgress] = useState(inactiveBackupProgress);
  const [operationalSafeguards, setOperationalSafeguards] = useState(null);
  const [weeklyRecapState, setWeeklyRecapState] = useState({ loading: false, message: '' });
  const backupMonitorRef = useRef({ interval: null, timeout: null, requestedAt: '' });

  function clearBackupMonitorTimers() {
    if (backupMonitorRef.current.interval) window.clearInterval(backupMonitorRef.current.interval);
    if (backupMonitorRef.current.timeout) window.clearTimeout(backupMonitorRef.current.timeout);
    backupMonitorRef.current.interval = null;
    backupMonitorRef.current.timeout = null;
  }

  function stopBackupMonitor(delay = 0) {
    clearBackupMonitorTimers();
    storeBackupRequestedAt('');
    if (delay > 0) {
      backupMonitorRef.current.timeout = window.setTimeout(() => setGlobalBackupProgress(inactiveBackupProgress()), delay);
    } else {
      setGlobalBackupProgress(inactiveBackupProgress());
    }
  }

  async function pollGlobalBackupStatus(requestedAt, immediate = false) {
    try {
      const result = await getBackupStatus({ lang, includeMetadata: false });
      const nextProgress = backupProgressFromStatus(result, requestedAt, lang);
      setGlobalBackupProgress(nextProgress);
      if (nextProgress.done) {
        window.dispatchEvent(new CustomEvent('vulcaniq-backup-status-updated', { detail: result }));
        stopBackupMonitor(nextProgress.failed ? 0 : 4500);
      }
    } catch (error) {
      if (immediate) {
        setGlobalBackupProgress({
          active: true,
          value: 25,
          title: adminCopy(lang, 'Backup avviato', 'Backup started'),
          detail: adminCopy(lang, 'Stato workflow non ancora disponibile.', 'Workflow status is not available yet.'),
          failed: false,
          done: false
        });
      }
    }
  }

  function startGlobalBackupMonitor(requestedAt, initialProgress) {
    const safeRequestedAt = requestedAt || new Date().toISOString();
    clearBackupMonitorTimers();
    backupMonitorRef.current.requestedAt = safeRequestedAt;
    storeBackupRequestedAt(safeRequestedAt);
    setGlobalBackupProgress(initialProgress || {
      active: true,
      value: 10,
      title: adminCopy(lang, 'Backup in esecuzione', 'Backup in progress'),
      detail: adminCopy(lang, 'GitHub Actions sta creando il dump e preparando lo ZIP.', 'GitHub Actions is creating the dump and preparing the ZIP.'),
      failed: false,
      done: false
    });
    pollGlobalBackupStatus(safeRequestedAt, true);
    backupMonitorRef.current.interval = window.setInterval(() => pollGlobalBackupStatus(safeRequestedAt), 5000);
  }

  useEffect(() => {
    function handleBackupMonitorStart(event) {
      startGlobalBackupMonitor(event.detail?.requestedAt, event.detail?.progress);
    }
    window.addEventListener('vulcaniq-backup-monitor-start', handleBackupMonitorStart);
    const storedRequestedAt = readStoredBackupRequestedAt();
    if (storedRequestedAt) {
      startGlobalBackupMonitor(storedRequestedAt, {
        active: true,
        value: 35,
        title: adminCopy(lang, 'Backup in esecuzione', 'Backup in progress'),
        detail: adminCopy(lang, 'GitHub Actions sta creando il dump e preparando lo ZIP.', 'GitHub Actions is creating the dump and preparing the ZIP.'),
        failed: false,
        done: false
      });
    } else if (isOwner && isSupabaseConfigured) {
      getBackupStatus({ lang, includeMetadata: false }).then((result) => {
        const run = result?.workflowRun;
        if (!isBackupWorkflowActive(run)) return;
        startGlobalBackupMonitor(run.createdAt || run.runStartedAt || new Date().toISOString(), backupProgressFromStatus(result, run.createdAt || run.runStartedAt || new Date().toISOString(), lang));
      }).catch(() => {});
    }
    return () => {
      window.removeEventListener('vulcaniq-backup-monitor-start', handleBackupMonitorStart);
      clearBackupMonitorTimers();
    };
  }, [lang, isOwner]);


  useEffect(() => {
    if (pathname === '/admin') navigate('/admin/requests');
  }, [pathname, navigate]);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!isSupabaseConfigured) {
        if (alive) setAdminContentRows([]);
        return;
      }
      try {
        const rows = await listSiteContent({ activeOnly: false });
        if (alive) setAdminContentRows(rows.filter((row) => String(row.content_key || '').startsWith('admin.')));
      } catch (err) {
        if (alive) setAdminContentRows([]);
      }
    }
    function handleAdminContentUpdated() {
      load();
    }
    load();
    window.addEventListener('vulcaniq-admin-content-updated', handleAdminContentUpdated);
    return () => {
      alive = false;
      window.removeEventListener('vulcaniq-admin-content-updated', handleAdminContentUpdated);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function refreshSafeguards() {
      try {
        const result = await getOperationalSafeguards();
        if (alive) setOperationalSafeguards(result);
      } catch {
        if (alive) setOperationalSafeguards(null);
      }
    }
    refreshSafeguards();
    const interval = window.setInterval(refreshSafeguards, 60000);
    return () => { alive = false; window.clearInterval(interval); };
  }, [normalizedPath]);

  async function sendWeeklyRecapTest() {
    setWeeklyRecapState({ loading: true, message: '' });
    try {
      const result = await sendWeeklyAdminRecap({ testMode: true, force: true });
      setWeeklyRecapState({ loading: false, message: adminCopy(lang, `Report di test inviati: ${result.sent || 0}.`, `Test reports sent: ${result.sent || 0}.`) });
      setOperationalSafeguards(await getOperationalSafeguards());
    } catch (error) {
      setWeeklyRecapState({ loading: false, message: error?.message || adminCopy(lang, 'Invio report non riuscito.', 'Report send failed.') });
    }
  }

  const adminContent = useMemo(() => buildSiteContentMap(adminContentRows), [adminContentRows]);

  async function logout() {
    await disableNotifications('admin').catch(() => {});
    await signOutOwner();
    navigate('/admin/login');
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <AdminMenuDropdown
          lang={lang}
          visibleSections={visibleSections}
          normalizedPath={normalizedPath}
          currentNavValue={currentNavValue}
          navigate={navigate}
          safeguards={operationalSafeguards}
        />
        <div className="admin-userbox">
          <span className="admin-userbox-name">{ownerDisplayName(profile, lang)}</span>
          <span className="admin-userbox-actions">
            <button type="button" onClick={() => setLang(lang === 'it' ? 'en' : 'it')}>{lang === 'it' ? 'EN' : 'IT'}</button>
            <button type="button" onClick={logout}>{adminCopy(lang, 'Esci', 'Logout')}</button>
          </span>
        </div>
      </header>
      <OperationalSafeguardsBanner
        lang={lang}
        safeguards={operationalSafeguards}
        isOwner={isOwner}
        weeklyRecapState={weeklyRecapState}
        onSendWeeklyRecapTest={sendWeeklyRecapTest}
      />
      {isOwner && !isBackupPage && !isUsersPage && (
        <GlobalBackupProgressBanner
          lang={lang}
          progress={globalBackupProgress}
          onOpenBackup={() => navigate('/admin/system/backup')}
        />
      )}
      <main className="admin-main">
        {normalizedPath.includes('/calendar') ? (
          <AdminCalendarPage lang={lang} session={session} navigate={navigate} adminContent={adminContent} />
        ) : normalizedPath.includes('/notifications') || normalizedPath.includes('/install') ? (
          <NotificationsPage variant="admin" lang={lang} adminRole={profile?.role || ''} />
        ) : normalizedPath.includes('/account') ? (
          <AdminAccountPage lang={lang} session={session} onSignOut={logout} />
        ) : normalizedPath.includes('/finance') ? (
          <FinanceAdminPage lang={lang} session={session} profile={profile} adminContent={adminContent} />
        ) : normalizedPath.includes('/analytics') || normalizedPath.includes('/data') ? (
          <AdminAnalyticsPage lang={lang} session={session} profile={profile} adminContent={adminContent} />
        ) : normalizedPath.includes('/system') || normalizedPath.includes('/backup') ? (
          isOwner ? <AdminBackupPage lang={lang} session={session} profile={profile} adminContent={adminContent} globalBackupProgress={globalBackupProgress} startGlobalBackupMonitor={startGlobalBackupMonitor} stopGlobalBackupMonitor={stopBackupMonitor} /> : <OwnerOnlyAdminPage lang={lang} />
        ) : normalizedPath.includes('/users') ? (
          isOwner ? <AdminUsersPage lang={lang} session={session} profile={profile} /> : <OwnerOnlyAdminPage lang={lang} />
        ) : normalizedPath.includes('/edit') || normalizedPath.includes('/website') || normalizedPath.includes('/content') || normalizedPath.includes('/media') ? (
          <AdminEditPage lang={lang} session={session} adminContent={adminContent} />
        ) : normalizedPath.includes('/partnerships') ? (
          <PartnershipsAdminPage lang={lang} session={session} adminContent={adminContent} />
        ) : normalizedPath.includes('/upcoming') ? (
          <UpcomingPage lang={lang} session={session} navigate={navigate} adminContent={adminContent} />
        ) : normalizedPath.includes('/booking-codes') ? (
          <BookingCodesPage lang={lang} session={session} adminContent={adminContent} />
        ) : normalizedPath.includes('/gift-cards') ? (
          <GiftCardsAdminPage lang={lang} session={session} adminContent={adminContent} />
        ) : normalizedPath.includes('/requests') ? (
          <RequestsPage lang={lang} session={session} navigate={navigate} adminContent={adminContent} />
        ) : normalizedPath.includes('/availability') ? (
          <AvailabilityPage lang={lang} session={session} adminContent={adminContent} />
        ) : (
          <TodayDashboard lang={lang} session={session} navigate={navigate} adminContent={adminContent} />
        )}
      </main>
      <AskNeoPanel navigate={navigate} profile={profile} lang={lang} />
    </div>
  );
}

function useAdminRequests(filters = {}) {
  const { data, ...state } = useLatestQuery(async () => {
    const [requests, counts] = await Promise.all([listBookingRequests(filters), getBookingRequestCounts(filters, todayIso())]);
    return { requests, counts };
  }, filters);
  return { requests: data.requests || [], counts: data.counts || null, ...state };
}

function calendarItemsByDate({ fixedExcursions = [], requests = [], blocks = [] }) {
  const map = {};
  fixedExcursions.forEach((item) => {
    if (!item.date || item.active === false) return;
    map[item.date] = map[item.date] || { fixed: [], bookings: [], blocks: [] };
    map[item.date].fixed.push(item);
  });
  requests.forEach((request) => {
    if (!request.requested_date || request.status !== 'accepted') return;
    map[request.requested_date] = map[request.requested_date] || { fixed: [], bookings: [], blocks: [] };
    map[request.requested_date].bookings.push(request);
  });
  blocks.forEach((block) => {
    if (!block.date || block.active === false) return;
    map[block.date] = map[block.date] || { fixed: [], bookings: [], blocks: [] };
    map[block.date].blocks.push(block);
  });
  return map;
}

function AdminCalendarPage({ lang, session, navigate, adminContent = {} }) {
  const { requests, counts, loading: requestsLoading, error: requestsError, refresh: refreshRequests } = useAdminRequests({ status: 'accepted' });
  const [fixedExcursions, setFixedExcursions] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [monthDate, setMonthDate] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedFixed, setSelectedFixed] = useState(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  async function refreshCalendar() {
    setError('');
    try {
      const [fixedData, blockData] = await Promise.all([
        listFixedExcursions({ activeOnly: false }),
        listAvailabilityBlocks({ activeOnly: true, fromDate: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`, toDate: addDaysIso(365) })
      ]);
      setFixedExcursions(fixedData || []);
      setBlocks(blockData || []);
      await refreshRequests();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Calendario non caricato.', 'Calendar not loaded.'));
    }
  }

  useEffect(() => { refreshCalendar(); }, [monthDate.getFullYear(), monthDate.getMonth()]);

  const days = useMemo(() => getCalendarDays(monthDate), [monthDate]);
  const byDate = useMemo(() => calendarItemsByDate({ fixedExcursions, requests, blocks }), [fixedExcursions, requests, blocks]);
  const selected = byDate[selectedDate] || { fixed: [], bookings: [], blocks: [] };
  const isLoading = requestsLoading && !requests.length;

  function changeMonth(delta) {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  async function handleBookingUpdate(request, values) {
    setError('');
    try {
      await updateBookingRequest(request.id, { ...values, expected_updated_at: request.updated_at, updated_by: session.user.id });
      if (values.requested_date && values.requested_date !== request.requested_date) {
        await publishCustomerNotificationEvent().catch(() => null);
      }
      setSelectedBooking(null);
      setFeedback(adminCopy(lang, 'Prenotazione aggiornata.', 'Booking updated.'));
      await refreshCalendar();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Prenotazione non aggiornata.', 'Booking not updated.'));
    }
  }

  async function handleFixedUpdate(item, values) {
    setError('');
    try {
      await updateFixedExcursion(item.id, { ...values, updated_by: session.user.id });
      await publishCustomerNotificationEvent().catch(() => null);
      setSelectedFixed(null);
      setFeedback(adminCopy(lang, 'Escursione fissa aggiornata.', 'Fixed excursion updated.'));
      await refreshCalendar();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Escursione non aggiornata.', 'Fixed excursion not updated.'));
    }
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Calendario', 'Calendar')}</span>
          <AdminEditableText as="h1" itemKey="admin.calendar.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Calendario disponibilità', 'Availability calendar')} />
          <AdminEditableText as="p" itemKey="admin.calendar.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Verde: escursione fissa. Rosso: esperienza prenotata. Grigio: data bloccata o non disponibile.', 'Green: fixed excursion. Red: booked experience. Grey: blocked or unavailable date.')} />
        </div>
        <div className="admin-header-actions">
          <button className="button secondary" type="button" onClick={refreshCalendar}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
          <button className="button primary" type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Gestisci disponibilità', 'Manage availability')}</button>
        </div>
      </div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {(error || requestsError) && <div className="admin-alert error" role="alert">{error || requestsError}</div>}
      <div className="admin-calendar-layout">
        <article className="calendar-card admin-calendar-card">
          <div className="calendar-topline">
            <button type="button" onClick={() => changeMonth(-1)} aria-label={text(lang, 'previousMonth')}>‹</button>
            <h2>{monthLabel(monthDate, lang)}</h2>
            <button type="button" onClick={() => changeMonth(1)} aria-label={text(lang, 'nextMonth')}>›</button>
          </div>
          <div className="calendar-legend compact-legend">
            <span><i className="legend-dot fixed" />{adminCopy(lang, 'Verde: escursione fissa', 'Green: fixed excursion')}</span>
            <span><i className="legend-dot booked" />{adminCopy(lang, 'Rosso: esperienza prenotata', 'Red: booked experience')}</span>
            <span><i className="legend-dot blocked" />{adminCopy(lang, 'Grigio: bloccata', 'Grey: blocked')}</span>
          </div>
          <div className="weekdays" aria-hidden="true">
            {(lang === 'it' ? ['L', 'M', 'M', 'G', 'V', 'S', 'D'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']).map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
          </div>
          <div className="calendar-grid admin-calendar-grid">
            {days.map((date) => {
              const iso = dateToIso(date);
              const dateItems = byDate[iso] || { fixed: [], bookings: [], blocks: [] };
              const outside = date.getMonth() !== monthDate.getMonth();
              return (
                <button type="button" key={iso} className={`date-button admin-date-button ${outside ? 'outside' : ''} ${selectedDate === iso ? 'selected' : ''}`} onClick={() => setSelectedDate(iso)}>
                  <strong>{date.getDate()}</strong>
                  <span className="admin-date-markers">
                    {dateItems.fixed.length > 0 && <i className="date-dot fixed" />}
                    {counts?.by_date?.some(row => row.date === iso && row.accepted > 0) && <i className="date-dot booked" />}
                    {dateItems.blocks.length > 0 && <i className="date-dot blocked" />}
                  </span>
                </button>
              );
            })}
          </div>
        </article>
        <aside className="admin-panel date-detail-panel admin-date-detail-panel">
          <span className="micro-label">{adminCopy(lang, 'Dettagli data', 'Date details')}</span>
          <h2>{formatDateForMessage(selectedDate, lang)}</h2>
          {isLoading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : (
            <>
              {selected.fixed.length === 0 && selected.bookings.length === 0 && selected.blocks.length === 0 && <p>{adminCopy(lang, 'Nessuna attività per questa data.', 'No activity for this date.')}</p>}
              {selected.fixed.length > 0 && (
                <details className="admin-archive-details admin-calendar-detail-group">
                  <summary><span>{adminCopy(lang, 'Escursioni fisse', 'Fixed excursions')}</span><strong>{selected.fixed.length}</strong></summary>
                  <div className="calendar-detail-list">
                  {selected.fixed.map((item) => {
                    const bookedGuests = requests.filter((request) => request.fixed_excursion_id === item.id && request.status === 'accepted');
                    return (
                      <article className="calendar-detail-item" key={item.id}>
                        <strong>{fixedExcursionLabel(item, lang)}</strong>
                        <span>{adminExperienceLabel(item.experience_id, lang)} · {item.places_remaining}/{item.capacity}</span>
                        <dl className="request-details-grid">
                          <div><dt>{adminCopy(lang, 'Data', 'Date')}</dt><dd>{formatDateForMessage(item.date, lang)}</dd></div>
                          <div><dt>{adminCopy(lang, 'Ora inizio', 'Start time')}</dt><dd>{item.start_time ? String(item.start_time).slice(0, 5) : '-'}</dd></div>
                          <div><dt>{adminCopy(lang, 'Ora fine', 'End time')}</dt><dd>{item.end_time ? String(item.end_time).slice(0, 5) : '-'}</dd></div>
                          <div><dt>{adminCopy(lang, 'Stato', 'Status')}</dt><dd>{item.status || (item.active ? 'active' : 'inactive')}</dd></div>
                        </dl>
                        <div className="guest-detail-list">
                          <strong>{adminCopy(lang, 'Ospiti prenotati', 'Booked guests')}</strong>
                          {bookedGuests.length ? bookedGuests.map((guest) => (
                            <p className="small-note" key={guest.id}>{guest.customer_name || '-'} · {guest.customer_email || '-'} · {guest.customer_phone || '-'} · {Number(guest.adults || 0) + Number(guest.children || 0) || '-'} {adminCopy(lang, 'ospiti', 'guests')}{guest.booking_code ? ` · ${guest.booking_code}` : ''}</p>
                          )) : <p className="small-note">{adminCopy(lang, 'Nessun ospite prenotato per questa data.', 'No guests booked for this date yet.')}</p>}
                        </div>
                        <button type="button" className="button secondary" onClick={() => setSelectedFixed(item)}>{adminCopy(lang, 'Modifica', 'Edit')}</button>
                      </article>
                    );
                  })}
                  </div>
                </details>
              )}
              {selected.bookings.length > 0 && (
                <details className="admin-archive-details admin-calendar-detail-group">
                  <summary><span>{adminCopy(lang, 'Esperienze prenotate', 'Booked experiences')}</span><strong>{selected.bookings.length}</strong></summary>
                  <div className="calendar-detail-list">
                  {selected.bookings.map((request) => (
                    <article className="calendar-detail-item" key={request.id}>
                      <strong>{request.customer_name || '-'}</strong>
                      <span>{adminExperienceLabel(request.experience_id, lang)} · {Number(request.adults || 0) + Number(request.children || 0) || '-'} {adminCopy(lang, 'ospiti', 'guests')}</span>
                      <button type="button" className="button secondary" onClick={() => setSelectedBooking(request)}>{adminCopy(lang, 'Modifica', 'Edit')}</button>
                    </article>
                  ))}
                  </div>
                </details>
              )}
              {selected.blocks.length > 0 && (
                <details className="admin-archive-details admin-calendar-detail-group">
                  <summary><span>{adminCopy(lang, 'Blocchi e note disponibilità', 'Availability notes')}</span><strong>{selected.blocks.length}</strong></summary>
                  {selected.blocks.map((block) => <p className="small-note" key={block.id}>{adminAvailabilityStatusLabels[block.status]?.[lang] || block.status} · {block.reason_it || block.reason_en || '-'}</p>)}
                </details>
              )}
            </>
          )}
        </aside>
      </div>
      {selectedBooking && <CalendarBookingModal lang={lang} request={selectedBooking} onClose={() => setSelectedBooking(null)} onSave={handleBookingUpdate} />}
      {selectedFixed && <CalendarFixedModal lang={lang} item={selectedFixed} onClose={() => setSelectedFixed(null)} onSave={handleFixedUpdate} />}
    </section>
  );
}

function CalendarBookingModal({ lang, request, onClose, onSave }) {
  const [form, setForm] = useState({ status: request.status, requested_date: request.requested_date || '', adults: String(request.adults || ''), children: String(request.children || ''), heard_about_us: request.heard_about_us || 'not_specified', heard_about_us_detail: request.heard_about_us_detail || '', admin_note: request.admin_note || '', decision_note: request.decision_note || '' });
  useBodyScrollLock(true);
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="admin-modal wide booking-edit-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal-header booking-edit-modal-header"><div><h2>{request.customer_name || adminCopy(lang, 'Prenotazione', 'Booking')}</h2><p>{request.customer_email || '-'} · {request.customer_phone || '-'}</p></div><button className="modal-close-button booking-modal-close-button" type="button" aria-label={adminCopy(lang, 'Chiudi', 'Close')} onClick={onClose}>{adminCopy(lang, 'Chiudi', 'Close')}</button></div>
        <div className="admin-form-grid booking-edit-modal-grid">
          <AdminSelect label={adminCopy(lang, 'Stato', 'Status')} value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value }))} options={REQUEST_STATUSES} formatter={(value) => requestStatusLabels[value]?.[lang] || value} />
          <label className="admin-field confirmed-date-section"><span>{adminCopy(lang, 'Data confermata', 'Confirmed date')}</span><input type="date" min={todayIso()} value={form.requested_date || ''} onChange={(event) => setForm((current) => ({ ...current, requested_date: event.target.value }))} /></label>
          <AdminInput label={adminCopy(lang, 'Adulti', 'Adults')} type="number" value={form.adults} onChange={(value) => setForm((current) => ({ ...current, adults: value }))} />
          <AdminInput label={adminCopy(lang, 'Bambini', 'Children')} type="number" value={form.children} onChange={(value) => setForm((current) => ({ ...current, children: value }))} />
          <AdminSelect label={text(lang, 'heardAboutUsAdmin')} value={form.heard_about_us || 'not_specified'} onChange={(value) => setForm((current) => ({ ...current, heard_about_us: value, heard_about_us_label: heardAboutUsLabel(value, lang), heard_about_us_detail: needsHeardAboutUsDetail(value) ? current.heard_about_us_detail : '' }))} options={heardAboutUsOptions({ includeAdmin: true }).map((option) => option.value)} formatter={(value) => heardAboutUsLabel(value, lang)} />
          {needsHeardAboutUsDetail(form.heard_about_us) && <AdminInput label={text(lang, 'heardAboutUsOtherLabel')} value={form.heard_about_us_detail || ''} onChange={(value) => setForm((current) => ({ ...current, heard_about_us_detail: value }))} />}
          <label className="admin-field full"><span>{adminCopy(lang, 'Nota interna', 'Internal note')}</span><textarea rows={3} value={form.admin_note} onChange={(event) => setForm((current) => ({ ...current, admin_note: event.target.value }))} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Nota decisione', 'Decision note')}</span><textarea rows={3} value={form.decision_note} onChange={(event) => setForm((current) => ({ ...current, decision_note: event.target.value }))} /></label>
          <div className="modal-actions full"><button className="button primary" type="button" onClick={() => onSave(request, { ...form, heard_about_us: form.heard_about_us || 'not_specified', heard_about_us_label: heardAboutUsLabel(form.heard_about_us || 'not_specified', lang), heard_about_us_detail: needsHeardAboutUsDetail(form.heard_about_us) ? cleanHeardAboutUsDetail(form.heard_about_us_detail) : null, adults: Number.parseInt(form.adults || '0', 10), children: Number.parseInt(form.children || '0', 10) })}>{adminCopy(lang, 'Salva modifiche', 'Save changes')}</button><button className="button secondary" type="button" onClick={onClose}>{adminCopy(lang, 'Annulla', 'Cancel')}</button></div>
        </div>
      </div>
    </div>
  );
}

function CalendarFixedModal({ lang, item, onClose, onSave }) {
  const [form, setForm] = useState({ date: item.date || '', start_time: item.start_time || '', end_time: item.end_time || '', title_it: item.title_it || '', title_en: item.title_en || '', description_it: item.description_it || item.note_it || '', description_en: item.description_en || item.note_en || '', meeting_point_it: item.meeting_point_it || '', meeting_point_en: item.meeting_point_en || '', meeting_point_maps_url: item.meeting_point_maps_url || '', capacity: String(item.capacity || 12), active: item.active !== false });
  useBodyScrollLock(true);
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="admin-modal wide" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal-header"><div><h2>{fixedExcursionTitle(item, lang)}</h2><p>{adminExperienceLabel(item.experience_id, lang)}</p></div><button className="round-button" type="button" onClick={onClose}>{text(lang, 'close')}</button></div>
        <div className="admin-form-grid">
          <AdminInput label={adminCopy(lang, 'Data', 'Date')} type="date" min={todayIso()} value={form.date} onChange={(value) => setForm((current) => ({ ...current, date: value }))} />
          <AdminInput label={adminCopy(lang, 'Ora inizio', 'Start time')} type="time" value={form.start_time} onChange={(value) => setForm((current) => ({ ...current, start_time: value }))} />
          <AdminInput label={adminCopy(lang, 'Ora fine', 'End time')} type="time" value={form.end_time} onChange={(value) => setForm((current) => ({ ...current, end_time: value }))} />
          <AdminInput label={adminCopy(lang, 'Capienza', 'Capacity')} type="number" value={form.capacity} onChange={(value) => setForm((current) => ({ ...current, capacity: value }))} />
          <AdminInput label="Title IT" value={form.title_it} onChange={(value) => setForm((current) => ({ ...current, title_it: value }))} />
          <AdminInput label="Title EN" value={form.title_en} onChange={(value) => setForm((current) => ({ ...current, title_en: value }))} />
          <label className="admin-field full"><span>Description IT</span><textarea rows={3} value={form.description_it} onChange={(event) => setForm((current) => ({ ...current, description_it: event.target.value }))} /></label>
          <label className="admin-field full"><span>Description EN</span><textarea rows={3} value={form.description_en} onChange={(event) => setForm((current) => ({ ...current, description_en: event.target.value }))} /></label>
          <AdminInput label="Meeting point IT" value={form.meeting_point_it} onChange={(value) => setForm((current) => ({ ...current, meeting_point_it: value }))} />
          <AdminInput label="Meeting point EN" value={form.meeting_point_en} onChange={(value) => setForm((current) => ({ ...current, meeting_point_en: value }))} />
          <AdminInput label={adminCopy(lang, 'Link Google Maps del punto d’incontro', 'Google Maps meeting point link')} value={form.meeting_point_maps_url} placeholder="https://maps.google.com/..." onChange={(value) => setForm((current) => ({ ...current, meeting_point_maps_url: value }))} />
          <label className="check-field"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> {adminCopy(lang, 'Attiva', 'Active')}</label>
          <div className="modal-actions full"><button className="button primary" type="button" onClick={() => onSave(item, { ...form, capacity: Number.parseInt(form.capacity || '12', 10) })}>{adminCopy(lang, 'Salva modifiche', 'Save changes')}</button><button className="button secondary" type="button" onClick={onClose}>{adminCopy(lang, 'Annulla', 'Cancel')}</button></div>
        </div>
      </div>
    </div>
  );
}

const EDITOR_PAGE_OPTIONS = [
  { key: 'home', it: 'Home', en: 'Home' },
  { key: 'experiences', it: 'Escursioni', en: 'Excursions' },
  { key: 'partnerships', it: 'Collaborazioni', en: 'Partnerships' },
  { key: 'about', it: 'Chi siamo', en: 'Who we are' },
  { key: 'reviews', it: 'Recensioni', en: 'Reviews' },
  { key: 'social', it: 'Social', en: 'Social' },
  { key: 'latestNews', it: 'Notizie live sull’Etna', en: 'Etna live news' },
  { key: 'contact', it: 'Contatti', en: 'Contact' }
];

function buildEditorContentMap(items = [], drafts = {}) {
  const stored = (items || []).reduce((acc, item) => ({ ...acc, [item.content_key]: item }), {});
  const map = SITE_CONTENT_DEFINITIONS.reduce((acc, definition) => {
    acc[definition.key] = editorContentItem(stored, definition.key, definition.default_it || definition.default_en || '');
    return acc;
  }, {});
  Object.keys(stored).forEach((key) => {
    if (!map[key]) map[key] = editorContentItem(stored, key, stored[key]?.default_it || stored[key]?.default_en || '');
  });
  return Object.keys(drafts || {}).reduce((acc, key) => ({ ...acc, [key]: { ...(acc[key] || {}), ...drafts[key] } }), map);
}

function buildAdminEditorContentMap(items = [], drafts = {}) {
  const stored = (items || []).reduce((acc, item) => ({ ...acc, [item.content_key]: item }), {});
  const map = ADMIN_CONTENT_DEFINITIONS.reduce((acc, definition) => {
    acc[definition.key] = editorContentItem(stored, definition.key, definition.default_it || definition.default_en || '');
    return acc;
  }, {});
  Object.keys(stored).forEach((key) => {
    if (String(key).startsWith('admin.') && !map[key]) map[key] = editorContentItem(stored, key, stored[key]?.default_it || stored[key]?.default_en || '');
  });
  return Object.keys(drafts || {}).reduce((acc, key) => ({ ...acc, [key]: { ...(acc[key] || {}), ...drafts[key] } }), map);
}

function buildEditorMediaMap(items = [], drafts = {}) {
  const stored = (items || []).reduce((acc, item) => ({ ...acc, [item.media_key]: item }), {});
  const map = MEDIA_ADMIN_ITEMS.reduce((acc, definition) => {
    acc[definition.key] = editorMediaItem(stored, definition.key, definition.fallback || '', definition.alt_it || definition.alt_en || '');
    return acc;
  }, {});
  Object.keys(stored).forEach((key) => {
    if (!map[key]) map[key] = editorMediaItem(stored, key, stored[key]?.file_url || '', stored[key]?.alt_it || stored[key]?.alt_en || '');
  });
  return Object.keys(drafts || {}).reduce((acc, key) => ({ ...acc, [key]: { ...(acc[key] || {}), ...drafts[key] } }), map);
}

function ContactChannelsEditor({ lang, contentMap, onSave, disabled }) {
  const contactDefinitions = SITE_CONTENT_DEFINITIONS.filter((item) => String(item.key || '').startsWith('contact.channels.'));
  const [values, setValues] = useState({});

  useEffect(() => {
    const next = {};
    contactDefinitions.forEach((definition) => {
      const item = contentMap?.[definition.key] || editorContentItem({}, definition.key, definition.default_it || definition.default_en || '');
      next[definition.key] = contentSettingValue({ [definition.key]: item }, definition.key, definition.default_it || definition.default_en || '');
    });
    setValues(next);
  }, [contentMap]);

  function update(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <details className="admin-archive-details edit-workspace-section contact-channels-editor" open>
      <summary>
        <span>{adminCopy(lang, 'Contatti pubblici', 'Public contact details')}</span>
        <strong>{adminCopy(lang, 'Telefono, email, Instagram', 'Phone, email, Instagram')}</strong>
      </summary>
      <div className="admin-form-grid contact-channel-grid">
        {contactDefinitions.map((definition) => {
          const item = contentMap?.[definition.key] || editorContentItem({}, definition.key, definition.default_it || definition.default_en || '');
          const value = values[definition.key] ?? contentSettingValue({ [definition.key]: item }, definition.key, definition.default_it || definition.default_en || '');
          return (
            <label className="admin-field full" key={definition.key}>
              <span>{lang === 'it' ? definition.label_it : definition.label_en}</span>
              <input value={value} onChange={(event) => update(definition.key, event.target.value)} placeholder={definition.default_it || definition.default_en || ''} />
              <small>{definition.key}</small>
            </label>
          );
        })}
        <div className="modal-actions full">
          <button className="button primary" type="button" disabled={disabled} onClick={() => onSave(values)}>{adminCopy(lang, 'Salva contatti pubblici', 'Save public contacts')}</button>
        </div>
      </div>
    </details>
  );
}

function SiteSettingsItem(contentMap, key) {
  const definition = getContentDefinition(key);
  return contentMap?.[key] || editorContentItem({}, key, definition.default_it || definition.default_en || '');
}

function LatestNewsEditor({ lang, contentMap, updateContentDraft }) {
  const enabledItem = SiteSettingsItem(contentMap, latestNewsContentKey('enabled'));
  const titleItem = SiteSettingsItem(contentMap, latestNewsContentKey('title'));
  const descriptionItem = SiteSettingsItem(contentMap, latestNewsContentKey('description'));
  const ctaItem = SiteSettingsItem(contentMap, latestNewsContentKey('cta_label'));
  const urlItItem = SiteSettingsItem(contentMap, latestNewsContentKey('url_it'));
  const urlEnItem = SiteSettingsItem(contentMap, latestNewsContentKey('url_en'));
  const enabled = parseBooleanSetting(enabledItem.value_it || enabledItem.value_en || enabledItem.default_it || 'true', true);
  const urlIt = contentSettingValue({ [latestNewsContentKey('url_it')]: urlItItem }, latestNewsContentKey('url_it'), '');
  const urlEn = contentSettingValue({ [latestNewsContentKey('url_en')]: urlEnItem }, latestNewsContentKey('url_en'), '');
  const hasInvalidIt = Boolean(urlIt) && !safeExternalUrl(urlIt);
  const hasInvalidEn = Boolean(urlEn) && !safeExternalUrl(urlEn);

  function updateTextItem(key, patch) {
    const item = SiteSettingsItem(contentMap, key);
    updateContentDraft(key, {
      ...item,
      ...patch,
      active: true,
      visible: true,
      content_type: item.content_type || (item.type === 'textarea' ? 'textarea' : 'text')
    });
  }

  function updateSingleValue(key, value) {
    updateTextItem(key, { value_it: value, value_en: value });
  }

  return (
    <details className="admin-archive-details edit-workspace-section latest-news-editor">
      <summary>
        <span>{adminCopy(lang, 'Notizie live sull’Etna', 'Etna live news')}</span>
        <strong>{adminCopy(lang, 'Link notizie live sull’Etna', 'Etna live news link')}</strong>
      </summary>
      <div className="admin-form-grid latest-news-grid">
        <label className="check-field full">
          <input type="checkbox" checked={enabled} onChange={(event) => updateSingleValue(latestNewsContentKey('enabled'), event.target.checked ? 'true' : 'false')} />
          {enabled ? adminCopy(lang, 'Mostra ultime notizie', 'Show latest news') : adminCopy(lang, 'Nascondi ultime notizie', 'Hide latest news')}
        </label>
        <label className="admin-field"><span>{adminCopy(lang, 'Titolo italiano', 'Italian title')}</span><input value={titleItem.value_it ?? titleItem.default_it ?? ''} onChange={(event) => updateTextItem(latestNewsContentKey('title'), { value_it: event.target.value })} /></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Titolo inglese', 'English title')}</span><input value={titleItem.value_en ?? titleItem.default_en ?? ''} onChange={(event) => updateTextItem(latestNewsContentKey('title'), { value_en: event.target.value })} /></label>
        <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione italiana', 'Italian description')}</span><textarea rows={3} value={descriptionItem.value_it ?? descriptionItem.default_it ?? ''} onChange={(event) => updateTextItem(latestNewsContentKey('description'), { value_it: event.target.value })} /></label>
        <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione inglese', 'English description')}</span><textarea rows={3} value={descriptionItem.value_en ?? descriptionItem.default_en ?? ''} onChange={(event) => updateTextItem(latestNewsContentKey('description'), { value_en: event.target.value })} /></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Testo pulsante italiano', 'Italian button text')}</span><input value={ctaItem.value_it ?? ctaItem.default_it ?? ''} onChange={(event) => updateTextItem(latestNewsContentKey('cta_label'), { value_it: event.target.value })} /></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Testo pulsante inglese', 'English button text')}</span><input value={ctaItem.value_en ?? ctaItem.default_en ?? ''} onChange={(event) => updateTextItem(latestNewsContentKey('cta_label'), { value_en: event.target.value })} /></label>
        <label className="admin-field"><span>{adminCopy(lang, 'URL italiano', 'Italian URL')}</span><input value={urlIt} placeholder="https://..." onChange={(event) => updateSingleValue(latestNewsContentKey('url_it'), event.target.value)} /></label>
        <label className="admin-field"><span>{adminCopy(lang, 'URL inglese', 'English URL')}</span><input value={urlEn} placeholder="https://..." onChange={(event) => updateSingleValue(latestNewsContentKey('url_en'), event.target.value)} /></label>
        {(hasInvalidIt || hasInvalidEn) && <div className="admin-alert warning full">{adminCopy(lang, 'Usa URL https:// validi. I link non validi non verranno mostrati sul sito pubblico.', 'Use valid https:// URLs. Invalid links will not be shown on the public website.')}</div>}
      </div>
    </details>
  );
}

function SocialLinksEditor({ lang, contentMap, updateContentDraft }) {
  const item = SiteSettingsItem(contentMap, SOCIAL_LINKS_CONTENT_KEY);
  const raw = item.value_it || item.value_en || item.default_it || item.default_en || '';
  const rows = raw ? parseSocialLinksJson(raw) : defaultSocialLinks(contentMap);
  const sortedRows = [...rows].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  function commit(nextRows) {
    const json = socialLinksToJson(nextRows);
    updateContentDraft(SOCIAL_LINKS_CONTENT_KEY, {
      ...item,
      value_it: json,
      value_en: json,
      active: true,
      visible: true,
      content_type: 'textarea'
    });
  }

  function addRow() {
    const nextOrder = sortedRows.reduce((max, row) => Math.max(max, Number(row.order || 0)), 0) + 1;
    commit([...sortedRows, {
      id: `social-${Date.now()}`,
      platform: 'instagram',
      label: 'Instagram',
      url: '',
      enabled: true,
      order: nextOrder,
      icon_key: 'insta'
    }]);
  }

  function updateRow(index, patch) {
    const next = sortedRows.map((row, rowIndex) => rowIndex === index ? normalizeSocialLink({ ...row, ...patch }, rowIndex) : row);
    commit(next);
  }

  function removeRow(index) {
    commit(sortedRows.filter((_row, rowIndex) => rowIndex !== index));
  }

  function moveRow(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= sortedRows.length) return;
    const next = [...sortedRows];
    const currentOrder = next[index].order;
    next[index] = { ...next[index], order: next[target].order };
    next[target] = { ...next[target], order: currentOrder };
    commit(next);
  }

  return (
    <details className="admin-archive-details edit-workspace-section social-links-editor">
      <summary>
        <span>{adminCopy(lang, 'Social', 'Social')}</span>
        <strong>{adminCopy(lang, 'Pagine social', 'Social pages')}</strong>
      </summary>
      <div className="social-admin-list">
        {sortedRows.length === 0 && <p className="small-note">{adminCopy(lang, 'Nessun social configurato', 'No social links configured')}</p>}
        {sortedRows.map((row, index) => {
          const invalidUrl = Boolean(row.url) && !safeExternalUrl(row.url);
          return (
            <article className="social-admin-row" key={row.id || index}>
              <div className="social-admin-row-head">
                <h3>{socialLinkLabel(row, lang)}</h3>
                <label className="check-field"><input type="checkbox" checked={row.enabled !== false} onChange={(event) => updateRow(index, { enabled: event.target.checked })} /> {adminCopy(lang, 'Attivo', 'Enabled')}</label>
              </div>
              <div className="admin-form-grid social-admin-grid">
                <label className="admin-field"><span>{adminCopy(lang, 'Piattaforma', 'Platform')}</span><select value={row.platform} onChange={(event) => updateRow(index, { platform: event.target.value, icon_key: socialPlatformOption(event.target.value).icon, label: row.label || socialPlatformLabel(event.target.value, lang) })}>{SOCIAL_PLATFORM_OPTIONS.map((option) => <option key={option.value} value={option.value}>{lang === 'it' ? option.it : option.en}</option>)}</select></label>
                <label className="admin-field"><span>{adminCopy(lang, 'Etichetta', 'Label')}</span><input value={row.label || ''} onChange={(event) => updateRow(index, { label: event.target.value })} placeholder={socialPlatformLabel(row.platform, lang)} /></label>
                <label className="admin-field full"><span>{adminCopy(lang, 'URL', 'URL')}</span><input value={row.url || ''} onChange={(event) => updateRow(index, { url: event.target.value })} placeholder="https://..." /></label>
                <label className="admin-field"><span>{adminCopy(lang, 'Ordine', 'Order')}</span><input type="number" value={row.order || index + 1} onChange={(event) => updateRow(index, { order: event.target.value })} /></label>
                <label className="admin-field"><span>Icon key</span><input value={row.icon_key || ''} onChange={(event) => updateRow(index, { icon_key: event.target.value })} placeholder={socialPlatformOption(row.platform).icon} /></label>
              </div>
              {invalidUrl && <div className="admin-alert warning">{adminCopy(lang, 'URL non valido. Usa un link https://.', 'Invalid URL. Use an https:// link.')}</div>}
              <div className="request-actions">
                <button className="button secondary" type="button" onClick={() => moveRow(index, -1)} disabled={index === 0}>↑</button>
                <button className="button secondary" type="button" onClick={() => moveRow(index, 1)} disabled={index === sortedRows.length - 1}>↓</button>
                <button className="button secondary danger" type="button" onClick={() => removeRow(index)}>{adminCopy(lang, 'Rimuovi social', 'Remove social')}</button>
              </div>
            </article>
          );
        })}
        <button className="button primary" type="button" onClick={addRow}>{adminCopy(lang, 'Aggiungi social', 'Add social')}</button>
      </div>
    </details>
  );
}

function isSupportedMediaUrl(value) {
  const clean = String(value || '').trim();
  if (!clean) return true;
  return clean.startsWith('/') || clean.startsWith('http://') || clean.startsWith('https://');
}

function MediaQuickEditorPanel({ lang, mediaMap, updateMediaDraft, contentMap, updateContentDraft, page }) {
  const keys = page === 'home'
    ? ['home_hero_background', 'home_hero_background_poster', 'home_hero_feature_image', 'home_hero_video']
    : MEDIA_ADMIN_ITEMS.map((item) => item.key).filter((key) => !['brand_logo_main'].includes(key));
  const visibleKeys = page === 'home' ? keys : keys.slice(0, 8);
  const heroLayout = contentMap?.['home.hero.layout'] || editorContentItem({}, 'home.hero.layout');
  return (
    <details className="admin-archive-details edit-workspace-section media-quick-editor">
      <summary>
        <span>{adminCopy(lang, 'Media', 'Media')}</span>
        <strong>{page === 'home' ? adminCopy(lang, 'Sfondo hero, poster, immagine e video', 'Hero background, poster, image, and video') : adminCopy(lang, 'Immagini e video principali', 'Key images and videos')}</strong>
      </summary>
      {page === 'home' && (
        <div className="hero-layout-admin-control">
          <label className="admin-field">
            <span>{adminCopy(lang, 'Allineamento hero senza immagine/video', 'Hero alignment without image/video')}</span>
            <select value={heroLayout.layout_variant === 'center' ? 'center' : 'left'} onChange={(event) => updateContentDraft('home.hero.layout', { layout_variant: event.target.value, active: true, visible: true })}>
              <option value="left">{adminCopy(lang, 'Sinistra', 'Left')}</option>
              <option value="center">{adminCopy(lang, 'Centro', 'Center')}</option>
            </select>
          </label>
          <p className="small-note">{adminCopy(lang, 'Si applica quando immagine e video hero sono rimossi.', 'Applies when both hero image and video are removed.')}</p>
        </div>
      )}
      {page === 'home' && (
        <VideoOptimizer
          lang={lang}
          onApply={({ videoFile, posterFile }) => {
            updateMediaDraft('home_hero_background', {
              file: videoFile,
              file_url: URL.createObjectURL(videoFile),
              file_name: videoFile.name,
              file_type: videoFile.type,
              media_kind: 'video',
              active: true
            });
            updateMediaDraft('home_hero_background_poster', {
              file: posterFile,
              file_url: URL.createObjectURL(posterFile),
              file_name: posterFile.name,
              file_type: posterFile.type,
              media_kind: 'image',
              active: true
            });
          }}
        />
      )}
      <div className="media-quick-grid">
        {visibleKeys.map((key) => {
          const item = mediaMap[key] || editorMediaItem({}, key);
          const label = lang === 'it' ? item.label_it : item.label_en;
          const kind = item.media_kind || mediaUrlKindFromValue(item.file_url, 'image');
          return (
            <article className="media-quick-card" key={key}>
              <div className="media-quick-card-head"><span className="micro-label">{key}</span><h3>{label}</h3></div>
              <div className="media-quick-preview">
                {item.file_url ? (kind === 'video' ? <video src={item.file_url} controls /> : <img src={item.file_url} alt={lang === 'it' ? item.alt_it : item.alt_en} onError={(event) => { event.currentTarget.style.display = 'none'; }} />) : <span>{adminCopy(lang, 'Anteprima non disponibile', 'No preview available')}</span>}
              </div>
              <label className="admin-field"><span>{adminCopy(lang, 'Tipo', 'Type')}</span><select value={kind} onChange={(event) => updateMediaDraft(key, { media_kind: event.target.value, active: true })}><option value="image">{adminCopy(lang, 'Immagine', 'Image')}</option><option value="video">{adminCopy(lang, 'Video', 'Video')}</option><option value="document">Document</option></select></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'URL media', 'Media URL')}</span><input value={item.file_url || ''} placeholder="/images/... oppure https://..." onChange={(event) => updateMediaDraft(key, { file: null, file_url: event.target.value, file_path: null, media_kind: mediaUrlKindFromValue(event.target.value, kind), active: true })} /></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'Testo alternativo', 'Alt text')} IT</span><input value={item.alt_it || ''} onChange={(event) => updateMediaDraft(key, { alt_it: event.target.value })} /></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'Testo alternativo', 'Alt text')} EN</span><input value={item.alt_en || ''} onChange={(event) => updateMediaDraft(key, { alt_en: event.target.value })} /></label>
              <label className="button secondary media-upload-button"><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.webm" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                updateMediaDraft(key, { file, file_url: URL.createObjectURL(file), file_name: file.name, file_type: file.type, media_kind: file.type.startsWith('video/') ? 'video' : 'image', active: true });
              }} />{adminCopy(lang, 'Carica media', 'Upload media')}</label>
              <button className="button secondary danger" type="button" onClick={() => updateMediaDraft(key, { file: null, file_url: '', file_path: null, file_name: '', file_type: '', active: false })}>{adminCopy(lang, 'Rimuovi media', 'Remove media')}</button>
            </article>
          );
        })}
      </div>
    </details>
  );
}

function WebsiteAdminPage({ lang, session }) {
  const [page, setPage] = useState('home');
  const [editorLang, setEditorLang] = useState(lang || 'it');
  const [device, setDevice] = useState('desktop');
  const [contentRows, setContentRows] = useState([]);
  const [mediaRows, setMediaRows] = useState([]);
  const [contentDrafts, setContentDrafts] = useState({});
  const [mediaDrafts, setMediaDrafts] = useState({});
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    setError('');
    if (!isSupabaseConfigured) {
      setContentRows([]);
      setMediaRows([]);
      setLoading(false);
      setError(adminCopy(lang, 'Supabase non è configurato. Puoi vedere l’anteprima, ma non salvare modifiche.', 'Supabase is not configured. You can preview the site, but changes cannot be saved.'));
      return;
    }
    try {
      const [content, media] = await Promise.all([listSiteContent({ activeOnly: false }), listSiteMedia({ activeOnly: false })]);
      setContentRows(content);
      setMediaRows(media);
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Editor non caricato.', 'Editor not loaded.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const contentMap = useMemo(() => buildEditorContentMap(contentRows, contentDrafts), [contentRows, contentDrafts]);
  const mediaMap = useMemo(() => buildEditorMediaMap(mediaRows, mediaDrafts), [mediaRows, mediaDrafts]);
  const hasDrafts = Object.keys(contentDrafts).length > 0 || Object.keys(mediaDrafts).length > 0;
  const selectedHasDraft = Boolean(selected && (
    (selected.type === 'text' && contentDrafts[selected.key]) ||
    (selected.type === 'image' && mediaDrafts[selected.key])
  ));
  const editor = useMemo(() => ({ isEditing: true, lang: editorLang, selected, select: setSelected, contentMap, mediaMap }), [editorLang, selected, contentMap, mediaMap]);

  function updateContentDraft(key, patch) {
    setFeedback('');
    setContentDrafts((current) => ({ ...current, [key]: { ...(contentMap[key] || editorContentItem({}, key)), ...(current[key] || {}), ...patch } }));
  }

  function updateMediaDraft(key, patch) {
    setFeedback('');
    setMediaDrafts((current) => ({ ...current, [key]: { ...(mediaMap[key] || editorMediaItem({}, key)), ...(current[key] || {}), ...patch } }));
  }

  async function saveContentItem(item) {
    if (!isSupabaseConfigured) throw new Error(adminCopy(lang, 'Supabase non è configurato.', 'Supabase is not configured.'));
    await upsertSiteContent({
      content_key: item.content_key || item.key,
      section: item.section,
      label_it: item.label_it,
      label_en: item.label_en,
      value_it: item.value_it,
      value_en: item.value_en,
      default_it: item.default_it,
      default_en: item.default_en,
      content_type: item.content_type || (item.type === 'textarea' ? 'textarea' : 'text'),
      style_variant: item.style_variant || 'body',
      text_size: item.text_size || 'normal',
      text_align: item.text_align || 'left',
      visible: item.visible !== false,
      layout_variant: item.layout_variant || 'default',
      sort_order: item.sort_order || 0,
      active: item.active !== false,
      updated_by: session.user.id
    });
  }

  async function saveMediaItem(item) {
    if (!isSupabaseConfigured) {
      throw new Error(
        adminCopy(
          lang,
          'Supabase non è configurato.',
          'Supabase is not configured.'
        )
      );
    }

    const key = item.media_key || item.key;
    const existing = mediaRows.find((row) => row.media_key === key);

    let uploaded = {};
    let saved = false;

    try {
      // A selected local file uses a temporary blob: URL only for preview.
      // Upload the real file first, then validate and persist the permanent URL.
      if (item.file) {
        uploaded = await uploadSiteMediaFile(
          item.file,
          key,
          session.user.id
        );
      }

      const cleanFileUrl = String(
        uploaded.file_url || item.file_url || ''
      ).trim();

      if (!isSupportedMediaUrl(cleanFileUrl)) {
        throw new Error(
          adminCopy(
            lang,
            'URL media non valido. Usa un URL https:// oppure un percorso che inizia con /.',
            'Invalid media URL. Use an https:// URL or a path starting with /.'
          )
        );
      }

      const keepsExistingStorageFile =
        !item.file &&
        cleanFileUrl &&
        cleanFileUrl === existing?.file_url;

      await upsertSiteMedia({
        media_key: key,
        label_it: item.label_it || item.it || key,
        label_en: item.label_en || item.en || key,
        alt_it: item.alt_it || item.label_it || key,
        alt_en: item.alt_en || item.label_en || key,
        file_url: cleanFileUrl || null,
        file_path:
          uploaded.file_path ||
          (keepsExistingStorageFile ? existing?.file_path : null),
        file_name:
          uploaded.file_name ||
          (
            keepsExistingStorageFile
              ? (item.file_name || existing?.file_name)
              : (item.file_name || null)
          ),
        file_type:
          uploaded.file_type ||
          (
            keepsExistingStorageFile
              ? (item.file_type || existing?.file_type)
              : (item.file_type || null)
          ),
        media_kind:
          uploaded.media_kind ||
          item.media_kind ||
          mediaUrlKindFromValue(cleanFileUrl, 'image'),
        active: item.active !== false,
        updated_by: session.user.id
      });

      saved = true;

      // Once the database points to the new URL (or no URL), clean up the
      // previous Storage object if it is no longer referenced.
      const shouldRemoveExistingStorageFile =
        Boolean(existing?.file_path) &&
        (
          (item.file && existing.file_path !== uploaded.file_path) ||
          (!item.file && cleanFileUrl !== existing?.file_url)
        );

      if (shouldRemoveExistingStorageFile) {
        try {
          await removeSiteMediaFile(existing.file_path);
        } catch {
          // The database save succeeded. A failed cleanup must not turn a
          // successful CMS update into a user-visible save failure.
        }
      }
    } catch (error) {
      // If a new upload was created but the database save failed, remove the
      // orphaned upload and keep the previously stored media untouched.
      if (!saved && uploaded?.file_path) {
        try {
          await removeSiteMediaFile(uploaded.file_path);
        } catch {
          // Preserve the original save error.
        }
      }

      throw error;
    }
  }
  async function saveSelected() {
    if (!selected || saving) return;
    setError('');
    setFeedback('');
    setSaving(true);
    try {
      if (selected.type === 'text') {
        await saveContentItem(contentMap[selected.key]);
        setContentDrafts((current) => {
          const next = { ...current };
          delete next[selected.key];
          return next;
        });
      }
      if (selected.type === 'image') {
        await saveMediaItem(mediaMap[selected.key]);
        setMediaDrafts((current) => {
          const next = { ...current };
          delete next[selected.key];
          return next;
        });
      }
      if (selected.type === 'card') {
        setFeedback(adminCopy(lang, 'Card selezionata. Modifica i testi o immagini cliccabili dentro la card, oppure usa la sezione admin dedicata per dati strutturati.', 'Card selected. Edit the clickable text or images inside the card, or use the dedicated admin section for structured data.'));
        return;
      }
      setFeedback(adminCopy(lang, 'Modifiche salvate.', 'Changes saved.'));
      await refresh();
      setSelected(null);
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Impossibile salvare le modifiche. Riprova.', 'Unable to save changes. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function saveAll() {
    if (saving) return;
    setError('');
    setFeedback('');
    setSaving(true);
    try {
      const contentItems = Object.keys(contentDrafts).map((key) => contentMap[key]).filter(Boolean);
      const mediaItems = Object.keys(mediaDrafts).map((key) => mediaMap[key]).filter(Boolean);
      for (const item of contentItems) await saveContentItem(item);
      for (const item of mediaItems) await saveMediaItem(item);
      setContentDrafts({});
      setMediaDrafts({});
      setFeedback(adminCopy(lang, 'Tutte le modifiche sono state salvate.', 'All changes have been saved.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Impossibile salvare tutte le modifiche.', 'Unable to save all changes.'));
    } finally {
      setSaving(false);
    }
  }

  function discardDrafts() {
    if (hasDrafts && !window.confirm(adminCopy(lang, 'Scartare le modifiche non salvate?', 'Discard unsaved changes?'))) return;
    setContentDrafts({});
    setMediaDrafts({});
    setFeedback(adminCopy(lang, 'Modifiche locali scartate.', 'Local changes discarded.'));
  }

  function discardSelectedDraft() {
    if (!selected) return;
    if (selected.type === 'text') {
      setContentDrafts((current) => {
        const next = { ...current };
        delete next[selected.key];
        return next;
      });
    }
    if (selected.type === 'image') {
      setMediaDrafts((current) => {
        const next = { ...current };
        delete next[selected.key];
        return next;
      });
    }
  }

  function closeSelectedEditor() {
    if (selectedHasDraft && !window.confirm(adminCopy(lang, 'Chiudere senza salvare questa modifica?', 'Close without saving this change?'))) return;
    discardSelectedDraft();
    setSelected(null);
  }

  function resetSelected() {
    if (!selected) return;
    if (!window.confirm(adminCopy(lang, 'Ripristinare il contenuto selezionato al valore predefinito?', 'Reset the selected item to its default value?'))) return;
    if (selected.type === 'text') {
      const item = contentMap[selected.key] || editorContentItem({}, selected.key);
      updateContentDraft(selected.key, {
        value_it: item.default_it || '',
        value_en: item.default_en || '',
        visible: true,
        active: true,
        text_size: getContentDefinition(selected.key).text_size || 'normal',
        text_align: getContentDefinition(selected.key).text_align || 'left',
        style_variant: getContentDefinition(selected.key).style_variant || 'body'
      });
    }
    if (selected.type === 'image') {
      const definition = getMediaDefinition(selected.key);
      updateMediaDraft(selected.key, {
        file: null,
        file_url: definition.fallback || selected.fallbackSrc || '',
        alt_it: definition.alt_it || definition.it || selected.fallbackAlt || '',
        alt_en: definition.alt_en || definition.en || selected.fallbackAlt || '',
        active: true
      });
    }
  }


  async function saveContactChannels(values) {
    if (saving) return;
    setError('');
    setFeedback('');
    setSaving(true);
    try {
      const definitions = SITE_CONTENT_DEFINITIONS.filter((item) => String(item.key || '').startsWith('contact.channels.'));
      for (const definition of definitions) {
        const item = contentMap[definition.key] || editorContentItem({}, definition.key, definition.default_it || definition.default_en || '');
        const value = values?.[definition.key] ?? contentSettingValue({ [definition.key]: item }, definition.key, definition.default_it || definition.default_en || '');
        await saveContentItem({
          ...item,
          content_key: definition.key,
          key: definition.key,
          section: definition.section,
          label_it: definition.label_it,
          label_en: definition.label_en,
          value_it: value,
          value_en: value,
          default_it: definition.default_it,
          default_en: definition.default_en,
          content_type: 'text',
          style_variant: 'body',
          text_size: 'normal',
          text_align: 'left',
          visible: true,
          active: true
        });
      }
      setContentDrafts((current) => {
        const next = { ...current };
        definitions.forEach((definition) => delete next[definition.key]);
        return next;
      });
      setFeedback(adminCopy(lang, 'Contatti pubblici salvati.', 'Public contact details saved.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Contatti pubblici non salvati.', 'Public contact details not saved.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-page website-admin-page visual-editor-page">
      <div className="visual-editor-toolbar">
        <div>
          <span className="kicker">{adminCopy(lang, 'Modifica sito', 'Edit website')}</span>
          <h1>{adminCopy(lang, 'Editor visuale controllato', 'Controlled visual editor')}</h1>
        </div>
        <label><span>{adminCopy(lang, 'Pagina', 'Page')}</span><select value={page} onChange={(event) => { setPage(event.target.value); setSelected(null); }}>
          {EDITOR_PAGE_OPTIONS.map((item) => <option key={item.key} value={item.key}>{lang === 'it' ? item.it : item.en}</option>)}
        </select></label>
        <label><span>{adminCopy(lang, 'Lingua', 'Language')}</span><select value={editorLang} onChange={(event) => setEditorLang(event.target.value)}><option value="it">IT</option><option value="en">EN</option></select></label>
        <label><span>{adminCopy(lang, 'Dispositivo', 'Device')}</span><select value={device} onChange={(event) => setDevice(event.target.value)}><option value="desktop">Desktop</option><option value="tablet">Tablet</option><option value="mobile">Mobile</option></select></label>
        <button className="button secondary" type="button" onClick={() => window.open('/', '_blank', 'noopener,noreferrer')}>{adminCopy(lang, 'Apri sito pubblico', 'Open public site')}</button>
        <button className="button secondary" type="button" onClick={resetSelected} disabled={!selected}>{adminCopy(lang, 'Ripristina selezione', 'Reset selected')}</button>
        <button className="button secondary" type="button" onClick={discardDrafts} disabled={!hasDrafts || saving}>{adminCopy(lang, 'Scarta', 'Discard')}</button>
        <button className="button primary" type="button" onClick={saveAll} disabled={!hasDrafts || !isSupabaseConfigured || saving}>{saving ? adminCopy(lang, 'Salvataggio...', 'Saving...') : adminCopy(lang, 'Salva tutto', 'Save all')}</button>
      </div>

      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      {notice && <div className="admin-alert warning" role="status">{notice}</div>}
      {!loading && page === 'contact' && <ContactChannelsEditor lang={lang} contentMap={contentMap} onSave={saveContactChannels} disabled={!isSupabaseConfigured || saving} />}
      {!loading && <LatestNewsEditor lang={lang} contentMap={contentMap} updateContentDraft={updateContentDraft} />}
      {!loading && <SocialLinksEditor lang={lang} contentMap={contentMap} updateContentDraft={updateContentDraft} />}
      {!loading && <MediaQuickEditorPanel lang={lang} mediaMap={mediaMap} updateMediaDraft={updateMediaDraft} contentMap={contentMap} updateContentDraft={updateContentDraft} page={page} />}
      {loading ? <p>{adminCopy(lang, 'Caricamento editor...', 'Loading editor...')}</p> : (
        <>
          <div className="visual-editor-shell">
            <VisualEditorPreview
              page={page}
              setPage={setPage}
              lang={editorLang}
              setLang={setEditorLang}
              device={device}
              siteMedia={mediaMap}
              siteContent={contentMap}
              editor={editor}
              setNotice={setNotice}
            />
          </div>
          {selected && (
            <EditorFullscreenModal
              lang={lang}
              editorLang={editorLang}
              selected={selected}
              contentMap={contentMap}
              mediaMap={mediaMap}
              updateContentDraft={updateContentDraft}
              updateMediaDraft={updateMediaDraft}
              onSave={saveSelected}
              onReset={resetSelected}
              onClose={closeSelectedEditor}
              canSave={isSupabaseConfigured && !saving}
            />
          )}
        </>
      )}
    </section>
  );
}

function AdminEditPage({ lang, session, adminContent = {} }) {
  return (
    <section className="admin-page admin-edit-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Modifica', 'Edit')}</span>
          <AdminEditableText as="h1" itemKey="admin.edit.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Modifica sito e recensioni', 'Edit website and reviews')} />
          <AdminEditableText as="p" itemKey="admin.edit.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Gestisci contenuti, media e recensioni pubbliche da un’unica area.', 'Manage public content, media, and reviews from one area.')} />
        </div>
      </div>
      <details className="admin-archive-details edit-workspace-section">
        <summary><AdminEditableText itemKey="admin.edit.publicSite.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Sito pubblico', 'Public website')} /><AdminEditableText as="strong" itemKey="admin.edit.publicSite.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Testi e media', 'Text and media')} /></summary>
        <WebsiteAdminPage lang={lang} session={session} />
      </details>
      <details className="admin-archive-details edit-workspace-section">
        <summary><AdminEditableText itemKey="admin.edit.adminSite.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Sito admin', 'Admin website')} /><AdminEditableText as="strong" itemKey="admin.edit.adminSite.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Testi pannello', 'Panel text')} /></summary>
        <AdminSiteContentPage lang={lang} session={session} adminContent={adminContent} />
      </details>
      <details className="admin-archive-details edit-workspace-section">
        <summary><AdminEditableText itemKey="admin.edit.reviews.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Recensioni', 'Reviews')} /><AdminEditableText as="strong" itemKey="admin.edit.reviews.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Gestione', 'Management')} /></summary>
        <AdminReviewsPanel lang={lang} adminContent={adminContent} />
      </details>
    </section>
  );
}

function EditorFullscreenModal({ lang, editorLang, selected, contentMap, mediaMap, updateContentDraft, updateMediaDraft, onSave, onReset, onClose, canSave }) {
  useBodyScrollLock(true);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="editor-fullscreen-backdrop" role="presentation">
      <section className="editor-fullscreen-modal" role="dialog" aria-modal="true" aria-labelledby="editorFullscreenTitle">
        <div className="editor-fullscreen-header">
          <div>
            <span className="kicker">{adminCopy(lang, 'Editor elemento', 'Element editor')}</span>
            <h2 id="editorFullscreenTitle">{selected.label || selected.key}</h2>
            <p>{selected.section || selected.type} · {selected.key}</p>
          </div>
          <button className="button secondary" type="button" onClick={onClose}>{adminCopy(lang, 'Annulla', 'Cancel')}</button>
        </div>
        <EditorInspector
          lang={lang}
          editorLang={editorLang}
          selected={selected}
          contentMap={contentMap}
          mediaMap={mediaMap}
          updateContentDraft={updateContentDraft}
          updateMediaDraft={updateMediaDraft}
          onSave={onSave}
          onReset={onReset}
          canSave={canSave}
        />
      </section>
    </div>
  );
}

function VisualEditorPreview({ page, setPage, lang, setLang, device, siteMedia, siteContent, editor, setNotice }) {
  const [formState, setFormState] = useState({ language: lang, requestType: 'private', preferredContact: 'whatsapp', partyType: 'solo', adults: '1', children: '0', childrenUnder3Count: '0', heardAboutUs: '', heardAboutUsDetail: '', message: text(lang, 'defaultMessage') });

  function disabledActionNotice() {
    setNotice(lang === 'it' ? 'Azione disattivata durante la modifica del sito.' : 'This action is disabled while editing the website.');
    window.setTimeout(() => setNotice(''), 2800);
  }

  function fillForm() {
    disabledActionNotice();
  }

  function renderPage() {
    switch (page) {
      case 'experiences':
        return <ExperienceAccordion lang={lang} fillForm={fillForm} siteMedia={siteMedia} siteContent={siteContent} editor={editor} />;
      case 'partnerships':
        return <PartnershipsPage lang={lang} siteContent={siteContent} editor={editor} />;
      case 'about':
        return <Team lang={lang} siteMedia={siteMedia} siteContent={siteContent} editor={editor} />;
      case 'reviews':
        return <ReviewsPage lang={lang} siteContent={siteContent} editor={editor} EditableTextComponent={EditableText} />;
      case 'social':
        return <SocialPage lang={lang} siteContent={siteContent} editor={editor} />;
      case 'latestNews':
        return <LatestNewsPage lang={lang} siteContent={siteContent} editor={editor} />;
      case 'contact':
        return <ContactForm lang={lang} formState={formState} setFormState={setFormState} siteMedia={siteMedia} siteContent={siteContent} editor={editor} />;
      case 'home':
      default:
        return <Hero lang={lang} setActivePage={setPage} scrollToForm={disabledActionNotice} fillForm={null} siteMedia={siteMedia} siteContent={siteContent} editor={editor} />;
    }
  }

  return (
    <div className="visual-editor-canvas">
      <div className={`visual-preview-frame ${device}`} onSubmitCapture={(event) => { event.preventDefault(); disabledActionNotice(); }} onClickCapture={(event) => {
        const link = event.target.closest('a[href]');
        if (link && !link.closest('.editor-selectable')) {
          event.preventDefault();
          event.stopPropagation();
          disabledActionNotice();
        }
      }}>
        <Header lang={lang} setLang={setLang} activePage={page} setActivePage={setPage} siteMedia={siteMedia} editor={editor} />
        <main className="public-page-shell editor-preview-public">{renderPage()}</main>
      </div>
    </div>
  );
}

function EditorInspector({ lang, editorLang, selected, contentMap, mediaMap, updateContentDraft, updateMediaDraft, onSave, onReset, canSave }) {
  if (!selected) {
    return (
      <aside className="editor-inspector empty">
        <span className="kicker">{adminCopy(lang, 'Ispettore', 'Inspector')}</span>
        <h2>{adminCopy(lang, 'Seleziona un elemento', 'Select an element')}</h2>
        <p>{adminCopy(lang, 'Seleziona un testo, un’immagine o una card nella preview per modificarla.', 'Select a text, image, or card in the preview to edit it.')}</p>
      </aside>
    );
  }

  if (selected.type === 'text') {
    const item = contentMap[selected.key] || editorContentItem({}, selected.key);
    const Field = item.content_type === 'textarea' || item.type === 'textarea' ? 'textarea' : 'input';
    return (
      <aside className="editor-inspector">
        <div className="inspector-heading"><span className="kicker">{adminCopy(lang, 'Testo', 'Text')}</span><h2>{selected.label}</h2><p>{item.section} · {selected.key}</p></div>
        <label className="admin-field full"><span>Italiano</span><Field rows={5} value={item.value_it ?? item.default_it ?? ''} onChange={(event) => updateContentDraft(selected.key, { value_it: event.target.value, active: true })} /></label>
        <label className="admin-field full"><span>English</span><Field rows={5} value={item.value_en ?? item.default_en ?? ''} onChange={(event) => updateContentDraft(selected.key, { value_en: event.target.value, active: true })} /></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Dimensione testo', 'Text size')}</span><select value={item.text_size || 'normal'} onChange={(event) => updateContentDraft(selected.key, { text_size: event.target.value })}><option value="small">Small</option><option value="normal">Normal</option><option value="large">Large</option><option value="hero">Hero</option><option value="display">Display</option></select></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Stile testo', 'Text style')}</span><select value={item.style_variant || 'body'} onChange={(event) => updateContentDraft(selected.key, { style_variant: event.target.value })}><option value="label">Label</option><option value="body">Body</option><option value="heading">Heading</option><option value="display">Display heading</option></select></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Allineamento', 'Alignment')}</span><select value={item.text_align || 'left'} onChange={(event) => updateContentDraft(selected.key, { text_align: event.target.value })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
        <label className="check-field"><input type="checkbox" checked={item.visible !== false} onChange={(event) => updateContentDraft(selected.key, { visible: event.target.checked })} /> {adminCopy(lang, 'Visibile', 'Visible')}</label>
        <div className="inspector-actions"><button className="button primary" type="button" onClick={onSave} disabled={!canSave}>{adminCopy(lang, 'Salva selezione', 'Save selected')}</button><button className="button secondary" type="button" onClick={onReset}>{adminCopy(lang, 'Ripristina default', 'Reset to default')}</button></div>
      </aside>
    );
  }

  if (selected.type === 'image') {
    const item = mediaMap[selected.key] || editorMediaItem({}, selected.key, selected.fallbackSrc, selected.fallbackAlt);
    const mediaKind = item.media_kind || mediaUrlKindFromValue(item.file_url, 'image');
    return (
      <aside className="editor-inspector media-editor-inspector">
        <div className="inspector-heading"><span className="kicker">{adminCopy(lang, 'Media', 'Media')}</span><h2>{selected.label}</h2><p>{selected.key}</p></div>
        {item.file_url && (mediaKind === 'video' ? <video className="inspector-media-preview" src={item.file_url} controls /> : <img className="inspector-media-preview" src={item.file_url} alt={editorLang === 'it' ? item.alt_it : item.alt_en} onError={(event) => { event.currentTarget.style.display = 'none'; }} />)}
        <label className="admin-field"><span>{adminCopy(lang, 'Tipo', 'Type')}</span><select value={mediaKind} onChange={(event) => updateMediaDraft(selected.key, { media_kind: event.target.value })}><option value="image">{adminCopy(lang, 'Immagine', 'Image')}</option><option value="video">{adminCopy(lang, 'Video', 'Video')}</option><option value="document">Document</option></select></label>
        <label className="admin-field full"><span>{adminCopy(lang, 'URL media', 'Media URL')}</span><input value={item.file_url || ''} placeholder="/images/... oppure https://..." onChange={(event) => updateMediaDraft(selected.key, { file: null, file_url: event.target.value, file_path: null, media_kind: mediaUrlKindFromValue(event.target.value, mediaKind), active: true })} /></label>
        <label className="admin-field full"><span>{adminCopy(lang, 'Carica media', 'Upload media')}</span><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.webm" onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          updateMediaDraft(selected.key, { file, file_url: URL.createObjectURL(file), file_name: file.name, file_type: file.type, media_kind: file.type.startsWith('video/') ? 'video' : 'image', active: true });
        }} /></label>
        <label className="admin-field full"><span>{adminCopy(lang, 'Testo alternativo', 'Alt text')} IT</span><input value={item.alt_it || ''} onChange={(event) => updateMediaDraft(selected.key, { alt_it: event.target.value })} /></label>
        <label className="admin-field full"><span>{adminCopy(lang, 'Testo alternativo', 'Alt text')} EN</span><input value={item.alt_en || ''} onChange={(event) => updateMediaDraft(selected.key, { alt_en: event.target.value })} /></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Posizione immagine', 'Image position')}</span><select value={item.image_position || 'center'} onChange={(event) => updateMediaDraft(selected.key, { image_position: event.target.value })}><option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option></select></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Dimensione immagine', 'Image size')}</span><select value={item.image_size || 'normal'} onChange={(event) => updateMediaDraft(selected.key, { image_size: event.target.value })}><option value="compact">Compact</option><option value="normal">Normal</option><option value="large">Large</option></select></label>
        <label className="check-field"><input type="checkbox" checked={item.active !== false} onChange={(event) => updateMediaDraft(selected.key, { active: event.target.checked })} /> {adminCopy(lang, 'Visibile', 'Visible')}</label>
        <div className="inspector-actions"><button className="button primary" type="button" onClick={onSave} disabled={!canSave}>{adminCopy(lang, 'Salva selezione', 'Save selected')}</button><button className="button secondary" type="button" onClick={onReset}>{adminCopy(lang, 'Ripristina default', 'Reset to default')}</button><button className="button secondary danger" type="button" onClick={() => updateMediaDraft(selected.key, { file: null, file_url: '', file_path: null, file_name: '', file_type: '', active: false })}>{adminCopy(lang, 'Rimuovi media', 'Remove media')}</button></div>
      </aside>
    );
  }

  return (
    <aside className="editor-inspector">
      <div className="inspector-heading"><span className="kicker">{adminCopy(lang, 'Card', 'Card')}</span><h2>{selected.label}</h2><p>{selected.section} · {selected.key}</p></div>
      <p>{adminCopy(lang, 'Questa card è selezionata. Per modificare contenuti visibili, clicca direttamente su titolo, descrizione o immagine dentro la card. Per dati strutturati come collaborazioni o escursioni fisse, usa la sezione admin dedicata.', 'This card is selected. To edit visible content, click directly on the title, description, or image inside the card. For structured data such as partnerships or fixed excursions, use the dedicated admin section.')}</p>
    </aside>
  );
}

function MediaAdminPage({ lang, session, compactHeader = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      setItems(await listSiteMedia({ activeOnly: false }));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Media non caricati.', 'Media not loaded.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const itemMap = items.reduce((acc, item) => ({ ...acc, [item.media_key]: item }), {});

  async function saveMedia(key, file) {
    setError('');
    setFeedback('');
    try {
      const existing = itemMap[key];
      const uploaded = file ? await uploadSiteMediaFile(file, key, session.user.id) : {};
      if (file && existing?.file_path) await removeSiteMediaFile(existing.file_path);
      const definition = MEDIA_ADMIN_ITEMS.find((entry) => entry.key === key);
      await upsertSiteMedia({
        media_key: key,
        label_it: definition?.it || key,
        label_en: definition?.en || key,
        alt_it: definition?.it || key,
        alt_en: definition?.en || key,
        active: true,
        updated_by: session.user.id,
        ...uploaded
      });
      setFeedback(adminCopy(lang, 'Media aggiornato.', 'Media updated.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Upload non riuscito.', 'Upload failed.'));
    }
  }

  async function removeMedia(item) {
    setError('');
    try {
      if (item.file_path) await removeSiteMediaFile(item.file_path);
      await upsertSiteMedia({ ...item, file_url: null, file_path: null, file_name: null, file_type: null, active: false, updated_by: session.user.id });
      setFeedback(adminCopy(lang, 'Media rimosso.', 'Media removed.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Rimozione non riuscita.', 'Remove failed.'));
    }
  }

  return (
    <section className={compactHeader ? "admin-subpage" : "admin-page"}>
      {!compactHeader && (
        <div className="admin-page-header">
          <div><span className="kicker">{adminCopy(lang, 'Contenuti media', 'Media content')}</span><h1>{adminCopy(lang, 'Media sito', 'Site media')}</h1><p>{adminCopy(lang, 'Sostituisci immagini, video e documenti pubblici senza modificare il codice.', 'Replace public images, videos, and documents without code changes.')}</p></div>
        </div>
      )}
      {compactHeader && <div className="admin-subpage-actions"><button className="button secondary" type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna media', 'Refresh media')}</button></div>}
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : (
        <div className="media-admin-grid">
          {MEDIA_ADMIN_ITEMS.map((definition) => {
            const item = itemMap[definition.key];
            return (
              <article className="media-admin-card" key={definition.key}>
                <div><span className="micro-label">{definition.key}</span><h3>{lang === 'it' ? definition.it : definition.en}</h3></div>
                {item?.file_url ? (
                  item.media_kind === 'video' ? <video src={item.file_url} controls /> : <img src={item.file_url} alt={lang === 'it' ? item.alt_it : item.alt_en} />
                ) : <div className="media-empty-preview">{adminCopy(lang, 'Fallback statico', 'Static fallback')}</div>}
                <p className="small-note">{item?.file_name || adminCopy(lang, 'Nessun file caricato', 'No uploaded file')}</p>
                <label className="button secondary"><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf,.jpg,.jpeg,.png,.webp,.mp4,.webm,.pdf" onChange={(event) => saveMedia(definition.key, event.target.files?.[0])} />{adminCopy(lang, 'Carica / sostituisci', 'Upload / replace')}</label>
                {item?.file_url && <button className="button secondary danger" type="button" onClick={() => removeMedia(item)}>{adminCopy(lang, 'Rimuovi', 'Remove')}</button>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function contentDefinitionMap() {
  return SITE_CONTENT_DEFINITIONS.reduce((acc, item) => ({ ...acc, [item.key]: item }), {});
}

function AdminSiteContentPage({ lang, session }) {
  const [section, setSection] = useState('today');
  const [editorLang, setEditorLang] = useState(lang || 'it');
  const [device, setDevice] = useState('desktop');
  const [contentRows, setContentRows] = useState([]);
  const [contentDrafts, setContentDrafts] = useState({});
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    if (!isSupabaseConfigured) {
      setContentRows([]);
      setLoading(false);
      setError(adminCopy(lang, 'Supabase non è configurato. Puoi vedere l’anteprima, ma non salvare modifiche.', 'Supabase is not configured. You can preview the dashboard, but changes cannot be saved.'));
      return;
    }
    try {
      const rows = await listSiteContent({ activeOnly: false });
      setContentRows(rows.filter((row) => String(row.content_key || '').startsWith('admin.')));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Editor admin non caricato.', 'Admin editor not loaded.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const contentMap = useMemo(() => buildAdminEditorContentMap(contentRows, contentDrafts), [contentRows, contentDrafts]);
  const hasDrafts = Object.keys(contentDrafts).length > 0;
  const selectedHasDraft = Boolean(selected && selected.type === 'text' && contentDrafts[selected.key]);
  const editor = useMemo(() => ({ isEditing: true, lang: editorLang, selected, select: setSelected, contentMap, mediaMap: {} }), [editorLang, selected, contentMap]);

  function updateContentDraft(key, patch) {
    setFeedback('');
    setContentDrafts((current) => ({ ...current, [key]: { ...(contentMap[key] || editorContentItem({}, key)), ...(current[key] || {}), ...patch } }));
  }

  function updateMediaDraft() {}

  async function saveContentItem(item) {
    if (!isSupabaseConfigured) throw new Error(adminCopy(lang, 'Supabase non è configurato.', 'Supabase is not configured.'));
    await upsertSiteContent({
      content_key: item.content_key || item.key,
      section: item.section,
      label_it: item.label_it,
      label_en: item.label_en,
      value_it: item.value_it,
      value_en: item.value_en,
      default_it: item.default_it,
      default_en: item.default_en,
      content_type: item.content_type || (item.type === 'textarea' ? 'textarea' : 'text'),
      style_variant: item.style_variant || 'body',
      text_size: item.text_size || 'normal',
      text_align: item.text_align || 'left',
      visible: item.visible !== false,
      layout_variant: item.layout_variant || 'default',
      sort_order: item.sort_order || 0,
      active: item.active !== false,
      updated_by: session.user.id
    });
  }

  async function saveSelected() {
    if (!selected || saving) return;
    setError('');
    setFeedback('');
    setSaving(true);
    try {
      await saveContentItem(contentMap[selected.key]);
      setContentDrafts((current) => {
        const next = { ...current };
        delete next[selected.key];
        return next;
      });
      setFeedback(adminCopy(lang, 'Modifica admin salvata.', 'Admin change saved.'));
      await refresh();
      window.dispatchEvent(new Event('vulcaniq-admin-content-updated'));
      setSelected(null);
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Contenuto admin non salvato.', 'Admin content not saved.'));
    } finally {
      setSaving(false);
    }
  }

  async function saveAll() {
    if (saving) return;
    setError('');
    setFeedback('');
    setSaving(true);
    try {
      const items = Object.keys(contentDrafts).map((key) => contentMap[key]).filter(Boolean);
      for (const item of items) await saveContentItem(item);
      setContentDrafts({});
      setFeedback(adminCopy(lang, 'Tutte le modifiche admin sono state salvate.', 'All admin changes have been saved.'));
      await refresh();
      window.dispatchEvent(new Event('vulcaniq-admin-content-updated'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Impossibile salvare tutte le modifiche admin.', 'Unable to save all admin changes.'));
    } finally {
      setSaving(false);
    }
  }

  function discardDrafts() {
    if (hasDrafts && !window.confirm(adminCopy(lang, 'Scartare le modifiche admin non salvate?', 'Discard unsaved admin changes?'))) return;
    setContentDrafts({});
    setFeedback(adminCopy(lang, 'Modifiche admin locali scartate.', 'Local admin changes discarded.'));
  }

  function discardSelectedDraft() {
    if (!selected || selected.type !== 'text') return;
    setContentDrafts((current) => {
      const next = { ...current };
      delete next[selected.key];
      return next;
    });
  }

  function closeSelectedEditor() {
    if (selectedHasDraft && !window.confirm(adminCopy(lang, 'Chiudere senza salvare questa modifica?', 'Close without saving this change?'))) return;
    discardSelectedDraft();
    setSelected(null);
  }

  function resetSelected() {
    if (!selected || selected.type !== 'text') return;
    if (!window.confirm(adminCopy(lang, 'Ripristinare il testo admin selezionato al valore predefinito?', 'Reset the selected admin text to its default value?'))) return;
    const definition = getContentDefinition(selected.key);
    const item = contentMap[selected.key] || editorContentItem({}, selected.key);
    updateContentDraft(selected.key, {
      value_it: item.default_it || definition.default_it || '',
      value_en: item.default_en || definition.default_en || '',
      visible: true,
      active: true,
      text_size: definition.text_size || 'normal',
      text_align: definition.text_align || 'left',
      style_variant: definition.style_variant || 'body'
    });
  }

  return (
    <section className="admin-subpage admin-site-content-page admin-visual-editor-page visual-editor-page">
      <div className="visual-editor-toolbar admin-visual-editor-toolbar">
        <div>
          <span className="kicker">{adminCopy(lang, 'Modifica pannello', 'Edit admin panel')}</span>
          <h1>{adminCopy(lang, 'Editor visuale pannello', 'Admin visual editor')}</h1>
        </div>
        <label><span>{adminCopy(lang, 'Sezione', 'Section')}</span><select value={section} onChange={(event) => { setSection(event.target.value); setSelected(null); }}>
          {ADMIN_EDITOR_SECTION_OPTIONS.map((item) => <option key={item.key} value={item.key}>{lang === 'it' ? item.it : item.en}</option>)}
        </select></label>
        <label><span>{adminCopy(lang, 'Lingua', 'Language')}</span><select value={editorLang} onChange={(event) => setEditorLang(event.target.value)}><option value="it">IT</option><option value="en">EN</option></select></label>
        <label><span>{adminCopy(lang, 'Dispositivo', 'Device')}</span><select value={device} onChange={(event) => setDevice(event.target.value)}><option value="desktop">Desktop</option><option value="tablet">Tablet</option><option value="mobile">Mobile</option></select></label>
        <button className="button secondary" type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna anteprima', 'Refresh preview')}</button>
        <button className="button secondary" type="button" onClick={resetSelected} disabled={!selected}>{adminCopy(lang, 'Ripristina selezione', 'Reset selected')}</button>
        <button className="button secondary" type="button" onClick={discardDrafts} disabled={!hasDrafts || saving}>{adminCopy(lang, 'Scarta', 'Discard')}</button>
        <button className="button primary" type="button" onClick={saveAll} disabled={!hasDrafts || !isSupabaseConfigured || saving}>{saving ? adminCopy(lang, 'Salvataggio...', 'Saving...') : adminCopy(lang, 'Salva tutto', 'Save all')}</button>
      </div>

      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      {notice && <div className="admin-alert warning" role="status">{notice}</div>}
      {loading ? <p>{adminCopy(lang, 'Caricamento editor admin...', 'Loading admin editor...')}</p> : (
        <>
          <div className="visual-editor-shell admin-visual-editor-shell">
            <AdminVisualEditorPreview
              section={section}
              lang={editorLang}
              device={device}
              adminContent={contentMap}
              editor={editor}
              setNotice={setNotice}
            />
          </div>
          {selected && (
            <EditorFullscreenModal
              lang={lang}
              editorLang={editorLang}
              selected={selected}
              contentMap={contentMap}
              mediaMap={{}}
              updateContentDraft={updateContentDraft}
              updateMediaDraft={updateMediaDraft}
              onSave={saveSelected}
              onReset={resetSelected}
              onClose={closeSelectedEditor}
              canSave={isSupabaseConfigured && !saving}
            />
          )}
        </>
      )}
    </section>
  );
}

const ADMIN_EDITOR_SECTION_OPTIONS = [
  ...ADMIN_NAV_SECTIONS.filter((section) => section.editable).map((section) => ({ key: section.key, it: section.labelIt, en: section.labelEn })),
  { key: 'reviews', it: 'Recensioni', en: 'Reviews' }
];

function AdminVisualEditorPreview({ section, lang, device, adminContent, editor, setNotice }) {
  function disabledActionNotice() {
    setNotice(lang === 'it' ? 'Azione disattivata durante la modifica del pannello admin.' : 'This action is disabled while editing the admin panel.');
    window.setTimeout(() => setNotice(''), 2800);
  }

  function handlePreviewClick(event) {
    if (event.target.closest('.editor-selectable')) return;
    if (event.target.closest('button, a, input, select, textarea, summary')) {
      event.preventDefault();
      event.stopPropagation();
      disabledActionNotice();
    }
  }

  function renderSection() {
    switch (section) {
      case 'calendar':
        return <AdminCalendarPreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'upcoming':
        return <AdminUpcomingPreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'requests':
      case 'bookings':
        return <AdminRequestsPreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'availability':
        return <AdminAvailabilityPreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'partnerships':
        return <AdminPartnershipsPreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'edit':
        return <AdminEditPreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'finance':
        return <AdminFinancePreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'analytics':
        return <AdminAnalyticsPreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'publicSite':
        return <AdminPublicSitePreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'reviews':
        return <AdminReviewsPreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'today':
      case 'dashboard':
      default:
        return <AdminDashboardPreview lang={lang} adminContent={adminContent} editor={editor} />;
    }
  }

  return (
    <div className="visual-editor-canvas admin-visual-editor-canvas">
      <div className={`visual-preview-frame admin-dashboard-preview-frame ${device}`} onClickCapture={handlePreviewClick}>
        <div className="admin-preview-browserbar">
          <span>{adminCopy(lang, 'Anteprima pannello admin', 'Admin panel preview')}</span>
          <strong>vulcanIQ</strong>
        </div>
        <div className="admin-preview-surface">
          {renderSection()}
        </div>
      </div>
    </div>
  );
}

function AdminPreviewSummaryCard({ value, labelKey, helperKey, lang, adminContent, editor, labelFallback, helperFallback }) {
  return (
    <article className="summary-card admin-preview-summary-card">
      <strong>{value}</strong>
      <AdminEditableText itemKey={labelKey} lang={lang} adminContent={adminContent} editor={editor} fallback={labelFallback} />
      {helperKey && <AdminEditableText as="small" itemKey={helperKey} lang={lang} adminContent={adminContent} editor={editor} fallback={helperFallback} />}
    </article>
  );
}

function AdminDashboardPreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Oggi', 'Today')}</span>
          <AdminEditableText as="h1" itemKey="admin.today.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Pannello operativo', 'Operations')} />
          <AdminEditableText as="p" itemKey="admin.today.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Stato operativo rapido, richieste e attività da controllare oggi.', 'Fast operational status, requests, and activity to review today.')} />
        </div>
        <div className="admin-header-actions"><button className="button primary" type="button">{adminCopy(lang, 'Aggiungi richiesta manuale', 'Add manual request')}</button></div>
      </div>
      <div className="admin-summary-grid admin-primary-stat-grid">
        <AdminPreviewSummaryCard value="2" labelKey="admin.today.pendingToday.label" helperKey="admin.today.pendingToday.helper" lang={lang} adminContent={adminContent} editor={editor} labelFallback={adminCopy(lang, 'Pending oggi', 'Pending today')} helperFallback={adminCopy(lang, 'Apri richieste di oggi', 'Open today requests')} />
        <AdminPreviewSummaryCard value="5" labelKey="admin.today.pendingTotal.label" helperKey="admin.today.pendingTotal.helper" lang={lang} adminContent={adminContent} editor={editor} labelFallback={adminCopy(lang, 'Pending totale', 'Pending total')} helperFallback={adminCopy(lang, 'Vai alle richieste', 'Go to requests')} />
        <AdminPreviewSummaryCard value="3" labelKey="admin.today.acceptedToday.label" helperKey="admin.today.acceptedToday.helper" lang={lang} adminContent={adminContent} editor={editor} labelFallback={adminCopy(lang, 'Accettate oggi', 'Accepted today')} helperFallback={adminCopy(lang, 'Vedi confermate', 'View accepted')} />
        <AdminPreviewSummaryCard value="1" labelKey="admin.today.availabilityToday.label" helperKey="admin.today.availabilityToday.helper" lang={lang} adminContent={adminContent} editor={editor} labelFallback={adminCopy(lang, 'Disponibilità oggi', 'Availability issues today')} helperFallback={adminCopy(lang, 'Gestisci calendario', 'Manage calendar')} />
      </div>
      <div className="admin-two-column">
        <section className="admin-panel">
          <details className="admin-archive-details today-requests-details" open>
            <summary><AdminEditableText itemKey="admin.today.todayRequests.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Richieste di oggi', 'Today requests')} /><strong>2</strong></summary>
            <div className="request-card-list compact-list">
              <article className="request-card compact"><div className="request-card-head"><div><h3>Rita</h3><p>Etna Learning · 12/06/2026</p></div><span className="status-pill pending">pending</span></div></article>
            </div>
          </details>
          <div className="admin-panel-subsection">
            <div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.today.pendingRequests.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Richieste pending da confermare', 'Pending requests needing attention')} /></div>
            <p className="small-note">{adminCopy(lang, 'Anteprima contenuto richieste.', 'Request content preview.')}</p>
          </div>
        </section>
        <aside className="admin-panel compact-panel admin-operations-panel">
          <div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.today.upcomingOperations.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Operazioni imminenti', 'Upcoming operations')} /></div>
          <details className="admin-archive-details admin-operation-group" open><summary><AdminEditableText itemKey="admin.today.acceptedBookings.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Prenotazioni accettate', 'Accepted bookings')} /><strong>5</strong></summary></details>
          <details className="admin-archive-details admin-operation-group"><summary><AdminEditableText itemKey="admin.today.nearTermBlocks.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Blocchi prossimi', 'Near-term blocks')} /><strong>0</strong></summary></details>
          <details className="admin-archive-details admin-operation-group"><summary><AdminEditableText itemKey="admin.today.recentDecisions.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Decisioni recenti', 'Recent decisions')} /><strong>8</strong></summary></details>
        </aside>
      </div>
    </section>
  );
}

function AdminCalendarPreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Calendario', 'Calendar')}</span>
          <AdminEditableText as="h1" itemKey="admin.calendar.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Calendario disponibilità', 'Availability calendar')} />
          <AdminEditableText as="p" itemKey="admin.calendar.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Verde: escursione fissa. Rosso: esperienza prenotata. Grigio: data bloccata o non disponibile.', 'Green: fixed excursion. Red: booked experience. Grey: blocked or unavailable date.')} />
        </div>
      </div>
      <div className="admin-calendar-layout">
        <article className="calendar-card admin-calendar-card">
          <div className="calendar-topline"><button type="button">‹</button><h2>Giugno 2026</h2><button type="button">›</button></div>
          <div className="calendar-legend compact-legend">
            <span><i className="legend-dot fixed" />{adminCopy(lang, 'Verde: escursione fissa', 'Green: fixed excursion')}</span>
            <span><i className="legend-dot booked" />{adminCopy(lang, 'Rosso: esperienza prenotata', 'Red: booked experience')}</span>
            <span><i className="legend-dot blocked" />{adminCopy(lang, 'Grigio: bloccata', 'Grey: blocked')}</span>
          </div>
          <div className="calendar-grid admin-calendar-grid">{[9, 10, 11, 12, 13, 14].map((day) => <button key={day} className={day === 12 ? 'has-fixed' : day === 14 ? 'has-booking' : ''} type="button"><span>{day}</span></button>)}</div>
        </article>
        <aside className="admin-panel"><AdminEditableText as="h2" itemKey="admin.calendar.selected.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Dettagli data', 'Date details')} /><p className="small-note">Etna Live · 12/06/2026</p></aside>
      </div>
    </section>
  );
}

function AdminUpcomingPreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Conferme owner', 'Owner confirmations')}</span>
          <AdminEditableText as="h1" itemKey="admin.upcoming.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Prossime prenotazioni', 'Upcoming bookings')} />
          <AdminEditableText as="p" itemKey="admin.upcoming.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Richieste accettate e blocchi attivi, organizzati per giorno. Nessuna statistica: solo operatività.', 'Accepted requests and active blocks, organized by date. No analytics: just operations.')} />
        </div>
      </div>
      <div className="admin-two-column">
        <section className="admin-panel upcoming-collapsed-panel">
          <details className="admin-archive-details admin-upcoming-group" open><summary><AdminEditableText itemKey="admin.upcoming.accepted.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Prenotazioni accettate', 'Accepted bookings')} /><strong>3</strong></summary></details>
          <details className="admin-archive-details admin-upcoming-group"><summary><AdminEditableText itemKey="admin.upcoming.past.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Esperienze passate', 'Past experiences')} /><strong>8</strong></summary></details>
        </section>
        <aside className="admin-panel compact-panel"><AdminEditableText as="h2" itemKey="admin.upcoming.blocks.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Blocchi prossimi', 'Near-term blocks')} /></aside>
      </div>
    </section>
  );
}

function AdminEditPreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page admin-edit-page">
      <div className="admin-page-header"><div><span className="kicker">{adminCopy(lang, 'Modifica', 'Edit')}</span><AdminEditableText as="h1" itemKey="admin.edit.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Modifica sito e recensioni', 'Edit website and reviews')} /><AdminEditableText as="p" itemKey="admin.edit.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Gestisci contenuti, media e recensioni pubbliche da un’unica area.', 'Manage public content, media, and reviews from one area.')} /></div></div>
      <details className="admin-archive-details edit-workspace-section" open><summary><AdminEditableText itemKey="admin.edit.publicSite.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Sito pubblico', 'Public website')} /><AdminEditableText as="strong" itemKey="admin.edit.publicSite.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Testi e media', 'Text and media')} /></summary></details>
      <details className="admin-archive-details edit-workspace-section"><summary><AdminEditableText itemKey="admin.edit.adminSite.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Sito admin', 'Admin website')} /><AdminEditableText as="strong" itemKey="admin.edit.adminSite.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Testi pannello', 'Panel text')} /></summary></details>
      <details className="admin-archive-details edit-workspace-section"><summary><AdminEditableText itemKey="admin.edit.reviews.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Recensioni', 'Reviews')} /><AdminEditableText as="strong" itemKey="admin.edit.reviews.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Gestione', 'Management')} /></summary></details>
    </section>
  );
}

function AdminPublicSitePreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page">
      <div className="admin-page-header"><div><span className="kicker">vulcanIQ</span><AdminEditableText as="h1" itemKey="admin.publicSite.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Sito pubblico', 'Public site')} /><AdminEditableText as="p" itemKey="admin.publicSite.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Scorciatoia admin verso il sito pubblico. Usa il pannello Sito pubblico in Modifica per modificare testi, media e sezioni pubbliche.', 'Admin shortcut to the public website. Use the Public website panel in Edit to modify public copy, media, and sections.')} /></div></div>
      <section className="admin-panel"><p className="small-note">{adminCopy(lang, 'Questa voce rappresenta il pulsante Sito pubblico nella navigazione admin.', 'This item represents the Public site button in the admin navigation.')}</p></section>
    </section>
  );
}

function AdminFinancePreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page finance-preview-page">
      <div className="admin-page-header">
        <div><span className="kicker">{adminCopy(lang, 'Finanze', 'Finance')}</span><AdminEditableText as="h1" itemKey="admin.finance.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Finanze', 'Finance')} /></div>
        <button className="button secondary" type="button">{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
      </div>
      <div className="admin-summary-grid finance-summary-grid">
        <SummaryCard label={adminCopy(lang, 'Entrate totali', 'Total earnings')} value="40,00 €" helper={adminCopy(lang, 'Apri dettaglio', 'Open details')} />
        <SummaryCard label={adminCopy(lang, 'Uscite totali', 'Total expenses')} value="0,00 €" helper={adminCopy(lang, 'Apri dettaglio', 'Open details')} />
        <SummaryCard label={adminCopy(lang, 'Utile netto', 'Net profit')} value="40,00 €" helper={adminCopy(lang, 'Entrate meno uscite', 'Income minus expenses')} />
      </div>
      <div className="admin-filter-bar finance-filter-bar"><select><option>{adminCopy(lang, 'Tutte le date', 'All dates')}</option></select><select><option>{adminCopy(lang, 'Tutti i tipi', 'All types')}</option></select><label className="finance-archive-filter"><input type="checkbox" readOnly /> <span>{adminCopy(lang, 'Includi archivio', 'Include archive')}</span></label></div>
      <details className="admin-panel finance-collapsible-panel finance-overview-panel" open><summary className="finance-collapsible-summary"><strong>{adminCopy(lang, 'Tutte le date', 'All dates')}</strong></summary></details>
      <details className="admin-panel finance-collapsible-panel finance-pl-panel" open><summary className="finance-collapsible-summary"><AdminEditableText as="strong" itemKey="admin.finance.profitLoss.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Profitti e perdite', 'Profit & Loss')} /></summary></details>
      <div className="admin-two-column finance-layout">
        <details className="admin-panel finance-collapsible-panel finance-form-panel" open><summary className="finance-collapsible-summary"><AdminEditableText as="strong" itemKey="admin.finance.addEntry.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Aggiungi voce', 'Add entry')} /></summary></details>
        <details className="admin-panel finance-collapsible-panel finance-entries-panel" open><summary className="finance-collapsible-summary"><AdminEditableText as="strong" itemKey="admin.finance.entries.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Voci finanziarie', 'Financial entries')} /><em>1</em></summary></details>
      </div>
    </section>
  );
}

function AdminAvailabilityPreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page">
      <div className="admin-page-header"><div><span className="kicker">{adminCopy(lang, 'Calendario pubblico', 'Public calendar')}</span><AdminEditableText as="h1" itemKey="admin.availability.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Disponibilità', 'Availability')} /><AdminEditableText as="p" itemKey="admin.availability.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Gestisci disponibilità privata e date fisse prenotabili fino a 12 persone.', 'Manage private availability and fixed excursion dates bookable up to 12 people.')} /></div></div>
      <div className="admin-two-column availability-columns"><section className="admin-panel"><AdminEditableText as="h2" itemKey="admin.availability.addBlock.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Aggiungi blocco disponibilità', 'Add availability block')} /></section><section className="admin-panel"><div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.availability.existingBlocks.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Blocchi esistenti', 'Existing blocks')} /></div></section></div>
    </section>
  );
}

function AdminRequestsPreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page">
      <div className="admin-page-header"><div><span className="kicker">{adminCopy(lang, 'Gestione richieste', 'Request management')}</span><AdminEditableText as="h1" itemKey="admin.requests.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Richieste', 'Requests')} /><AdminEditableText as="p" itemKey="admin.requests.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Cerca e filtra richieste da sito, WhatsApp, telefono o email.', 'Search and filter requests from the website, WhatsApp, phone, or email.')} /></div></div>
      <section className="admin-panel"><div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.requests.results.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Risultati', 'Results')} /><strong>4</strong></div></section>
      <aside className="admin-panel compact-panel"><AdminEditableText as="h2" itemKey="admin.upcoming.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Prossime prenotazioni', 'Upcoming bookings')} /></aside>
    </section>
  );
}

function AdminReviewsPreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page"><section className="admin-panel admin-reviews-panel"><div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.reviews.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Gestione recensioni', 'Review management')} /><button type="button">{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div><AdminEditableText as="p" itemKey="admin.reviews.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Approva, nascondi, rispondi o elimina recensioni pubbliche.', 'Approve, hide, reply to, or delete public reviews.')} /></section></section>
  );
}

function AdminPartnershipsPreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page"><div className="admin-page-header"><div><span className="kicker">{adminCopy(lang, 'Network', 'Network')}</span><AdminEditableText as="h1" itemKey="admin.partnerships.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Collaborazioni', 'Partnerships')} /><AdminEditableText as="p" itemKey="admin.partnerships.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Crea, modifica e disattiva le collaborazioni visibili sul sito pubblico.', 'Create, edit, and deactivate collaborations visible on the public website.')} /></div></div><div className="admin-two-column availability-columns"><section className="admin-panel"><AdminEditableText as="h2" itemKey="admin.partnerships.create.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Crea collaborazione', 'Create partnership')} /></section><section className="admin-panel"><div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.partnerships.saved.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Collaborazioni salvate', 'Saved partnerships')} /></div></section></div></section>
  );
}

function AdminContentEditorModal({ lang, item, onClose, onSave, saving }) {
  useBodyScrollLock(true);
  const [form, setForm] = useState({
    value_it: item.value_it ?? item.default_it ?? '',
    value_en: item.value_en ?? item.default_en ?? '',
    text_size: item.text_size || 'normal',
    style_variant: item.style_variant || 'body',
    text_align: item.text_align || 'left',
    active: item.active !== false,
    visible: item.visible !== false
  });

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function update(key, value) {
    markFormFieldStarted(formJourneyRef.current?.journey_id, key, { ...sourceMetadata, step_index: step, step_key: key });
    markFormActivity(formJourneyRef.current?.journey_id, { has_selected_experience: key === 'experienceId' ? Boolean(value) : Boolean(form.experienceId), has_selected_date: key === 'customDate' ? Boolean(value) : Boolean(form.customDate || form.dateMode === 'flexible'), has_people_count: true });
    setForm((current) => ({ ...current, [key]: value }));
  }

  const TextFieldIt = item.content_type === 'textarea' || item.type === 'textarea'
    ? <textarea rows={5} value={form.value_it} onChange={(event) => update('value_it', event.target.value)} />
    : <input value={form.value_it} onChange={(event) => update('value_it', event.target.value)} />;
  const TextFieldEn = item.content_type === 'textarea' || item.type === 'textarea'
    ? <textarea rows={5} value={form.value_en} onChange={(event) => update('value_en', event.target.value)} />
    : <input value={form.value_en} onChange={(event) => update('value_en', event.target.value)} />;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="admin-modal wide full-screen-admin-modal admin-content-modal" role="dialog" aria-modal="true" aria-labelledby="adminContentEditorTitle">
        <div className="admin-modal-header">
          <div>
            <span className="kicker">{adminCopy(lang, 'Sito admin', 'Admin website')}</span>
            <h2 id="adminContentEditorTitle">{lang === 'it' ? item.label_it : item.label_en}</h2>
            <p className="small-note">{item.key}</p>
          </div>
          <button className="modal-close-button" type="button" aria-label={adminCopy(lang, 'Chiudi', 'Close')} onClick={onClose}>{adminCopy(lang, 'Chiudi', 'Close')}</button>
        </div>
        <form className="admin-form-grid" onSubmit={(event) => { event.preventDefault(); onSave(item, form); }}>
          <label className="admin-field full"><span>Italiano</span>{TextFieldIt}</label>
          <label className="admin-field full"><span>English</span>{TextFieldEn}</label>
          <label className="admin-field"><span>{adminCopy(lang, 'Dimensione testo', 'Text size')}</span><select value={form.text_size} onChange={(event) => update('text_size', event.target.value)}><option value="small">Small</option><option value="normal">Normal</option><option value="large">Large</option><option value="display">Display</option></select></label>
          <label className="admin-field"><span>{adminCopy(lang, 'Stile', 'Style')}</span><select value={form.style_variant} onChange={(event) => update('style_variant', event.target.value)}><option value="body">Body</option><option value="heading">Heading</option><option value="label">Label</option><option value="display">Display</option></select></label>
          <label className="admin-field"><span>{adminCopy(lang, 'Allineamento', 'Alignment')}</span><select value={form.text_align} onChange={(event) => update('text_align', event.target.value)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
          <div className="admin-field admin-content-toggle-group">
            <label className="check-field"><input type="checkbox" checked={form.active} onChange={(event) => update('active', event.target.checked)} /> {adminCopy(lang, 'Attivo', 'Active')}</label>
            <label className="check-field"><input type="checkbox" checked={form.visible} onChange={(event) => update('visible', event.target.checked)} /> {adminCopy(lang, 'Visibile', 'Visible')}</label>
          </div>
          <div className="modal-actions full">
            <button className="button primary" type="submit" disabled={saving || !isSupabaseConfigured}>{saving ? adminCopy(lang, 'Salvataggio...', 'Saving...') : adminCopy(lang, 'Salva', 'Save')}</button>
            <button className="button secondary" type="button" onClick={() => setForm((current) => ({ ...current, value_it: item.default_it || '', value_en: item.default_en || '', active: true, visible: true }))}>{adminCopy(lang, 'Ripristina fallback', 'Restore fallback')}</button>
            <button className="button secondary" type="button" onClick={onClose}>{adminCopy(lang, 'Annulla', 'Cancel')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ContentAdminPage({ lang, session, compactHeader = false }) {
  const [items, setItems] = useState([]);
  const [section, setSection] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      setItems(await listSiteContent({ activeOnly: false }));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Contenuti non caricati.', 'Content not loaded.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const existing = items.reduce((acc, item) => ({ ...acc, [item.content_key]: item }), {});
  const merged = SITE_CONTENT_DEFINITIONS.map((definition) => ({ ...definition, ...(existing[definition.key] || {}) }));
  const sections = ['all', ...Array.from(new Set(SITE_CONTENT_DEFINITIONS.map((item) => item.section)))];
  const visible = section === 'all' ? merged : merged.filter((item) => item.section === section);

  async function save(definition, values) {
    setError('');
    setFeedback('');
    try {
      const style = resolveEditableTextStyle(definition.key, definition, definition);
      await upsertSiteContent({
        content_key: definition.key,
        section: definition.section,
        label_it: definition.label_it,
        label_en: definition.label_en,
        value_it: values.value_it,
        value_en: values.value_en,
        default_it: definition.default_it,
        default_en: definition.default_en,
        content_type: definition.type === 'textarea' ? 'textarea' : 'text',
        style_variant: style.style_variant,
        text_size: style.text_size,
        text_align: style.text_align,
        visible: definition.visible !== false,
        layout_variant: definition.layout_variant || 'default',
        active: values.active,
        updated_by: session.user.id
      });
      setFeedback(adminCopy(lang, 'Contenuto salvato.', 'Content saved.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Contenuto non salvato.', 'Content not saved.'));
    }
  }

  return (
    <section className={compactHeader ? "admin-subpage" : "admin-page"}>
      {!compactHeader && (
        <div className="admin-page-header">
          <div>
            <span className="kicker">{adminCopy(lang, 'Testi sito', 'Site texts')}</span>
            <h1>{adminCopy(lang, 'Contenuti', 'Content')}</h1>
            <p>{adminCopy(lang, 'Modifica testi pubblici in italiano e inglese senza cambiare codice. Se un campo resta vuoto, il sito usa il fallback statico.', 'Edit public Italian and English copy without changing code. Empty fields fall back to static defaults.')}</p>
          </div>
          <button className="button secondary" type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
        </div>
      )}
      {compactHeader && <div className="admin-subpage-actions"><button className="button secondary" type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna testi', 'Refresh text')}</button></div>}
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      <div className="admin-filter-bar content-filter-bar">
        <select value={section} onChange={(event) => setSection(event.target.value)} aria-label={adminCopy(lang, 'Sezione', 'Section')}>
          {sections.map((value) => <option key={value} value={value}>{value === 'all' ? adminCopy(lang, 'Tutte le sezioni', 'All sections') : value}</option>)}
        </select>
      </div>
      {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : (
        <div className="content-admin-grid">
          {visible.map((item) => <ContentEditorCard key={item.key} item={item} lang={lang} onSave={save} />)}
        </div>
      )}
    </section>
  );
}

function ContentEditorCard({ item, lang, onSave }) {
  const [form, setForm] = useState({ value_it: item.value_it ?? item.default_it ?? '', value_en: item.value_en ?? item.default_en ?? '', active: item.active !== false });
  useEffect(() => {
    setForm({ value_it: item.value_it ?? item.default_it ?? '', value_en: item.value_en ?? item.default_en ?? '', active: item.active !== false });
  }, [item.key, item.value_it, item.value_en, item.active]);
  const Field = item.type === 'textarea' || item.content_type === 'textarea' ? 'textarea' : 'input';
  return (
    <article className="content-admin-card">
      <div>
        <span className="micro-label">{item.section} · {item.key}</span>
        <h3>{lang === 'it' ? item.label_it : item.label_en}</h3>
      </div>
      <label className="admin-field full"><span>Italiano</span><Field rows={4} value={form.value_it} onChange={(event) => setForm((current) => ({ ...current, value_it: event.target.value }))} /></label>
      <label className="admin-field full"><span>English</span><Field rows={4} value={form.value_en} onChange={(event) => setForm((current) => ({ ...current, value_en: event.target.value }))} /></label>
      <p className="small-note">{adminCopy(lang, 'Fallback IT', 'Fallback IT')}: {item.default_it || '—'}<br />{adminCopy(lang, 'Fallback EN', 'Fallback EN')}: {item.default_en || '—'}</p>
      <label className="check-field"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> {adminCopy(lang, 'Attivo', 'Active')}</label>
      <div className="request-actions">
        <button className="button primary" type="button" onClick={() => onSave(item, form)}>{adminCopy(lang, 'Salva', 'Save')}</button>
        <button className="button secondary" type="button" onClick={() => setForm({ value_it: item.default_it || '', value_en: item.default_en || '', active: true })}>{adminCopy(lang, 'Ripristina fallback', 'Restore fallback')}</button>
      </div>
      {item.updated_at && <p className="small-note">{adminCopy(lang, 'Ultimo aggiornamento', 'Last updated')}: {formatDateForMessage(String(item.updated_at).slice(0, 10), lang)}</p>}
    </article>
  );
}

const FINANCE_CATEGORIES = {
  income: [
    ['booking_payment', 'Pagamento prenotazione', 'Booking payment'],
    ['deposit', 'Acconto', 'Deposit'],
    ['balance_payment', 'Saldo', 'Balance payment'],
    ['private_experience', 'Esperienza privata', 'Private experience'],
    ['fixed_excursion', 'Escursione fissa', 'Fixed excursion'],
    ['booking_code_expected', 'Codice prenotazione atteso', 'Expected booking-code income'],
    ['gift_card', 'Gift Card', 'Gift Card'],
    ['other_income', 'Altra entrata', 'Other income']
  ],
  expense: [
    ['fuel', 'Carburante', 'Fuel'],
    ['equipment', 'Attrezzatura', 'Equipment'],
    ['guide_cost', 'Costo guida', 'Guide cost'],
    ['transport', 'Trasporto', 'Transport'],
    ['food_supplies', 'Cibo / forniture', 'Food / supplies'],
    ['marketing', 'Marketing', 'Marketing'],
    ['maintenance', 'Manutenzione', 'Maintenance'],
    ['permits', 'Permessi', 'Permits'],
    ['other_expense', 'Altra spesa', 'Other expense']
  ]
};

const FINANCE_DATE_FILTERS = [
  ['all', 'Tutte le date', 'All dates'],
  ['specific-date', 'Data specifica', 'Specific date'],
  ['specific-month', 'Mese specifico', 'Specific month'],
  ['last-month', 'Mese scorso', 'Last month'],
  ['next-month', 'Mese prossimo', 'Next month'],
  ['last-3-months', 'Ultimi 3 mesi', 'Last 3 months'],
  ['next-3-months', 'Prossimi 3 mesi', 'Next 3 months'],
  ['last-6-months', 'Ultimi 6 mesi', 'Last 6 months'],
  ['next-6-months', 'Prossimi 6 mesi', 'Next 6 months'],
  ['last-year', 'Anno scorso', 'Last year'],
  ['current-year', 'Anno corrente', 'Current year'],
  ['next-year', 'Anno prossimo', 'Next year'],
  ['custom', 'Intervallo personalizzato', 'Custom range']
];

function financeCategoryLabel(value, lang) {
  const found = [...FINANCE_CATEGORIES.income, ...FINANCE_CATEGORIES.expense].find(([key]) => key === value);
  return found ? (lang === 'it' ? found[1] : found[2]) : value || '-';
}

function financeDateFilterLabel(value, lang) {
  const found = FINANCE_DATE_FILTERS.find(([key]) => key === value);
  return found ? (lang === 'it' ? found[1] : found[2]) : value || '';
}

function parseLocalIsoDate(value) {
  const clean = String(value || '').trim();
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
}

function monthValueFromDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function firstDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function lastDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0, 0);
}

function addMonthsDate(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0);
}

function financeRangeLabel(startDate, endDate, lang, fallback = '') {
  if (!startDate && !endDate) return fallback || adminCopy(lang, 'Tutte le date', 'All dates');
  if (startDate && endDate && startDate === endDate) return formatDateForMessage(startDate, lang);
  if (startDate && endDate) return `${formatDateForMessage(startDate, lang)} – ${formatDateForMessage(endDate, lang)}`;
  if (startDate) return `${adminCopy(lang, 'Da', 'From')} ${formatDateForMessage(startDate, lang)}`;
  return `${adminCopy(lang, 'Fino a', 'Until')} ${formatDateForMessage(endDate, lang)}`;
}

function resolveFinanceDateRange(filters, lang) {
  const mode = filters.dateMode || 'all';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  const isoRange = (start, end, fallback = '') => {
    const startDate = start ? dateToIso(start) : '';
    const endDate = end ? dateToIso(end) : '';
    return { startDate, endDate, label: financeRangeLabel(startDate, endDate, lang, fallback) };
  };

  if (mode === 'specific-date') {
    const date = parseLocalIsoDate(filters.specificDate);
    return date ? isoRange(date, date) : { startDate: '', endDate: '', label: adminCopy(lang, 'Scegli una data', 'Choose a date') };
  }

  if (mode === 'specific-month') {
    const [year, month] = String(filters.specificMonth || '').split('-').map(Number);
    if (!year || !month) return { startDate: '', endDate: '', label: adminCopy(lang, 'Scegli un mese', 'Choose a month') };
    const start = new Date(year, month - 1, 1, 12, 0, 0, 0);
    const end = lastDayOfMonth(start);
    return isoRange(start, end, monthLabel(start, lang));
  }

  if (mode === 'last-month') {
    const month = addMonthsDate(today, -1);
    return isoRange(firstDayOfMonth(month), lastDayOfMonth(month), monthLabel(month, lang));
  }

  if (mode === 'next-month') {
    const month = addMonthsDate(today, 1);
    return isoRange(firstDayOfMonth(month), lastDayOfMonth(month), monthLabel(month, lang));
  }

  if (mode === 'last-3-months') {
    return isoRange(firstDayOfMonth(addMonthsDate(today, -2)), lastDayOfMonth(today));
  }

  if (mode === 'next-3-months') {
    return isoRange(firstDayOfMonth(today), lastDayOfMonth(addMonthsDate(today, 2)));
  }

  if (mode === 'last-6-months') {
    return isoRange(firstDayOfMonth(addMonthsDate(today, -5)), lastDayOfMonth(today));
  }

  if (mode === 'next-6-months') {
    return isoRange(firstDayOfMonth(today), lastDayOfMonth(addMonthsDate(today, 5)));
  }

  if (mode === 'last-year') {
    const year = today.getFullYear() - 1;
    return isoRange(new Date(year, 0, 1, 12, 0, 0, 0), new Date(year, 11, 31, 12, 0, 0, 0), String(year));
  }

  if (mode === 'current-year') {
    const year = today.getFullYear();
    return isoRange(new Date(year, 0, 1, 12, 0, 0, 0), new Date(year, 11, 31, 12, 0, 0, 0), String(year));
  }

  if (mode === 'next-year') {
    const year = today.getFullYear() + 1;
    return isoRange(new Date(year, 0, 1, 12, 0, 0, 0), new Date(year, 11, 31, 12, 0, 0, 0), String(year));
  }

  if (mode === 'custom') {
    return {
      startDate: filters.fromDate || '',
      endDate: filters.toDate || '',
      label: financeRangeLabel(filters.fromDate || '', filters.toDate || '', lang, adminCopy(lang, 'Intervallo personalizzato', 'Custom range'))
    };
  }

  return { startDate: '', endDate: '', label: adminCopy(lang, 'Tutte le date', 'All dates') };
}

function financeEntryIsLinked(entry) {
  return financeEntryHasBusinessSource(entry) || Boolean(entry.linkedBooking || entry.linkedFixedExcursion || entry.linkedLeaflet);
}

function financeEntryCustomerName(entry) {
  return entry?.linkedBooking?.customer_name || '';
}

function enrichFinanceEntry(entry, { requestById, fixedById, leafletById }) {
  const linkedBooking = entry.booking_request_id ? requestById.get(entry.booking_request_id) || null : null;
  const fixedId = entry.fixed_excursion_id || linkedBooking?.fixed_excursion_id || '';
  const linkedFixedExcursion = fixedId ? fixedById.get(fixedId) || linkedBooking?.fixed_excursion || null : null;
  const linkedLeaflet = entry.leaflet_id ? leafletById.get(entry.leaflet_id) || null : null;
  return {
    ...entry,
    linkedBooking,
    linkedFixedExcursion,
    linkedLeaflet,
    isLinked: Boolean(linkedBooking || linkedFixedExcursion || linkedLeaflet || entry.booking_request_id || entry.fixed_excursion_id || entry.leaflet_id)
  };
}

function groupFinanceEntriesByCategory(entries, type) {
  const filtered = entries.filter((entry) => entry.type === type);
  const totalsByCurrency = new Map();
  filtered.forEach((entry) => { const currency = normalizeCurrency(entry.currency); totalsByCurrency.set(currency, (totalsByCurrency.get(currency) || 0) + Number(entry.amount || 0)); });
  const map = new Map();
  filtered.forEach((entry) => {
    const categoryKey = entry.category || (type === 'income' ? 'other_income' : 'other_expense');
    const currency = normalizeCurrency(entry.currency);
    const key = `${categoryKey}::${currency}`;
    const current = map.get(key) || { key, categoryKey, currency, type, entries: [], total: 0 };
    current.entries.push(entry);
    current.total += Number(entry.amount || 0);
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => b.total - a.total).map((item) => ({ ...item, percentage: (totalsByCurrency.get(item.currency) || 0) > 0 ? Math.round((item.total / totalsByCurrency.get(item.currency)) * 100) : 0 }));
}

function isVoidedFinanceEntry(entry) {
  return ['cancelled', 'void', 'voided'].includes(String(entry.status || '').toLowerCase()) || entry.active === false;
}

function isExpectedFinanceEntry(entry) {
  return ['pending', 'expected'].includes(String(entry.status || '').toLowerCase());
}

function calculateFinanceSummary(entries) {
  const activeEntries = entries.filter((entry) => !isVoidedFinanceEntry(entry));
  const ledger = calculateLedgerSummary(entries);
  const linkedBookingEntries = activeEntries.filter((entry) => entry.booking_request_id || entry.linkedBooking);
  const linkedFixedEntries = activeEntries.filter((entry) => entry.fixed_excursion_id || entry.linkedFixedExcursion);
  const unlinkedEntries = activeEntries.filter((entry) => !financeEntryIsLinked(entry));
  return {
    income: ledger.income,
    expenses: ledger.expenses,
    expectedIncome: ledger.expectedIncome,
    net: ledger.net,
    byCurrency: ledger.byCurrency,
    incomeEntries: ledger.incomeEntries,
    expectedEntries: ledger.expectedEntries,
    expenseEntries: ledger.expenseEntries,
    linkedBookingEntries,
    linkedFixedEntries,
    unlinkedEntries,
    incomeCategories: groupFinanceEntriesByCategory(ledger.incomeEntries, 'income'),
    expenseCategories: groupFinanceEntriesByCategory(ledger.expenseEntries, 'expense')
  };
}

function formatCurrencyMetricRows(rows = [], key, lang) {
  if (!rows.length) return formatMoney(0, 'EUR', lang);
  return rows.map((row) => formatMoney(row?.[key] || 0, row.currency || 'EUR', lang)).join(' · ');
}

const ANALYTICS_PERIODS = CANONICAL_ANALYTICS_PERIODS;

function analyticsPeriodLabel(key, lang) {
  return canonicalAnalyticsPeriodLabel(key, lang);
}

function analyticsDateRange(period) {
  return canonicalAnalyticsDateRange(period);
}

function valueOrUnknown(value, lang) {
  const clean = String(value || '').trim();
  return clean || adminCopy(lang, 'Non disponibile', 'Unknown');
}

function eventCount(events, name) {
  return events.filter((event) => event.event_name === name).length;
}

const SUBMIT_ATTEMPT_EVENTS = ['booking_form_submit_attempt', 'booking_submit_attempt'];

const VALIDATION_ERROR_EVENTS = ['booking_form_validation_error', 'booking_submit_validation_error'];

const SUBMIT_SUCCESS_EVENTS = ['booking_form_submit_success', 'booking_submit_success', 'booking_submit'];

const SUBMIT_ERROR_EVENTS = ['booking_form_submit_error', 'booking_submit_error'];

const BOOKING_CODE_REDEEM_ATTEMPT_EVENTS = ['booking_code_redeem_attempt', 'booking_code_submitted'];

const BOOKING_CODE_REDEEM_SUCCESS_EVENTS = ['booking_code_redeem_success', 'booking_code_redeemed'];

const BOOKING_CODE_REDEEM_ERROR_EVENTS = ['booking_code_redeem_error', 'booking_code_invalid'];

const MAP_CLICK_EVENTS = ['google_maps_click', 'maps_click'];

const CONTACT_ACTION_EVENTS = ['whatsapp_click', 'email_click', 'phone_click', 'google_maps_click', 'maps_click'];

function eventCountAny(events, names = []) {
  const preferred = names[0];
  const preferredCount = preferred ? eventCount(events, preferred) : 0;
  if (preferredCount) return preferredCount;
  return events.filter((event) => names.includes(event.event_name)).length;
}

function isEventName(event, names = []) {
  return names.includes(event?.event_name);
}

function normalizeAnalyticsPath(path = '') {
  const clean = `/${String(path || '/').split('?')[0]}`.replace(/\/{2,}/g, '/');
  return clean === '//' ? '/' : clean;
}

function isInternalAnalyticsRow(row = {}) {
  const path = normalizeAnalyticsPath(row.path || row.entry_path || row.exit_path || '');
  const section = String(row.section || row.metadata?.source_section || '').toLowerCase();
  if (path.startsWith('/admin') || path.startsWith('/api/')) return true;
  if (path === '/api/analytics/event') return true;
  if (section.includes('admin') || section.includes('finance') || section.includes('analytics') || section.includes('cms') || section.includes('editor')) return true;
  if (row.metadata?.cta_location === 'admin_preview_excluded') return true;
  return false;
}

function normalizedTrafficSourceForAnalytics(row = {}) {
  const metadata = row.metadata || {};
  const raw = String(metadata.utm_source || row.traffic_source || row.referrer_domain || '').toLowerCase().replace(/[-\s]+/g, '_');
  const medium = String(metadata.utm_medium || '').toLowerCase().replace(/[-\s]+/g, '_');
  if (raw.includes('referral') || medium === 'customer') return 'customer_referral';
  if (raw.includes('instagram') || raw === 'ig') return 'instagram';
  if (raw.includes('whatsapp') || raw === 'wa') return 'whatsapp';
  if (raw.includes('facebook') || raw === 'fb') return 'facebook';
  if (raw.includes('google_business_profile') || raw.includes('google_my_business') || raw === 'gbp') return 'google_business_profile';
  if (raw.includes('google')) return 'google';
  if (raw.includes('partner') || medium === 'partner') return 'partner';
  if (raw.includes('tiktok') || raw === 'tt') return 'tiktok';
  if (!raw || raw === 'direct') return 'direct';
  if (medium === 'share' && raw.includes('whatsapp')) return 'whatsapp';
  return 'other';
}

function trafficSourceLabel(source, lang) {
  if (source === 'direct') return adminCopy(lang, 'Diretto', 'Direct');
  if (source === 'whatsapp') return adminCopy(lang, 'WhatsApp condiviso', 'WhatsApp share');
  if (source === 'google_business_profile') return 'Google Business Profile';
  if (source === 'partner') return adminCopy(lang, 'Partner', 'Partner');
  if (source === 'tiktok') return 'TikTok';
  if (source === 'customer_referral' || source === 'referral') return adminCopy(lang, 'Referral cliente', 'Customer referral');
  if (source === 'other') return adminCopy(lang, 'Altri referrer', 'Other referrers');
  return source[0].toUpperCase() + source.slice(1);
}

function rawUnknown(value) {
  const clean = String(value || '').trim();
  return clean || 'unknown';
}

function uniqueCount(rows, key = 'visitor_id') {
  return new Set((rows || []).map((row) => row?.[key]).filter(Boolean)).size;
}

function percent(numerator, denominator) {
  if (!denominator) return '—';
  return `${Math.round((numerator / denominator) * 1000) / 10}%`;
}

function formatDuration(seconds) {
  const value = Math.round(Number(seconds || 0));
  if (!value) return '—';
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  const remaining = value % 60;
  return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function rowPercent(count, total) {
  return total ? `${Math.round((Number(count || 0) / total) * 100)}%` : '0%';
}

function topRows(rows, getKey, limit = 6, lang = 'it') {
  const counts = new Map();
  rows.forEach((row) => {
    const key = valueOrUnknown(getKey(row), lang);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function periodContains(row, range) {
  if (!range?.from && !range?.to) return true;
  const raw = row?.created_at || row?.occurred_at || row?.started_at;
  if (!raw) return false;
  const time = new Date(raw).getTime();
  if (Number.isNaN(time)) return false;
  if (range.from && time < new Date(range.from).getTime()) return false;
  if (range.to && time >= new Date(range.to).getTime()) return false;
  return true;
}

function averageEngagementSeconds(sessions, events) {
  const durations = (sessions || [])
    .map((session) => Math.min(1800, Number(session.duration_seconds || 0)))
    .filter((seconds) => seconds >= 2);
  if (durations.length) return durations.reduce((sum, value) => sum + value, 0) / durations.length;

  const grouped = new Map();
  (events || []).forEach((event) => {
    if (!event.session_id || !event.occurred_at) return;
    const time = new Date(event.occurred_at).getTime();
    if (Number.isNaN(time)) return;
    const current = grouped.get(event.session_id) || { min: time, max: time };
    current.min = Math.min(current.min, time);
    current.max = Math.max(current.max, time);
    grouped.set(event.session_id, current);
  });
  const derived = [...grouped.values()]
    .map((item) => Math.min(1800, Math.round((item.max - item.min) / 1000)))
    .filter((seconds) => seconds >= 2);
  if (!derived.length) return 0;
  return derived.reduce((sum, value) => sum + value, 0) / derived.length;
}

function eventMeta(event, key) {
  return event?.metadata && Object.prototype.hasOwnProperty.call(event.metadata, key) ? event.metadata[key] : '';
}

function eventBookingRequestId(event) {
  return String(eventMeta(event, 'booking_request_id') || eventMeta(event, 'request_id') || '').trim();
}

function eventBookingJourneyId(event) {
  return String(eventMeta(event, 'booking_journey_id') || eventMeta(event, 'analytics_journey_id') || '').trim();
}

function requestBookingJourneyId(request = {}) {
  return String(request.analytics_journey_id || request.booking_journey_id || '').trim();
}

function requestAnalyticsSessionId(request = {}) {
  return String(request.analytics_session_id || '').trim();
}

function requestCreatedAtTime(request) {
  const time = new Date(request?.created_at || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function eventOccurredAtTime(event) {
  const time = new Date(event?.occurred_at || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function trackingIncompleteLabel(lang) {
  return adminCopy(lang, 'Tracciamento incompleto', 'Incomplete tracking');
}

function isAdminManualRequest(request = {}) {
  return Boolean(request.created_by_admin) || ['manual', 'admin_manual'].includes(String(request.source || '').trim());
}

function normalizedPublicRequestSource(request = {}) {
  const source = String(request.source || '').trim();
  return source || 'website';
}

function isWebsiteFormRequest(request = {}) {
  if (isAdminManualRequest(request)) return false;
  return ['website', 'public_website', 'unknown'].includes(normalizedPublicRequestSource(request));
}

function isBookingCodeRequest(request = {}) {
  if (isAdminManualRequest(request)) return false;
  return normalizedPublicRequestSource(request) === 'booking_code';
}

function normalizedExperienceKey(value, lang) {
  const clean = String(value || '').trim();
  if (!clean || clean === 'unknown' || clean === 'unsure') return adminCopy(lang, 'Non specificata', 'Unspecified');
  return clean;
}

function eventExperienceKey(event, lang) {
  const key = eventMeta(event, 'experience_slug') || eventMeta(event, 'experience_id') || eventMeta(event, 'experience') || eventMeta(event, 'slug');
  if (key) return normalizedExperienceKey(key, lang);
  const requestType = String(eventMeta(event, 'request_type') || '').trim();
  if (['private', 'fixed', 'contact'].includes(requestType)) return requestType;
  return normalizedExperienceKey('', lang);
}

function requestExperienceKeyFromRequest(request, lang) {
  const key = request?.experience_slug || request?.experience_id || '';
  if (key && key !== 'unsure') return normalizedExperienceKey(key, lang);
  return normalizedExperienceKey(request?.request_type || '', lang);
}

function displayExperienceLabel(key, lang) {
  if (!key || key === adminCopy(lang, 'Non specificata', 'Unspecified')) return key || adminCopy(lang, 'Non specificata', 'Unspecified');
  const raw = String(key);
  if (raw === 'private') return adminCopy(lang, 'Privata', 'Private');
  if (raw === 'fixed') return adminCopy(lang, 'Escursione fissa', 'Fixed scheduled excursion');
  if (raw === 'contact') return adminCopy(lang, 'Contatto generico', 'Generic contact');
  const known = experiences.find((experience) => experience.id === raw || experience.slug === raw || experience.title === raw);
  return known ? known.title : raw.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function analyticsDropoff(current, previous, lang) {
  if (!previous) return '—';
  const rate = Math.max(0, 1 - (Number(current || 0) / Number(previous || 0)));
  return `${Math.round(rate * 1000) / 10}%`;
}

function groupKey(...parts) {
  return parts.map((part) => String(part || 'unknown').trim() || 'unknown').join('||');
}

function browserDeviceGroup(row) {
  const os = String(row?.operating_system || '').toLowerCase();
  const browser = String(row?.browser || '').toLowerCase();
  const device = String(row?.device_type || '').toLowerCase();
  if (os.includes('ios') && browser.includes('safari')) return 'iOS Safari';
  if (os.includes('android') && browser.includes('chrome')) return 'Android Chrome';
  if (device === 'desktop' && browser.includes('chrome')) return 'Desktop Chrome';
  return 'Other';
}

function sectionLabelForPath(event, lang) {
  const section = String(event?.section || '').trim();
  if (section) return section[0].toUpperCase() + section.slice(1);
  const path = String(event?.path || '').toLowerCase();
  if (path.includes('experience')) return adminCopy(lang, 'Esperienze', 'Experiences');
  if (path.includes('contact')) return adminCopy(lang, 'Contatti', 'Contact');
  if (path.includes('review')) return adminCopy(lang, 'Recensioni', 'Reviews');
  if (path === '/' || path.includes('#top')) return 'Home';
  return adminCopy(lang, 'Sconosciuto', 'Unknown');
}

function actionLabelForEvent(event, lang) {
  const name = event?.event_name;
  if (name === 'whatsapp_click') return 'WhatsApp';
  if (name === 'email_click') return 'Email';
  if (name === 'phone_click') return adminCopy(lang, 'Telefono', 'Phone');
  if (name === 'google_maps_click' || name === 'maps_click') return 'Google Maps';
  if (name === 'booking_form_open') return adminCopy(lang, 'Modulo', 'Booking form');
  if (name === 'booking_form_submit_success' || name === 'booking_submit_success' || name === 'booking_submit') return adminCopy(lang, 'Invio riuscito', 'Submit success');
  return sectionLabelForPath(event, lang);
}

function buildSessionPaths(events, lang) {
  const grouped = new Map();
  (events || []).forEach((event) => {
    if (!event.session_id) return;
    const list = grouped.get(event.session_id) || [];
    list.push(event);
    grouped.set(event.session_id, list);
  });
  const pathCounts = new Map();
  grouped.forEach((list) => {
    const ordered = list.slice().sort((a, b) => new Date(a.occurred_at || 0) - new Date(b.occurred_at || 0));
    const labels = [];
    ordered.forEach((event) => {
      const isAction = ['whatsapp_click', 'email_click', 'phone_click', 'google_maps_click', 'maps_click', 'booking_form_open', 'booking_form_submit_success', 'booking_submit_success', 'booking_submit'].includes(event.event_name);
      if (event.event_name !== 'page_view' && !isAction) return;
      const label = isAction ? actionLabelForEvent(event, lang) : sectionLabelForPath(event, lang);
      if (labels[labels.length - 1] !== label) labels.push(label);
    });
    if (!labels.length) return;
    const path = labels.slice(0, 6).join(' → ');
    const current = pathCounts.get(path) || { path, sessions: 0, contact_actions: 0, booking_form_opens: 0 };
    current.sessions += 1;
    current.contact_actions += ordered.filter((event) => ['whatsapp_click', 'email_click', 'phone_click'].includes(event.event_name)).length;
    current.booking_form_opens += ordered.filter((event) => event.event_name === 'booking_form_open').length;
    pathCounts.set(path, current);
  });
  return [...pathCounts.values()].sort((a, b) => b.sessions - a.sessions || b.contact_actions - a.contact_actions).slice(0, 5);
}

function bookingRequestsInPeriod(requests, range) {
  return (requests || []).filter((request) => periodContains(request, range) && isWebsiteFormRequest(request)).length;
}

function confirmedBookingRequestsInPeriod(requests, range) {
  return (requests || []).filter((request) => periodContains(request, range) && isWebsiteFormRequest(request) && ['accepted', 'confirmed', 'completed'].includes(request.status)).length;
}

function confirmedBookingCodeRequestsInPeriod(requests, range) {
  return (requests || []).filter((request) => periodContains(request, range) && isBookingCodeRequest(request) && ['accepted', 'confirmed', 'completed'].includes(request.status)).length;
}

function buildDeclaredAttributionRows({ events = [], bookingRequests = [], range, lang }) {
  const map = new Map();
  function ensure(source) {
    const normalized = normalizeHeardAboutUs(source, { allowAdmin: true });
    const key = normalized || 'missing';
    const row = map.get(key) || {
      key,
      source: key === 'missing' ? adminCopy(lang, 'Non disponibile', 'Not available') : heardAboutUsLabel(key, lang),
      booking_requests: 0,
      confirmed_bookings: 0,
      contact_events: 0,
      form_events: 0
    };
    map.set(key, row);
    return row;
  }

  (bookingRequests || []).filter((request) => periodContains(request, range)).forEach((request) => {
    const row = ensure(request.heard_about_us);
    row.booking_requests += 1;
    if (['accepted', 'confirmed', 'completed'].includes(request.status)) row.confirmed_bookings += 1;
  });

  (events || []).forEach((event) => {
    const source = eventMeta(event, 'heard_about_us');
    if (!source) return;
    const row = ensure(source);
    if (['whatsapp_click', 'email_click', 'phone_click'].includes(event.event_name)) row.contact_events += 1;
    if (['booking_form_field_start', 'booking_form_submit_attempt', 'booking_form_submit_success', 'booking_request_created'].includes(event.event_name)) row.form_events += 1;
  });

  return [...map.values()]
    .filter((row) => row.booking_requests || row.confirmed_bookings || row.contact_events || row.form_events)
    .map((row) => ({ ...row, details: '—' }))
    .sort((a, b) => (b.booking_requests + b.contact_events + b.form_events) - (a.booking_requests + a.contact_events + a.form_events));
}

function buildBookingRequestTrackingIntegrity({ requests = [], events = [], range, lang, isSubmitAttemptEvent, isSubmitSuccessEvent, isBookingCodeRedeemAttemptEvent, isBookingCodeRedeemSuccessEvent }) {
  const eventsByRequestId = new Map();
  const eventsByJourneyId = new Map();
  events.forEach((event) => {
    const requestId = eventBookingRequestId(event);
    if (requestId) {
      const list = eventsByRequestId.get(requestId) || [];
      list.push(event);
      eventsByRequestId.set(requestId, list);
    }
    const journeyId = eventBookingJourneyId(event);
    if (journeyId) {
      const list = eventsByJourneyId.get(journeyId) || [];
      list.push(event);
      eventsByJourneyId.set(journeyId, list);
    }
  });

  const legacySuccessEvents = events.filter((event) => isSubmitSuccessEvent(event) && !eventBookingRequestId(event) && !eventBookingJourneyId(event));
  const legacyAttemptEvents = events.filter((event) => isSubmitAttemptEvent(event) && !eventBookingRequestId(event) && !eventBookingJourneyId(event));
  const formOpenEvents = events.filter((event) => event.event_name === 'booking_form_open' && !eventBookingJourneyId(event));

  function legacyMatches(request, candidates) {
    const requestTime = requestCreatedAtTime(request);
    const requestKey = requestExperienceKeyFromRequest(request, lang);
    return candidates.filter((event) => {
      const eventTime = eventOccurredAtTime(event);
      if (!requestTime || !eventTime || Math.abs(requestTime - eventTime) > 2 * 60 * 60 * 1000) return false;
      return eventExperienceKey(event, lang) === requestKey;
    });
  }

  return (requests || [])
    .filter((request) => periodContains(request, range))
    .map((request) => {
      const id = String(request.id || '').trim();
      const journeyId = requestBookingJourneyId(request);
      const matchedEventsById = id ? (eventsByRequestId.get(id) || []) : [];
      const matchedEventsByJourney = journeyId ? (eventsByJourneyId.get(journeyId) || []) : [];
      const allProperEvents = [...matchedEventsById, ...matchedEventsByJourney].filter((event, index, array) => array.findIndex((candidate) => candidate.id === event.id) === index);

      const matchedAttemptById = matchedEventsById.find(isSubmitAttemptEvent);
      const matchedSuccessById = matchedEventsById.find(isSubmitSuccessEvent);
      const matchedCreatedById = matchedEventsById.find((event) => event.event_name === 'booking_request_created');
      const matchedFormOpenById = matchedEventsById.find((event) => event.event_name === 'booking_form_open');
      const matchedAttemptByJourney = matchedEventsByJourney.find(isSubmitAttemptEvent);
      const matchedSuccessByJourney = matchedEventsByJourney.find(isSubmitSuccessEvent);
      const matchedCreatedByJourney = matchedEventsByJourney.find((event) => event.event_name === 'booking_request_created');
      const matchedFormOpenByJourney = matchedEventsByJourney.find((event) => event.event_name === 'booking_form_open');
      const matchedCodeAttemptById = matchedEventsById.find(isBookingCodeRedeemAttemptEvent);
      const matchedCodeSuccessById = matchedEventsById.find(isBookingCodeRedeemSuccessEvent);
      const matchedCodeAttemptByJourney = matchedEventsByJourney.find(isBookingCodeRedeemAttemptEvent);
      const matchedCodeSuccessByJourney = matchedEventsByJourney.find(isBookingCodeRedeemSuccessEvent);

      const legacyAttempts = (matchedAttemptById || matchedAttemptByJourney) ? [] : legacyMatches(request, legacyAttemptEvents);
      const legacySuccesses = (matchedSuccessById || matchedSuccessByJourney) ? [] : legacyMatches(request, legacySuccessEvents);
      const legacyFormOpens = (journeyId || matchedEventsById.length) ? [] : legacyMatches(request, formOpenEvents);

      const hasAttempt = Boolean(matchedAttemptById || matchedAttemptByJourney);
      const hasSuccess = Boolean(matchedSuccessById || matchedSuccessByJourney);
      const hasCreated = Boolean(matchedCreatedById || matchedCreatedByJourney);
      const hasFormOpen = Boolean(matchedFormOpenById || matchedFormOpenByJourney || legacyFormOpens.length);
      const adminManual = isAdminManualRequest(request);
      const bookingCodeRequest = isBookingCodeRequest(request);
      const hasCodeAttempt = Boolean(matchedCodeAttemptById || matchedCodeAttemptByJourney);
      const hasCodeSuccess = Boolean(matchedCodeSuccessById || matchedCodeSuccessByJourney);
      const hasJourneyOnlySuccess = Boolean(!matchedSuccessById && matchedSuccessByJourney);
      const hasRequestIdSuccess = Boolean(matchedSuccessById);
      const hasRequestIdCreatedOnly = Boolean(!hasSuccess && matchedCreatedById);
      const hasJourneyCreatedOnly = Boolean(!hasSuccess && !matchedCreatedById && matchedCreatedByJourney);
      const hasLegacyOnly = Boolean(legacySuccesses.length || legacyAttempts.length || legacyFormOpens.length);

      const matchMethod = adminManual
        ? 'admin_manual'
        : bookingCodeRequest
          ? (hasCodeSuccess ? 'booking_code_redeem_success' : hasCodeAttempt ? 'booking_code_redeem_attempt_only' : 'booking_code_tracking_separate')
          : hasRequestIdSuccess
            ? 'matched_by_booking_request_id'
            : hasJourneyOnlySuccess
              ? 'matched_by_journey_id'
              : hasRequestIdCreatedOnly
                ? 'matched_created_event_only_by_booking_request_id'
                : hasJourneyCreatedOnly
                  ? 'matched_created_event_only_by_journey_id'
                  : hasLegacyOnly
                    ? 'matched_by_legacy_heuristic'
                    : 'missing_submit_tracking';

      const createdDate = String(request.created_at || '').slice(0, 10);
      const legacyCutoff = '2026-06-29';
      const bookingCodeCutoff = '2026-07-04';
      const status = adminManual
        ? 'admin_manual'
        : bookingCodeRequest
          ? (hasCodeSuccess
            ? 'booking_code_redeem_success'
            : createdDate && createdDate < bookingCodeCutoff
              ? 'booking_code_legacy_untracked'
              : 'booking_code_missing_redeem_success')
          : hasRequestIdSuccess
            ? 'matched_by_booking_request_id'
            : hasJourneyOnlySuccess
              ? 'matched_by_journey_id'
              : hasRequestIdCreatedOnly || hasJourneyCreatedOnly
                ? 'created_event_without_submit_success'
                : hasLegacyOnly
                  ? 'matched_by_legacy_heuristic'
                  : createdDate && createdDate < legacyCutoff
                    ? 'legacy_missing_tracking'
                    : 'missing_submit_tracking';

      return {
        booking_request_id: id || null,
        analytics_journey_id: journeyId || null,
        analytics_session_id: requestAnalyticsSessionId(request) || null,
        created_at: request.created_at,
        request_type: request.request_type,
        experience_id: request.experience_id,
        source: request.source || 'website',
        created_by_admin: Boolean(request.created_by_admin),
        matched_submit_attempt: hasAttempt,
        matched_submit_success: hasSuccess,
        matched_booking_request_created_event: hasCreated,
        matched_form_open: hasFormOpen,
        matched_booking_code_redeem_attempt: hasCodeAttempt,
        matched_booking_code_redeem_success: hasCodeSuccess,
        legacy_matched_submit_attempt: Boolean(legacyAttempts.length),
        legacy_matched_submit_success: Boolean(legacySuccesses.length),
        legacy_matched_form_open: Boolean(legacyFormOpens.length),
        submit_attempt_at: (matchedAttemptById || matchedAttemptByJourney)?.occurred_at || null,
        submit_success_at: (matchedSuccessById || matchedSuccessByJourney)?.occurred_at || null,
        booking_request_created_event_at: (matchedCreatedById || matchedCreatedByJourney)?.occurred_at || null,
        booking_code_redeem_attempt_at: (matchedCodeAttemptById || matchedCodeAttemptByJourney)?.occurred_at || null,
        booking_code_redeem_success_at: (matchedCodeSuccessById || matchedCodeSuccessByJourney)?.occurred_at || null,
        proper_event_count: allProperEvents.length,
        tracking_match_method: matchMethod,
        tracking_integrity_status: status,
        heard_about_us: normalizeHeardAboutUs(request.heard_about_us, { allowAdmin: true }) || null,
        heard_about_us_label: heardAboutUsLabel(request.heard_about_us, lang, { fallback: '' }) || null,
        // Analytics diagnostics intentionally retain only the categorical source.
        // Free-form "Other" text remains a booking-record concern, not analytics data.
        heard_about_us_display: heardAboutUsLabel(request.heard_about_us, lang, { fallback: '' }) || null
      };
    });
}

function buildAnalyticsModel({ events: inputEvents = [], sessions: inputSessions = [], bookingRequests = [], range, lang }) {
  const rawEvents = inputEvents || [];
  const rawSessions = inputSessions || [];
  const internalEventsExcluded = rawEvents.filter(isInternalAnalyticsRow).length;
  const internalSessionsExcluded = rawSessions.filter(isInternalAnalyticsRow).length;
  const events = rawEvents.filter((event) => !isInternalAnalyticsRow(event));
  const sessions = rawSessions.filter((session) => !isInternalAnalyticsRow(session));
  const pageViews = eventCount(events, 'page_view');
  const formOpens = eventCount(events, 'booking_form_open');
  const fieldStarts = eventCount(events, 'booking_form_field_start');
  const hasNewSubmitAttempts = eventCount(events, 'booking_form_submit_attempt') > 0;
  const hasNewValidationErrors = eventCount(events, 'booking_form_validation_error') > 0;
  const hasNewSubmitSuccesses = eventCount(events, 'booking_form_submit_success') > 0;
  const hasNewSubmitErrors = eventCount(events, 'booking_form_submit_error') > 0;
  const hasNewMapClicks = eventCount(events, 'google_maps_click') > 0;
  const submitAttempts = eventCountAny(events, SUBMIT_ATTEMPT_EVENTS);
  const validationErrors = eventCountAny(events, VALIDATION_ERROR_EVENTS);
  const submitSuccesses = eventCountAny(events, SUBMIT_SUCCESS_EVENTS);
  const submitErrors = eventCountAny(events, SUBMIT_ERROR_EVENTS);
  const bookingCodeRedeemAttempts = eventCountAny(events, BOOKING_CODE_REDEEM_ATTEMPT_EVENTS);
  const bookingCodeRedeemSuccesses = eventCountAny(events, BOOKING_CODE_REDEEM_SUCCESS_EVENTS);
  const bookingCodeRedeemErrors = eventCountAny(events, BOOKING_CODE_REDEEM_ERROR_EVENTS);
  const bookingRequestCreatedEvents = eventCount(events, 'booking_request_created');
  const websiteRequestRows = (bookingRequests || []).filter((request) => periodContains(request, range) && isWebsiteFormRequest(request));
  const bookingCodeRequestRows = (bookingRequests || []).filter((request) => periodContains(request, range) && isBookingCodeRequest(request));
  const websiteRequestIds = new Set(websiteRequestRows.map((request) => String(request.id || '').trim()).filter(Boolean));
  const adminManualRequestRows = (bookingRequests || []).filter((request) => periodContains(request, range) && isAdminManualRequest(request));
  const websiteRequests = websiteRequestRows.length;
  const bookingCodeRequests = bookingCodeRequestRows.length;
  const bookingRequestCount = Math.max(websiteRequests + bookingCodeRequests, bookingRequestCreatedEvents, submitSuccesses + bookingCodeRedeemSuccesses);
  const confirmedRequests = confirmedBookingRequestsInPeriod(bookingRequests, range);
  const confirmedBookingCodeRequests = confirmedBookingCodeRequestsInPeriod(bookingRequests, range);
  const visitors = uniqueCount(events, 'visitor_id') || uniqueCount(sessions, 'visitor_id');
  const whatsappClicks = eventCount(events, 'whatsapp_click');
  const emailClicks = eventCount(events, 'email_click');
  const phoneClicks = eventCount(events, 'phone_click');
  const mapsClicks = eventCountAny(events, MAP_CLICK_EVENTS);
  const contactClicks = whatsappClicks + emailClicks + phoneClicks;
  const conversionBase = visitors || pageViews;
  const averageSeconds = averageEngagementSeconds(sessions, events);
  const pageViewEvents = events.filter((event) => event.event_name === 'page_view');
  const experienceCardImpressions = eventCount(events, 'experience_card_view');
  const experienceDetailOpens = eventCount(events, 'experience_detail_open');
  const legacyExcursionViews = eventCount(events, 'excursion_view');
  const experienceViews = experienceDetailOpens || legacyExcursionViews;
  const sourceTotal = pageViewEvents.length || events.length || 1;
  const directTrafficCount = pageViewEvents.filter((event) => normalizedTrafficSourceForAnalytics(event) === 'direct').length;
  const directTrafficShare = sourceTotal ? directTrafficCount / sourceTotal : 0;
  const mobileCount = pageViewEvents.filter((event) => event.device_type === 'mobile').length;
  const mobileShare = pageViewEvents.length ? mobileCount / pageViewEvents.length : 0;
  const formJourneysStarted = eventCount(events, 'form_journey_started');
  const abandonedForms = eventCount(events, 'abandoned_form_detected');
  const recoveredByWhatsapp = eventCount(events, 'abandoned_form_recovered_whatsapp');
  const journeySubmitSuccesses = eventCount(events, 'form_submit_success');
  const abandonmentRate = percent(abandonedForms, formJourneysStarted || formOpens || fieldStarts);
  const recoveryRate = percent(recoveredByWhatsapp, abandonedForms);

  function isSubmitAttemptEvent(event) { return event.event_name === 'booking_form_submit_attempt' || (!hasNewSubmitAttempts && event.event_name === 'booking_submit_attempt'); }
  function isValidationErrorEvent(event) { return event.event_name === 'booking_form_validation_error' || (!hasNewValidationErrors && event.event_name === 'booking_submit_validation_error'); }
  function isSubmitSuccessEvent(event) { return event.event_name === 'booking_form_submit_success' || (!hasNewSubmitSuccesses && ['booking_submit_success', 'booking_submit'].includes(event.event_name)); }
  function isSubmitErrorEvent(event) { return event.event_name === 'booking_form_submit_error' || (!hasNewSubmitErrors && event.event_name === 'booking_submit_error'); }
  function isBookingCodeRedeemAttemptEvent(event) { return BOOKING_CODE_REDEEM_ATTEMPT_EVENTS.includes(event.event_name); }
  function isBookingCodeRedeemSuccessEvent(event) { return BOOKING_CODE_REDEEM_SUCCESS_EVENTS.includes(event.event_name); }
  function isMapClickEvent(event) { return event.event_name === 'google_maps_click' || (!hasNewMapClicks && event.event_name === 'maps_click'); }

  const sourceRows = ['direct', 'customer_referral', 'instagram', 'facebook', 'whatsapp', 'google_business_profile', 'google', 'partner', 'tiktok', 'other'].map((source) => ({
    label: trafficSourceLabel(source, lang),
    count: pageViewEvents.filter((event) => normalizedTrafficSourceForAnalytics(event) === source).length
  }));
  const countryRows = topRows(pageViewEvents, (event) => event.country_name || event.country_code, 6, lang);
  const cityRows = topRows(pageViewEvents, (event) => event.city, 6, lang);
  const topPageRows = topRows(pageViewEvents, (event) => normalizeAnalyticsPath(event.section || event.path), 7, lang);
  const experienceDemandEvents = experienceDetailOpens ? events.filter((event) => event.event_name === 'experience_detail_open') : events.filter((event) => event.event_name === 'excursion_view');
  const experienceRows = topRows(experienceDemandEvents, (event) => event.metadata?.experience_slug || event.metadata?.experience_id || event.metadata?.experience || event.metadata?.slug, 6, lang);
  const deviceRows = topRows(pageViewEvents, (event) => event.device_type, 5, lang);
  const browserRows = topRows(pageViewEvents, (event) => event.browser, 5, lang);
  const osRows = topRows(pageViewEvents, (event) => event.operating_system, 5, lang);
  const languageRows = [
    { label: adminCopy(lang, 'Pagine in italiano', 'Italian page views'), count: pageViewEvents.filter((event) => event.language === 'it').length, helper: uniqueCount(pageViewEvents.filter((event) => event.language === 'it'), 'visitor_id') },
    { label: adminCopy(lang, 'Pagine in inglese', 'English page views'), count: pageViewEvents.filter((event) => event.language === 'en').length, helper: uniqueCount(pageViewEvents.filter((event) => event.language === 'en'), 'visitor_id') },
    { label: adminCopy(lang, 'Cambi lingua', 'Language switches'), count: eventCount(events, 'language_switch') }
  ];
  const flowRows = [
    { label: adminCopy(lang, 'Visualizzazioni pagina', 'Page views'), count: pageViews },
    { label: adminCopy(lang, 'Impression card esperienze', 'Experience card impressions'), count: experienceCardImpressions },
    { label: adminCopy(lang, 'Aperture dettaglio esperienze', 'Experience detail opens'), count: experienceViews },
    { label: adminCopy(lang, 'Aperture modulo prenotazione', 'Booking form starts'), count: formOpens },
    { label: adminCopy(lang, 'Avvii compilazione modulo', 'Booking form field starts'), count: fieldStarts },
    { label: adminCopy(lang, 'Journey form avviati', 'Form journeys started'), count: formJourneysStarted },
    { label: adminCopy(lang, 'Form abbandonati', 'Abandoned forms'), count: abandonedForms },
    { label: adminCopy(lang, 'Recuperi WhatsApp', 'WhatsApp recoveries'), count: recoveredByWhatsapp },
    { label: adminCopy(lang, 'Tentativi invio modulo', 'Booking form submit attempts'), count: submitAttempts },
    { label: adminCopy(lang, 'Invii riusciti tracciati', 'Tracked successful submissions'), count: submitSuccesses },
    { label: adminCopy(lang, 'Richieste modulo sito create', 'Created website form requests'), count: websiteRequests },
    { label: adminCopy(lang, 'Richieste con codice create', 'Created booking-code requests'), count: bookingCodeRequests },
    { label: adminCopy(lang, 'Riscatti codice riusciti', 'Booking-code redeem successes'), count: bookingCodeRedeemSuccesses },
    { label: adminCopy(lang, 'Richieste create totali', 'Total created requests'), count: bookingRequestCount },
    { label: adminCopy(lang, 'Click WhatsApp', 'WhatsApp clicks'), count: whatsappClicks },
    { label: adminCopy(lang, 'Click email', 'Email clicks'), count: emailClicks },
    { label: adminCopy(lang, 'Click telefono', 'Phone clicks'), count: phoneClicks },
    { label: adminCopy(lang, 'Click Google Maps', 'Google Maps clicks'), count: mapsClicks }
  ];

  const mainFunnelSteps = [
    { label: adminCopy(lang, 'Visualizzazioni pagina', 'Page views'), count: pageViews },
    { label: adminCopy(lang, 'Aperture dettaglio esperienze', 'Experience detail opens'), count: experienceViews },
    { label: adminCopy(lang, 'Aperture modulo prenotazione', 'Booking form opens'), count: formOpens },
    { label: adminCopy(lang, 'Avvii compilazione', 'Field starts'), count: fieldStarts },
    { label: adminCopy(lang, 'Tentativi invio modulo', 'Form submit attempts'), count: submitAttempts },
    { label: adminCopy(lang, 'Errori validazione', 'Validation errors'), count: validationErrors },
    { label: adminCopy(lang, 'Invii riusciti tracciati', 'Tracked successful submissions'), count: submitSuccesses },
    { label: adminCopy(lang, 'Errori invio', 'Submit errors'), count: submitErrors },
    { label: adminCopy(lang, 'Richieste modulo sito create', 'Website form requests created'), count: websiteRequests },
    { label: adminCopy(lang, 'Richieste con codice create', 'Booking-code requests created'), count: bookingCodeRequests }
  ];
  const funnelDiagnostics = mainFunnelSteps.map((step, index) => ({
    step: step.label,
    count: step.count,
    dropoff: index === 0 ? '—' : analyticsDropoff(step.count, mainFunnelSteps[index - 1].count, lang)
  })).concat([
    { step: adminCopy(lang, 'Click WhatsApp', 'WhatsApp clicks'), count: whatsappClicks, dropoff: adminCopy(lang, 'Percorso contatto separato', 'Separate contact path') },
    { step: adminCopy(lang, 'Click email', 'Email clicks'), count: emailClicks, dropoff: adminCopy(lang, 'Percorso contatto separato', 'Separate contact path') },
    { step: adminCopy(lang, 'Click telefono', 'Phone clicks'), count: phoneClicks, dropoff: adminCopy(lang, 'Percorso contatto separato', 'Separate contact path') }
  ]);

  const formByExperienceMap = new Map();
  function ensureExperienceRow(key) {
    const normalized = normalizedExperienceKey(key, lang);
    const existing = formByExperienceMap.get(normalized) || {
      experience: displayExperienceLabel(normalized, lang),
      experience_views: 0,
      card_impressions: 0,
      detail_opens: 0,
      form_opens: 0,
      submit_attempts: 0,
      submit_successes: 0,
      submit_errors: 0,
      booking_requests: 0,
      confirmed_bookings: 0,
      whatsapp_clicks: 0,
      email_clicks: 0,
      phone_clicks: 0,
      view_to_request: '—',
      form_to_request: '—'
    };
    formByExperienceMap.set(normalized, existing);
    return existing;
  }
  events.forEach((event) => {
    const key = eventExperienceKey(event, lang);
    const row = ensureExperienceRow(key);
    if (event.event_name === 'experience_card_view') row.card_impressions += 1;
    if (event.event_name === 'experience_detail_open') { row.detail_opens += 1; row.experience_views += 1; }
    if (!experienceDetailOpens && event.event_name === 'excursion_view') row.experience_views += 1;
    if (event.event_name === 'booking_form_open') row.form_opens += 1;
    if (isSubmitAttemptEvent(event)) row.submit_attempts += 1;
    if (isSubmitSuccessEvent(event)) row.submit_successes += 1;
    if (isSubmitErrorEvent(event)) row.submit_errors += 1;
    if (event.event_name === 'booking_request_created' && String(eventMeta(event, 'source') || '').trim() !== 'booking_code') {
      const eventRequestId = eventBookingRequestId(event);
      if (!eventRequestId || !websiteRequestIds.has(eventRequestId)) row.booking_requests += 1;
    }
    if (event.event_name === 'whatsapp_click') row.whatsapp_clicks += 1;
    if (event.event_name === 'email_click') row.email_clicks += 1;
    if (event.event_name === 'phone_click') row.phone_clicks += 1;
  });
  websiteRequestRows.forEach((request) => {
    const row = ensureExperienceRow(requestExperienceKeyFromRequest(request, lang));
    row.booking_requests += 1;
    if (['accepted', 'confirmed', 'completed'].includes(request.status)) row.confirmed_bookings += 1;
  });
  const formByExperience = [...formByExperienceMap.values()]
    .map((row) => ({
      ...row,
      view_to_request: row.booking_requests && (!(row.experience_views || row.detail_opens) || row.booking_requests > (row.experience_views || row.detail_opens)) ? trackingIncompleteLabel(lang) : percent(row.booking_requests, row.experience_views || row.detail_opens),
      form_to_request: row.booking_requests && (!row.form_opens || row.booking_requests > row.form_opens) ? trackingIncompleteLabel(lang) : percent(row.booking_requests, row.form_opens)
    }))
    .filter((row) => row.experience_views || row.detail_opens || row.form_opens || row.submit_attempts || row.submit_successes || row.booking_requests || row.whatsapp_clicks || row.email_clicks || row.phone_clicks)
    .sort((a, b) => (b.booking_requests + b.form_opens + b.whatsapp_clicks + b.email_clicks + b.phone_clicks) - (a.booking_requests + a.form_opens + a.whatsapp_clicks + a.email_clicks + a.phone_clicks))
    .slice(0, 14);

  const formOpenMissingCtaCount = events.filter((event) => event.event_name === 'booking_form_open' && !eventMeta(event, 'cta_location') && !eventMeta(event, 'location')).length;

  const contactMap = new Map();
  events.filter((event) => CONTACT_ACTION_EVENTS.includes(event.event_name) || event.event_name === 'booking_form_open').forEach((event) => {
    const actionType = event.event_name === 'booking_form_open' ? adminCopy(lang, 'Modulo richiesta', 'Booking form')
      : event.event_name === 'whatsapp_click' ? 'WhatsApp'
        : event.event_name === 'email_click' ? 'Email'
          : event.event_name === 'phone_click' ? adminCopy(lang, 'Telefono', 'Phone')
            : 'Google Maps';
    if (event.event_name === 'maps_click' && hasNewMapClicks) return;
    const location = rawUnknown(eventMeta(event, 'cta_location') || eventMeta(event, 'location'));
    const device = rawUnknown(event.device_type);
    const language = String(event.language || '').toUpperCase() || 'unknown';
    const previous = rawUnknown(eventMeta(event, 'top_previous_section') || eventMeta(event, 'previous_section') || event.section);
    const key = groupKey(location, actionType, device, language, previous);
    const row = contactMap.get(key) || { cta_location: location, action_type: actionType, count: 0, device, language, top_previous_section: previous };
    row.count += 1;
    contactMap.set(key, row);
  });
  const contactPaths = [...contactMap.values()].sort((a, b) => b.count - a.count).slice(0, 12);

  const mobileMap = new Map();
  ['iOS Safari', 'Android Chrome', 'Desktop Chrome', 'Other'].forEach((group) => mobileMap.set(group, {
    device_browser: group,
    page_views: 0,
    experience_views: 0,
    detail_opens: 0,
    calendar_date_selections: 0,
    form_opens: 0,
    field_starts: 0,
    submit_attempts: 0,
    validation_errors: 0,
    submit_successes: 0,
    submit_errors: 0,
    booking_requests: 0,
    whatsapp_clicks: 0,
    email_clicks: 0,
    phone_clicks: 0
  }));
  events.forEach((event) => {
    const group = browserDeviceGroup(event);
    const row = mobileMap.get(group) || mobileMap.get('Other');
    if (event.event_name === 'page_view') row.page_views += 1;
    if (event.event_name === 'experience_card_view') row.card_impressions += 1;
    if (event.event_name === 'experience_detail_open') { row.detail_opens += 1; row.experience_views += 1; }
    if (!experienceDetailOpens && event.event_name === 'excursion_view') row.experience_views += 1;
    if (event.event_name === 'calendar_date_select') row.calendar_date_selections += 1;
    if (event.event_name === 'booking_form_open') row.form_opens += 1;
    if (event.event_name === 'booking_form_field_start') row.field_starts += 1;
    if (isSubmitAttemptEvent(event)) row.submit_attempts += 1;
    if (isValidationErrorEvent(event)) row.validation_errors += 1;
    if (isSubmitSuccessEvent(event)) row.submit_successes += 1;
    if (isSubmitErrorEvent(event)) row.submit_errors += 1;
    if (event.event_name === 'booking_request_created' && String(eventMeta(event, 'source') || '').trim() !== 'booking_code') {
      const eventRequestId = eventBookingRequestId(event);
      if (!eventRequestId || !websiteRequestIds.has(eventRequestId)) row.booking_requests += 1;
    }
    if (event.event_name === 'whatsapp_click') row.whatsapp_clicks += 1;
    if (event.event_name === 'email_click') row.email_clicks += 1;
    if (event.event_name === 'phone_click') row.phone_clicks += 1;
  });
  const mobileFunnel = [...mobileMap.values()].filter((row) => Object.entries(row).some(([key, value]) => key !== 'device_browser' && Number(value) > 0));

  const languageConversion = ['it', 'en'].map((language) => {
    const rows = events.filter((event) => event.language === language);
    return {
      language: language.toUpperCase(),
      actions: rows.length,
      page_views: rows.filter((event) => event.event_name === 'page_view').length,
      form_opens: rows.filter((event) => event.event_name === 'booking_form_open').length,
      submit_attempts: rows.filter(isSubmitAttemptEvent).length,
      submit_successes: rows.filter(isSubmitSuccessEvent).length,
      whatsapp_clicks: rows.filter((event) => event.event_name === 'whatsapp_click').length,
      email_clicks: rows.filter((event) => event.event_name === 'email_click').length,
      language_switches: rows.filter((event) => event.event_name === 'language_switch').length
    };
  });

  const geoMap = new Map();
  events.forEach((event) => {
    const countryCity = [event.country_name || event.country_code, event.city].filter(Boolean).join(' / ') || 'unknown';
    const language = String(event.language || '').toUpperCase() || 'unknown';
    const device = rawUnknown(event.device_type);
    const key = groupKey(countryCity, language, device);
    const row = geoMap.get(key) || { country_city: countryCity, actions: 0, language, form_opens: 0, contact_clicks: 0, device };
    row.actions += 1;
    if (event.event_name === 'booking_form_open') row.form_opens += 1;
    if (['whatsapp_click', 'email_click', 'phone_click'].includes(event.event_name)) row.contact_clicks += 1;
    geoMap.set(key, row);
  });
  const geographyHypotheses = [...geoMap.values()].sort((a, b) => b.actions - a.actions).slice(0, 12);

  const declaredAttributionRows = buildDeclaredAttributionRows({ events, bookingRequests, range, lang });

  const trafficAttributionQuality = ['direct', 'instagram', 'facebook', 'whatsapp', 'google_business_profile', 'google', 'partner', 'tiktok', 'other'].map((source) => ({
    source: trafficSourceLabel(source, lang),
    count: pageViewEvents.filter((event) => normalizedTrafficSourceForAnalytics(event) === source).length,
    notes: source === 'direct'
      ? adminCopy(lang, 'Solo sessioni senza UTM o referrer utile', 'Only sessions with no UTM or useful referrer')
      : source === 'whatsapp'
        ? adminCopy(lang, 'Da utm_source=whatsapp o referrer WhatsApp', 'From utm_source=whatsapp or WhatsApp referrer')
        : source === 'other'
          ? adminCopy(lang, 'Referrer esterni non classificati', 'Unclassified external referrers')
          : adminCopy(lang, 'Da UTM o referrer riconosciuto', 'From recognized UTM or referrer')
  }));

  const requestTrackingIntegrity = buildBookingRequestTrackingIntegrity({ requests: bookingRequests, events, range, lang, isSubmitAttemptEvent, isSubmitSuccessEvent, isBookingCodeRedeemAttemptEvent, isBookingCodeRedeemSuccessEvent });
  const websiteFormRequestTrackingIntegrity = requestTrackingIntegrity.filter((row) => isWebsiteFormRequest(row));
  const bookingCodeRequestTrackingIntegrity = requestTrackingIntegrity.filter((row) => isBookingCodeRequest(row));
  const requestsMatchedByBookingRequestId = websiteFormRequestTrackingIntegrity.filter((row) => row.tracking_integrity_status === 'matched_by_booking_request_id').length;
  const requestsMatchedByJourneyId = websiteFormRequestTrackingIntegrity.filter((row) => row.tracking_integrity_status === 'matched_by_journey_id').length;
  const requestsMatchedByLegacyHeuristic = websiteFormRequestTrackingIntegrity.filter((row) => row.tracking_integrity_status === 'matched_by_legacy_heuristic').length;
  const requestsCreatedEventOnly = websiteFormRequestTrackingIntegrity.filter((row) => row.tracking_integrity_status === 'created_event_without_submit_success').length;
  const requestsWithTrackedSubmit = requestsMatchedByBookingRequestId + requestsMatchedByJourneyId;
  const websiteSubmitGapStatuses = ['missing_submit_tracking', 'legacy_missing_tracking', 'created_event_without_submit_success', 'matched_by_legacy_heuristic'];
  const websiteSubmitGapRows = websiteFormRequestTrackingIntegrity.filter((row) => websiteSubmitGapStatuses.includes(row.tracking_integrity_status));
  const currentRequestsWithoutTrackedSubmitRows = websiteSubmitGapRows.filter(isCurrentTrackingRecord);
  const historicalRequestsWithoutTrackedSubmitRows = websiteSubmitGapRows.filter((row) => !isCurrentTrackingRecord(row));
  const requestsWithoutTrackedSubmit = websiteSubmitGapRows.length;
  const currentRequestsWithoutTrackedSubmit = currentRequestsWithoutTrackedSubmitRows.length;
  const historicalRequestsWithoutTrackedSubmit = historicalRequestsWithoutTrackedSubmitRows.length;
  const legacyIncompleteRequests = historicalRequestsWithoutTrackedSubmit;
  const websiteSubmitGapDetail = currentRequestsWithoutTrackedSubmit
    ? trackingIncompleteLabel(lang)
    : historicalRequestsWithoutTrackedSubmit
      ? adminCopy(lang, 'Solo storico precedente al contratto di tracking corrente: non viene ricostruito artificialmente.', 'Historical data only, before the current tracking contract: not backfilled artificially.')
      : '—';

  const currentWebsiteFormRows = websiteFormRequestTrackingIntegrity.filter(isCurrentTrackingRecord);
  const currentRequestsWithoutTrackedFormOpenRows = currentWebsiteFormRows.filter((row) => !row.matched_form_open);
  const historicalRequestsWithoutTrackedFormOpenRows = websiteFormRequestTrackingIntegrity.filter((row) => !isCurrentTrackingRecord(row) && !row.matched_form_open);
  const currentFormOpenGapMap = new Map();
  currentRequestsWithoutTrackedFormOpenRows.forEach((row) => {
    const experience = displayExperienceLabel(requestExperienceKeyFromRequest(row, lang), lang);
    currentFormOpenGapMap.set(experience, (currentFormOpenGapMap.get(experience) || 0) + 1);
  });
  const requestsWithoutTrackedFormOpen = [...currentFormOpenGapMap.entries()].map(([experience, booking_requests]) => ({ experience, booking_requests }));
  const currentCanonicalSubmitErrors = events.filter((event) => isSubmitErrorEvent(event) && eventOccurredAtTime(event) >= CURRENT_TRACKING_ACTIVATION_MS);
  const currentSubmitErrors = currentCanonicalSubmitErrors.length;
  const currentSubmitErrorDevices = [...new Set(currentCanonicalSubmitErrors.map((event) => browserDeviceGroup(event)).filter(Boolean))];
  const bookingCodeRequestsWithRedeemSuccess = bookingCodeRequestTrackingIntegrity.filter((row) => row.tracking_integrity_status === 'booking_code_redeem_success').length;
  const bookingCodeRequestsWithoutRedeemSuccess = bookingCodeRequestTrackingIntegrity.filter((row) => ['booking_code_missing_redeem_success', 'booking_code_legacy_untracked'].includes(row.tracking_integrity_status)).length;

  const dataQualityRows = [
    { check: adminCopy(lang, 'Richieste modulo sito create', 'Created website form requests'), count: websiteRequests, detail: adminCopy(lang, 'Solo source=website/public_website/unknown, esclusi codici prenotazione e richieste admin/manuali.', 'Only source=website/public_website/unknown, excluding booking-code and admin/manual requests.') },
    { check: adminCopy(lang, 'Richieste con codice create', 'Created booking-code requests'), count: bookingCodeRequests, detail: adminCopy(lang, 'Tracciate separatamente dal funnel del modulo pubblico.', 'Tracked separately from the public form funnel.') },
    { check: adminCopy(lang, 'Richieste admin/manuali create', 'Created admin/manual requests'), count: adminManualRequestRows.length, detail: adminCopy(lang, 'Escluse dal funnel pubblico sito.', 'Excluded from the public website funnel.') },
    { check: adminCopy(lang, 'Richieste sito con submit_success', 'Website requests with tracked submit_success'), count: requestsWithTrackedSubmit, detail: adminCopy(lang, 'Conta solo match puliti tramite booking_request_id o booking_journey_id con submit_success.', 'Counts only clean booking_request_id or booking_journey_id matches with submit_success.') },
    { check: adminCopy(lang, 'Gap submit correnti', 'Current submit tracking gaps'), count: currentRequestsWithoutTrackedSubmit, detail: currentRequestsWithoutTrackedSubmit ? trackingIncompleteLabel(lang) : '—' },
    { check: adminCopy(lang, 'Gap submit storici esclusi dagli alert', 'Historical submit gaps excluded from alerts'), count: historicalRequestsWithoutTrackedSubmit, detail: websiteSubmitGapDetail },
    { check: adminCopy(lang, 'Richieste sito matchate tramite journey id', 'Website requests matched by journey id'), count: requestsMatchedByJourneyId, detail: adminCopy(lang, 'Match tramite booking_requests.analytics_journey_id = analytics_events.metadata.booking_journey_id.', 'Match via booking_requests.analytics_journey_id = analytics_events.metadata.booking_journey_id.') },
    { check: adminCopy(lang, 'Richieste sito matchate tramite booking_request_id', 'Website requests matched by booking_request_id'), count: requestsMatchedByBookingRequestId, detail: adminCopy(lang, 'Match tramite analytics_events.metadata.booking_request_id.', 'Match via analytics_events.metadata.booking_request_id.') },
    { check: adminCopy(lang, 'Richieste sito matchate solo da euristica legacy', 'Website requests matched only by legacy heuristic'), count: requestsMatchedByLegacyHeuristic, detail: requestsMatchedByLegacyHeuristic ? adminCopy(lang, 'Warning: non contano come invio tracciato correttamente.', 'Warning: these do not count as properly tracked submits.') : '—' },
    { check: adminCopy(lang, 'Eventi richiesta sito senza submit_success', 'Website request events without submit_success'), count: requestsCreatedEventOnly, detail: requestsCreatedEventOnly ? adminCopy(lang, 'Esiste booking_request_created, ma manca booking_form_submit_success.', 'booking_request_created exists, but booking_form_submit_success is missing.') : '—' },
    { check: adminCopy(lang, 'Riscatti codice con redeem_success', 'Booking-code redemptions with redeem_success'), count: bookingCodeRequestsWithRedeemSuccess, detail: adminCopy(lang, 'Match tramite booking_request_id su evento booking_code_redeem_success.', 'Matched by booking_request_id on booking_code_redeem_success event.') },
    { check: adminCopy(lang, 'Richieste codice senza redeem_success', 'Booking-code requests without redeem_success'), count: bookingCodeRequestsWithoutRedeemSuccess, detail: bookingCodeRequestsWithoutRedeemSuccess ? adminCopy(lang, 'Non contano come problema del modulo sito. Verificare solo il tracciamento del riscatto codice.', 'Not counted as a website form issue. Check only booking-code redemption tracking.') : '—' },
    { check: adminCopy(lang, 'Tentativi riscatto codice', 'Booking-code redeem attempts'), count: bookingCodeRedeemAttempts, detail: 'booking_code_redeem_attempt' },
    { check: adminCopy(lang, 'Errori riscatto codice', 'Booking-code redeem errors'), count: bookingCodeRedeemErrors, detail: bookingCodeRedeemErrors ? 'booking_code_redeem_error' : '—' },
    { check: adminCopy(lang, 'Tracciamento legacy incompleto', 'Incomplete legacy tracking'), count: legacyIncompleteRequests, detail: legacyIncompleteRequests ? adminCopy(lang, 'Dati precedenti alla correzione: non vengono ricostruiti artificialmente.', 'Pre-fix data: not backfilled artificially.') : '—' },
    { check: adminCopy(lang, 'Richieste correnti senza apertura modulo tracciata', 'Current website requests without tracked form open'), count: currentRequestsWithoutTrackedFormOpenRows.length, detail: currentRequestsWithoutTrackedFormOpenRows.map((row) => displayExperienceLabel(requestExperienceKeyFromRequest(row, lang), lang)).join(', ') || '—' },
    { check: adminCopy(lang, 'Gap apertura modulo storici', 'Historical form-open gaps'), count: historicalRequestsWithoutTrackedFormOpenRows.length, detail: historicalRequestsWithoutTrackedFormOpenRows.length ? adminCopy(lang, 'Storico escluso dagli alert correnti.', 'Historical records excluded from current alerts.') : '—' },
    { check: adminCopy(lang, 'Aperture modulo senza posizione CTA', 'Form opens without CTA location'), count: formOpenMissingCtaCount, detail: formOpenMissingCtaCount ? adminCopy(lang, 'Aggiornare i CTA che non inviano cta_location.', 'Update CTAs that do not send cta_location.') : '—' },
    { check: adminCopy(lang, 'Form abbandonati', 'Abandoned forms'), count: abandonedForms, detail: `${abandonmentRate} · ${adminCopy(lang, 'recupero WhatsApp', 'WhatsApp recovery')}: ${recoveryRate}` },
    { check: adminCopy(lang, 'Traffico interno escluso', 'Internal traffic excluded'), count: internalEventsExcluded + internalSessionsExcluded, detail: adminCopy(lang, 'Admin, API, CMS/editor, finanze e dashboard analytics esclusi dalle metriche pubbliche.', 'Admin, API, CMS/editor, finance, and analytics dashboard rows excluded from public metrics.') },
    { check: adminCopy(lang, 'Campione insufficiente per conclusioni marketing', 'Sample too small for marketing conclusions'), count: visitors < SMALL_SAMPLE_VISITOR_THRESHOLD ? visitors : 0, detail: visitors < SMALL_SAMPLE_VISITOR_THRESHOLD ? adminCopy(lang, `Sotto ${SMALL_SAMPLE_VISITOR_THRESHOLD} visitatori: usare come diagnostica, non come prova marketing.`, `Below ${SMALL_SAMPLE_VISITOR_THRESHOLD} visitors: use as diagnostics, not as marketing proof.`) : '—' }
  ];

  const warnings = [];
  function addWarning(type, message, helper = '', detail = '') {
    warnings.push({ type, message, helper, detail });
  }
  if (currentRequestsWithoutTrackedSubmit > 0) {
    addWarning(
      'critical',
      adminCopy(lang, 'Il tracciamento del modulo sito è incompleto.', 'Website form tracking is incomplete.'),
      adminCopy(lang, `${currentRequestsWithoutTrackedSubmit} nuove richieste sito senza submit_success tracciato.`, `${currentRequestsWithoutTrackedSubmit} new website requests without tracked submit_success.`),
      adminCopy(
        lang,
        'Sono state create nuove richieste dal sito dopo la correzione del tracciamento, ma manca ancora un evento submit_success corrispondente. Testare il modulo pubblico e verificare che booking_form_submit_attempt, booking_form_submit_success e booking_request_created vengano salvati con lo stesso booking_journey_id o booking_request_id.',
        'New website requests were created after the tracking fix, but a matching submit_success event is still missing. Test the public form and verify booking_form_submit_attempt, booking_form_submit_success, and booking_request_created are written with the same booking_journey_id or booking_request_id.'
      )
    );
  }
  if (bookingCodeRequests > 0 && websiteRequests === 0) {
    addWarning(
      'diagnostic',
      adminCopy(lang, 'Le richieste con codice sono separate dal funnel del modulo pubblico.', 'Booking-code requests are separate from the public form funnel.'),
      adminCopy(lang, `${bookingCodeRequests} richieste con codice create.`, `${bookingCodeRequests} booking-code requests created.`),
      adminCopy(lang, 'Le richieste generate tramite codice prenotazione devono essere diagnosticate nel funnel booking-code, non come errori del modulo pubblico.', 'Requests created through booking codes should be diagnosed in the booking-code funnel, not as public form errors.')
    );
  }
  if (visitors < SMALL_SAMPLE_VISITOR_THRESHOLD) {
    addWarning(
      'diagnostic',
      adminCopy(lang, 'Campione dati ancora piccolo.', 'Small sample size.'),
      adminCopy(lang, `${visitors} visitatori nel periodo.`, `${visitors} visitors in this period.`),
      adminCopy(lang, 'Usa questi numeri per diagnosi tecnica e controlli UX, non ancora per decidere quale canale, campagna o esperienza converte meglio.', 'Use these numbers for technical diagnosis and UX checks only. Do not use them yet to decide which channel, campaign, or experience converts best.')
    );
  }
  if (currentRequestsWithoutTrackedFormOpenRows.length) addWarning('critical', adminCopy(lang, 'Alcune richieste sito correnti non hanno una apertura modulo tracciata.', 'Some current website requests have no tracked form open.'), adminCopy(lang, `${currentRequestsWithoutTrackedFormOpenRows.length} richieste correnti interessate.`, `${currentRequestsWithoutTrackedFormOpenRows.length} current requests affected.`), adminCopy(lang, 'Controllare se i CTA interessati chiamano correttamente booking_form_open con esperienza e tipologia richiesta.', 'Check whether the affected CTAs correctly emit booking_form_open with experience and request type.'));
  else if (historicalRequestsWithoutTrackedFormOpenRows.length) addWarning('diagnostic', adminCopy(lang, 'I gap di apertura modulo rilevati sono storici.', 'Detected form-open gaps are historical.'), adminCopy(lang, `${historicalRequestsWithoutTrackedFormOpenRows.length} record storici esclusi dagli alert correnti.`, `${historicalRequestsWithoutTrackedFormOpenRows.length} historical records excluded from current alerts.`), adminCopy(lang, 'Non ricostruire artificialmente eventi precedenti al contratto di tracking corrente.', 'Do not artificially backfill events created before the current tracking contract.'));
  if (currentSubmitErrors) addWarning('critical', adminCopy(lang, 'Gli invii del modulo pubblico stanno fallendo.', 'Public booking submissions are currently failing.'), adminCopy(lang, `${currentSubmitErrors} errori correnti · ${currentSubmitErrorDevices.join(', ') || 'device unknown'}.`, `${currentSubmitErrors} current errors · ${currentSubmitErrorDevices.join(', ') || 'device unknown'}.`), adminCopy(lang, 'Il problema avviene dopo il submit_attempt e prima di booking_request_created. Controllare /api/public/booking-request e create_public_booking_request prima di interpretarlo come drop-off UX.', 'The failure occurs after submit_attempt and before booking_request_created. Check /api/public/booking-request and create_public_booking_request before treating this as UX drop-off.'));
  if (formOpenMissingCtaCount) addWarning('diagnostic', adminCopy(lang, 'Alcune aperture modulo non hanno cta_location.', 'Some form opens have no cta_location.'), '', adminCopy(lang, 'Aggiornare i CTA che non inviano cta_location per rendere leggibili i percorsi.', 'Update CTAs that do not send cta_location so paths are readable.'));
  if (internalEventsExcluded || internalSessionsExcluded) addWarning('diagnostic', adminCopy(lang, 'Traffico interno escluso dalle metriche pubbliche.', 'Internal traffic excluded from public metrics.'), '', adminCopy(lang, 'Admin, API, CMS/editor, finanze e dashboard analytics restano esclusi dai conteggi pubblici.', 'Admin, API, CMS/editor, finance, and analytics dashboard rows remain excluded from public metrics.'));
  if (directTrafficShare > 0.8) {
    addWarning(
      'attribution',
      adminCopy(lang, 'Attribuzione ancora limitata.', 'Attribution is still limited.'),
      adminCopy(lang, 'Gran parte del traffico risulta Direct.', 'Most traffic is still classified as Direct.'),
      adminCopy(lang, 'Gran parte del traffico risulta Direct, quindi la performance dei canali non è ancora affidabile. Usa link UTM in modo coerente per bio Instagram, storie Instagram, condivisioni WhatsApp, partner e Profilo Google Business.', 'Most traffic is still classified as Direct, so source performance is not reliable yet. Use UTM links consistently for Instagram bio, Instagram stories, WhatsApp shares, partner links, and Google Business Profile.')
    );
  }
  if (mobileShare > 0.7) {
    addWarning(
      'ux',
      adminCopy(lang, 'Priorità ai test mobile.', 'Mobile journey needs priority testing.'),
      adminCopy(lang, 'La maggior parte dell’attività arriva da mobile.', 'Most activity is mobile.'),
      adminCopy(lang, 'La maggior parte dell’attività arriva da mobile. Dopo ogni release, testa il percorso completo su iPhone Safari e Android Chrome: apertura escursione, selezione data, avvio modulo, modifica campi, invio richiesta, apertura WhatsApp e ritorno al sito.', 'Most activity is mobile. After each release, test the complete request path on iPhone Safari and Android Chrome: open excursion, select date, start form, edit fields, submit request, open WhatsApp, and return to the site.')
    );
  }


  const conversionMetrics = {
    websiteRequestConversion: percent(websiteRequests, conversionBase),
    trackedSubmissionConversion: percent(submitSuccesses, conversionBase),
    contactIntentConversion: percent(websiteRequests + whatsappClicks + emailClicks, conversionBase),
    confirmedBookingConversion: websiteRequests ? percent(confirmedRequests, websiteRequests) : adminCopy(lang, 'Dati insufficienti', 'Insufficient data'),
    bookingCodeConfirmationRate: bookingCodeRequests ? percent(confirmedBookingCodeRequests, bookingCodeRequests) : adminCopy(lang, 'Dati insufficienti', 'Insufficient data')
  };

  return {
    visitors,
    pageViews,
    experienceViews,
    experienceCardImpressions,
    experienceDetailOpens,
    formOpens,
    fieldStarts,
    formJourneysStarted,
    abandonedForms,
    recoveredByWhatsapp,
    journeySubmitSuccesses,
    abandonmentRate,
    recoveryRate,
    submitAttempts,
    submitSuccesses,
    submitErrors,
    validationErrors,
    bookingCodeRedeemAttempts,
    bookingCodeRedeemSuccesses,
    bookingCodeRedeemErrors,
    bookingRequests: bookingRequestCount,
    websiteRequests,
    bookingCodeRequests,
    adminManualRequests: adminManualRequestRows.length,
    confirmedRequests,
    confirmedBookingCodeRequests,
    whatsappClicks,
    emailClicks,
    phoneClicks,
    mapsClicks,
    bookingConversion: conversionMetrics.websiteRequestConversion,
    conversionMetrics,
    averageEngagement: averageSeconds ? formatDuration(averageSeconds) : '—',
    countryRows,
    cityRows,
    topPageRows,
    experienceRows,
    sourceRows,
    deviceRows,
    browserRows,
    osRows,
    languageRows,
    flowRows,
    funnelRows: flowRows.slice(0, 7),
    funnelDiagnostics,
    formByExperience,
    requestsWithoutTrackedFormOpen,
    contactPaths,
    mobileFunnel,
    sessionPaths: buildSessionPaths(events, lang),
    languageConversion,
    geographyHypotheses,
    trafficAttributionQuality,
    declaredAttributionRows,
    dataQualityRows,
    requestTrackingIntegrity,
    requestTrackingSummary: {
      website_form_requests: websiteRequests,
      booking_code_requests: bookingCodeRequests,
      admin_manual_requests: adminManualRequestRows.length,
      website_form_submit_attempts: submitAttempts,
      website_form_submit_successes: submitSuccesses,
      booking_code_redeem_attempts: bookingCodeRedeemAttempts,
      booking_code_redeem_successes: bookingCodeRedeemSuccesses,
      website_requests_with_tracked_submit: requestsWithTrackedSubmit,
      requests_with_tracked_submit: requestsWithTrackedSubmit,
      requests_matched_by_journey_id: requestsMatchedByJourneyId,
      requests_matched_by_booking_request_id: requestsMatchedByBookingRequestId,
      requests_matched_by_legacy_heuristic: requestsMatchedByLegacyHeuristic,
      requests_created_event_only: requestsCreatedEventOnly,
      website_requests_without_submit_success: requestsWithoutTrackedSubmit,
      current_website_requests_without_submit_success: currentRequestsWithoutTrackedSubmit,
      historical_website_requests_without_submit_success: historicalRequestsWithoutTrackedSubmit,
      current_submit_errors: currentSubmitErrors,
      requests_without_tracked_submit: requestsWithoutTrackedSubmit,
      booking_code_requests_with_redeem_success: bookingCodeRequestsWithRedeemSuccess,
      booking_code_requests_without_redeem_success: bookingCodeRequestsWithoutRedeemSuccess
    },
    warnings,
    lowSampleNote: visitors < SMALL_SAMPLE_VISITOR_THRESHOLD,
    internalEventsExcluded,
    internalSessionsExcluded,
    directTrafficShare: rowPercent(directTrafficCount, sourceTotal),
    mobileShare: rowPercent(mobileCount, pageViewEvents.length || 1)
  };
}

function AnalyticsRowList({ rows, total, empty, helperLabel }) {
  if (!rows.length || rows.every((row) => !row.count)) return <p className="small-note analytics-empty-row">{empty}</p>;
  const max = Math.max(...rows.map((row) => Number(row.count || 0)), 1);
  return (
    <div className="analytics-row-list">
      {rows.map((row) => (
        <div className="analytics-row" key={row.label}>
          <span>{row.label}{row.helper !== undefined && <small>{helperLabel}: {row.helper}</small>}</span>
          <strong>{row.count}</strong>
          <em>{rowPercent(row.count, total)}</em>
          <i><b style={{ width: `${Math.max(3, (Number(row.count || 0) / max) * 100)}%` }} /></i>
        </div>
      ))}
    </div>
  );
}

function AnalyticsWarningList({ warnings = [], lang = 'it', onOpenDetails }) {
  if (!warnings.length) return null;
  const normalized = warnings.map((warning) => (typeof warning === 'string' ? { type: 'diagnostic', message: warning, helper: '', detail: '' } : warning));
  const groups = [
    ['critical', adminCopy(lang, 'Problemi critici di tracciamento', 'Critical tracking issues')],
    ['warning', adminCopy(lang, 'Avvisi da verificare', 'Warnings to review')],
    ['historical', adminCopy(lang, 'Diagnostica storica', 'Historical diagnostics')],
    ['diagnostic', adminCopy(lang, 'Note diagnostiche', 'Diagnostic notes')],
    ['attribution', adminCopy(lang, 'Note attribuzione', 'Attribution notes')],
    ['ux', adminCopy(lang, 'Note test UX', 'UX testing notes')]
  ];
  return (
    <div className="analytics-warning-list grouped" role="status">
      {groups.map(([type, fallbackTitle]) => {
        const items = normalized.filter((warning) => warning.type === type);
        if (!items.length) return null;
        return (
          <section className={`analytics-warning-group ${type}`} key={type}>
            <h3>{fallbackTitle}</h3>
            {items.map((warning, index) => (
              <p key={`${type}-${index}`}>
                <span>{warning.message}</span>
                {warning.helper && <small>{warning.helper}</small>}
              </p>
            ))}
          </section>
        );
      })}
      {onOpenDetails && (
        <div className="analytics-warning-actions">
          <button className="button secondary analytics-details-button" type="button" onClick={onOpenDetails}>
            {adminCopy(lang, 'Dettagli analytics', 'Analytics details')}
          </button>
        </div>
      )}
    </div>
  );
}

function AnalyticsDetailsModal({ lang = 'it', model, onClose }) {
  useBodyScrollLock(true);
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const warnings = Array.isArray(model?.warnings) ? model.warnings : [];
  const utmExamples = [
    '?utm_source=instagram&utm_medium=social&utm_campaign=july_2026',
    '?utm_source=instagram&utm_medium=story&utm_campaign=summer_2026',
    '?utm_source=whatsapp&utm_medium=share&utm_campaign=fixed_excursions',
    '?utm_source=google_business_profile&utm_medium=organic&utm_campaign=profile'
  ];

  return (
    <div className="modal-backdrop analytics-details-backdrop" role="presentation" onClick={onClose}>
      <section className="admin-modal full-screen-admin-modal analytics-details-modal" role="dialog" aria-modal="true" aria-labelledby="analyticsDetailsTitle" onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal-header analytics-details-header">
          <div>
            <span className="kicker">vulcanIQ</span>
            <h2 id="analyticsDetailsTitle">{adminCopy(lang, 'Dettagli analytics', 'Analytics details')}</h2>
            <p>{adminCopy(lang, 'Diagnostica tecnica del funnel, qualità dati, attribuzione e percorso mobile. Usare questi dettagli per correggere il tracciamento, non come prova marketing.', 'Technical diagnostics for funnel integrity, data quality, attribution, and mobile paths. Use these details to fix tracking, not as marketing proof.')}</p>
          </div>
          <button className="modal-close-button" type="button" onClick={onClose}>{adminCopy(lang, 'Chiudi', 'Close')}</button>
        </div>

        <div className="admin-summary-grid analytics-mini-summary-grid analytics-details-summary">
          <SummaryCard label={adminCopy(lang, 'Richieste sito', 'Website requests')} value={model?.websiteRequests ?? 0} helper={adminCopy(lang, 'Tutti i record business storici', 'All historical business records')} />
          <SummaryCard label={adminCopy(lang, 'Submit success tracciati', 'Tracked submit successes')} value={model?.submitSuccesses ?? 0} />
          <SummaryCard label={adminCopy(lang, 'Richieste con codice', 'Booking-code requests')} value={model?.bookingCodeRequests ?? 0} helper={adminCopy(lang, 'Tutti i record business storici', 'All historical business records')} />
          <SummaryCard label={adminCopy(lang, 'Riscatti codice riusciti', 'Booking-code redeem successes')} value={model?.bookingCodeRedeemSuccesses ?? 0} />
        </div>

        {warnings.length > 0 && (
          <AnalyticsSubsection title={adminCopy(lang, 'Spiegazione degli avvisi', 'Warning explanations')}>
            <div className="analytics-detail-warning-grid">
              {warnings.map((warning, index) => (
                <article className={`analytics-detail-warning-card ${warning.type || 'diagnostic'}`} key={`${warning.type || 'warning'}-${index}`}>
                  <h4>{warning.message}</h4>
                  {warning.helper && <p className="small-note">{warning.helper}</p>}
                  {warning.detail && <p>{warning.detail}</p>}
                </article>
              ))}
            </div>
          </AnalyticsSubsection>
        )}

        <AnalyticsSubsection title={adminCopy(lang, 'Esempi UTM da usare', 'UTM examples to use')}>
          <div className="analytics-utm-list">
            {utmExamples.map((example) => <code key={example}>{example}</code>)}
          </div>
        </AnalyticsSubsection>

        <AnalyticsSubsection title={adminCopy(lang, 'Qualità dati', 'Data quality')}>
          <AnalyticsTable
            columns={[
              { key: 'check', label: adminCopy(lang, 'Controllo', 'Check') },
              { key: 'count', label: adminCopy(lang, 'Conteggio', 'Count') },
              { key: 'detail', label: adminCopy(lang, 'Dettaglio', 'Detail') }
            ]}
            rows={model?.dataQualityRows || []}
            empty={adminCopy(lang, 'Nessun dato disponibile.', 'No data available.')}
          />
        </AnalyticsSubsection>

        <AnalyticsSubsection title={adminCopy(lang, 'Diagnostica funnel', 'Funnel diagnostics')}>
          <AnalyticsTable
            columns={[
              { key: 'step', label: adminCopy(lang, 'Step', 'Step') },
              { key: 'count', label: adminCopy(lang, 'Conteggio', 'Count') },
              { key: 'dropoff', label: 'Drop-off' }
            ]}
            rows={model?.funnelDiagnostics || []}
            empty={adminCopy(lang, 'Nessun dato disponibile.', 'No data available.')}
          />
        </AnalyticsSubsection>

        <AnalyticsSubsection title={adminCopy(lang, 'Integrità richieste', 'Request tracking integrity')}>
          <AnalyticsTable
            columns={[
              { key: 'created_at', label: adminCopy(lang, 'Creata il', 'Created at') },
              { key: 'request_type', label: adminCopy(lang, 'Tipo', 'Type') },
              { key: 'experience_id', label: adminCopy(lang, 'Esperienza', 'Experience') },
              { key: 'source', label: adminCopy(lang, 'Sorgente', 'Source') },
              { key: 'matched_submit_success', label: adminCopy(lang, 'Submit success', 'Submit success') },
              { key: 'matched_booking_code_redeem_success', label: adminCopy(lang, 'Riscatto codice', 'Code redeem') },
              { key: 'tracking_integrity_status', label: adminCopy(lang, 'Stato', 'Status') }
            ]}
            rows={(model?.requestTrackingIntegrity || []).slice(0, 50)}
            empty={adminCopy(lang, 'Nessuna richiesta disponibile.', 'No requests available.')}
          />
        </AnalyticsSubsection>

        <AnalyticsSubsection title={adminCopy(lang, 'Funnel mobile · campione diagnostico', 'Mobile funnel · diagnostic sample')}>
          <AnalyticsTable
            columns={[
              { key: 'device_browser', label: adminCopy(lang, 'Dispositivo/browser', 'Device/browser') },
              { key: 'page_views', label: adminCopy(lang, 'Page views', 'Page views') },
              { key: 'form_opens', label: adminCopy(lang, 'Aperture modulo', 'Form opens') },
              { key: 'field_starts', label: adminCopy(lang, 'Avvio campi', 'Field starts') },
              { key: 'submit_attempts', label: adminCopy(lang, 'Tentativi invio', 'Submit attempts') },
              { key: 'submit_successes', label: adminCopy(lang, 'Invii riusciti', 'Submit successes') },
              { key: 'whatsapp_clicks', label: 'WhatsApp' },
              { key: 'phone_clicks', label: adminCopy(lang, 'Telefono', 'Phone') }
            ]}
            rows={model?.mobileFunnel || []}
            empty={adminCopy(lang, 'Nessun dato mobile disponibile.', 'No mobile data available.')}
          />
          <p className="small-note analytics-mobile-checklist">{adminCopy(lang, 'Checklist: apri escursione, seleziona data, avvia modulo, modifica campi, invia richiesta, apri WhatsApp e torna al sito su iPhone Safari e Android Chrome.', 'Checklist: open excursion, select date, start form, edit fields, submit request, open WhatsApp, and return to the site on iPhone Safari and Android Chrome.')}</p>
        </AnalyticsSubsection>

        <AnalyticsSubsection title={adminCopy(lang, 'Qualità attribuzione traffico', 'Traffic attribution quality')}>
          <AnalyticsTable
            columns={[
              { key: 'source', label: adminCopy(lang, 'Sorgente', 'Source') },
              { key: 'count', label: adminCopy(lang, 'Conteggio', 'Count') },
              { key: 'notes', label: adminCopy(lang, 'Note', 'Notes') }
            ]}
            rows={model?.trafficAttributionQuality || []}
            empty={adminCopy(lang, 'Nessun dato attribuzione disponibile.', 'No attribution data available.')}
          />
        </AnalyticsSubsection>
      </section>
    </div>
  );
}

function AnalyticsHelperNote({ children }) {
  if (!children) return null;
  return <p className="small-note analytics-helper-note">{children}</p>;
}

function AnalyticsTable({ columns = [], rows = [], empty }) {
  if (!rows.length) return <p className="small-note analytics-empty-row">{empty}</p>;
  return (
    <div className="analytics-table-scroll" role="region" tabIndex="0">
      <table className="analytics-drilldown-table">
        <thead>
          <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || row.path || row.experience || row.step || `${index}-${columns.map((column) => row[column.key]).join('-')}`}>
              {columns.map((column) => <td key={column.key}>{row[column.key] ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnalyticsPanel({ title, children }) {
  return (
    <details className="admin-panel analytics-panel analytics-collapsible-panel">
      <summary className="analytics-collapsible-summary"><h2>{title}</h2></summary>
      <div className="analytics-collapsible-body">{children}</div>
    </details>
  );
}

function AnalyticsStaticPanel({ title, children }) {
  return (
    <section className="admin-panel analytics-panel analytics-static-panel">
      <header className="analytics-static-header"><h2>{title}</h2></header>
      <div className="analytics-static-body">{children}</div>
    </section>
  );
}

function AnalyticsSubsection({ title, children }) {
  return (
    <section className="analytics-subsection">
      <h3>{title}</h3>
      <div className="analytics-subsection-body">{children}</div>
    </section>
  );
}

function safeBookingRequestRows(requests = [], range, lang) {
  return (requests || [])
    .filter((request) => periodContains(request, range))
    .map((request) => ({
      booking_request_id: request.id || null,
      created_at: request.created_at,
      status: request.status,
      request_type: request.request_type,
      source: request.source,
      created_by_admin: Boolean(request.created_by_admin),
      traffic_source: request.traffic_source,
      source_section: request.source_section,
      source_cta: request.source_cta,
      cta_location: request.cta_location,
      analytics_session_id: request.analytics_session_id || null,
      analytics_visitor_id: request.analytics_visitor_id || null,
      analytics_journey_id: request.analytics_journey_id || null,
      booking_journey_version: request.booking_journey_version || null,
      selected_month: request.selected_month || null,
      device_type: request.device_type || null,
      browser: request.browser || null,
      operating_system: request.operating_system || null,
      experience_id: request.experience_id,
      requested_date_present: Boolean(request.requested_date),
      heard_about_us: normalizeHeardAboutUs(request.heard_about_us, { allowAdmin: true }) || null,
      heard_about_us_label: heardAboutUsLabel(request.heard_about_us, lang, { fallback: '' }) || null,
      has_fixed_excursion: Boolean(request.has_fixed_excursion || request.fixed_excursion_id),
      adults_bucket: request.adults ? (Number(request.adults) > 6 ? '7+' : String(request.adults)) : null,
      children_present: Boolean(request.children)
    }));
}

const ANALYTICS_EXPORT_UNSAFE_METADATA_KEYS = new Set([
  'name', 'customer_name', 'guest_name', 'reviewer_name',
  'email', 'customer_email', 'phone', 'customer_phone',
  'message', 'booking_message', 'customer_note', 'notes',
  'heard_about_us_detail', 'heard_about_us_display',
  'address', 'coordinates', 'lat', 'lng', 'latitude', 'longitude',
  'payment', 'card', 'buyer_name', 'buyer_email', 'buyer_phone',
  'recipient_name', 'partner_bank_details', 'payment_details'
]);

function safeAnalyticsExportMetadata(metadata = {}) {
  const output = {};
  Object.entries(metadata && typeof metadata === 'object' ? metadata : {}).forEach(([key, value]) => {
    const cleanKey = String(key || '').trim().slice(0, 48);
    if (!cleanKey || ANALYTICS_EXPORT_UNSAFE_METADATA_KEYS.has(cleanKey.toLowerCase())) return;
    if (Array.isArray(value) || (value && typeof value === 'object')) return;
    if (typeof value === 'number' || typeof value === 'boolean') {
      output[cleanKey] = value;
      return;
    }
    const cleanValue = String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 220);
    if (cleanValue) output[cleanKey] = cleanValue;
  });
  return output;
}

function safeAnalyticsRows(rows = [], kind = 'event') {
  return rows.map((row) => {
    if (kind === 'session') {
      return {
        started_at: row.started_at,
        last_seen_at: row.last_seen_at,
        duration_seconds: row.duration_seconds,
        pageview_count: row.pageview_count,
        entry_path: row.entry_path,
        exit_path: row.exit_path,
        traffic_source: row.traffic_source,
        referrer_domain: row.referrer_domain,
        country_code: row.country_code,
        country_name: row.country_name,
        city: row.city,
        language: row.language,
        device_type: row.device_type,
        browser: row.browser,
        operating_system: row.operating_system
      };
    }
    return {
      event_name: row.event_name,
      occurred_at: row.occurred_at,
      path: row.path,
      section: row.section,
      language: row.language,
      traffic_source: row.traffic_source,
      referrer_domain: row.referrer_domain,
      country_code: row.country_code,
      country_name: row.country_name,
      city: row.city,
      device_type: row.device_type,
      browser: row.browser,
      operating_system: row.operating_system,
      metadata: safeAnalyticsExportMetadata(row.metadata || {})
    };
  });
}

function downloadAnalyticsExport({ lang, period, range, model, canonicalSummary, events, sessions, bookingRequests, eventTotal = 0, sessionTotal = 0 }) {
  const generatedAt = new Date().toISOString();
  const payload = {
    export_type: 'vulcaniq_analytics_metrics',
    generated_at: generatedAt,
    language: lang,
    period,
    period_label: analyticsPeriodLabel(period, lang),
    range,
    meta: canonicalSummary?.meta || {},
    coverage: {
      data_complete: canonicalSummary?.meta?.data_complete !== false,
      raw_event_sample_limit: 250,
      raw_event_sample_rows: events.length,
      raw_event_sample_is_truncated: Number(eventTotal || 0) > events.length,
      raw_event_total_matching_rows: Number(eventTotal || 0),
      raw_session_sample_limit: 250,
      raw_session_sample_rows: sessions.length,
      raw_session_sample_is_truncated: Number(sessionTotal || 0) > sessions.length,
      raw_session_total_matching_rows: Number(sessionTotal || 0),
      booking_request_sample_limit: 1000,
      booking_request_sample_rows: bookingRequests.length,
      booking_request_sample_may_be_truncated: bookingRequests.length >= 1000
    },
    canonical_funnels: canonicalSummary?.funnels || {},
    canonical_rates: canonicalSummary?.rates || {},
    canonical_integrity: canonicalSummary?.integrity || {},
    chatgpt_prompt: lang === 'it'
      ? 'Analizza queste metriche del sito vulcanIQ. Concentrati su integrità del funnel, comportamento form vs WhatsApp/email, UX mobile, domanda per esperienza, qualità attribuzione sorgenti e se il campione è sufficiente per conclusioni marketing.'
      : 'Analyze these vulcanIQ website metrics. Focus on funnel integrity, form vs WhatsApp/email behavior, mobile UX, experience demand, source attribution quality, and whether the sample size is sufficient for marketing conclusions.',
    summary: {
      visitors: model.visitors,
      page_views: model.pageViews,
      sessions: model.sessions,
      booking_requests: Number(canonicalSummary?.summary?.booking_requests_total || 0),
      website_booking_requests: Number(canonicalSummary?.summary?.website_requests || 0),
      website_form_requests_compatible: Number(canonicalSummary?.summary?.website_requests_compatible || 0),
      booking_code_requests: Number(canonicalSummary?.summary?.booking_code_requests || 0),
      booking_code_requests_compatible: Number(canonicalSummary?.summary?.booking_code_requests_compatible || 0),
      gift_card_requests: Number(canonicalSummary?.summary?.gift_card_requests || 0),
      gift_card_requests_compatible: Number(canonicalSummary?.summary?.gift_card_requests_compatible || 0),
      admin_manual_requests: Number(canonicalSummary?.summary?.admin_manual_requests || 0),
      website_form_submit_attempts: Number(canonicalSummary?.funnels?.website?.submit_attempts || 0),
      website_form_validation_errors: Number(canonicalSummary?.funnels?.website?.validation_errors || 0),
      website_form_submit_successes: Number(canonicalSummary?.funnels?.website?.submit_successes || 0),
      website_form_submit_errors: Number(canonicalSummary?.funnels?.website?.submit_errors || 0),
      booking_code_redeem_attempts: Number(canonicalSummary?.funnels?.booking_code?.redeem_attempts || 0),
      booking_code_redeem_successes: Number(canonicalSummary?.funnels?.booking_code?.redeem_successes || 0),
      contact_intent_visitors: Number(canonicalSummary?.summary?.contact_intent_visitors || 0),
      whatsapp_clicks: Number(canonicalSummary?.summary?.whatsapp_clicks || 0),
      email_clicks: Number(canonicalSummary?.summary?.email_clicks || 0),
      phone_clicks: Number(canonicalSummary?.summary?.phone_clicks || 0),
      maps_clicks: Number(canonicalSummary?.summary?.maps_clicks || 0),
      website_funnel_completion_rate: model.conversionMetrics.websiteFunnelCompletion,
      visitor_to_tracked_request_rate: model.conversionMetrics.websiteRequestConversion,
      contact_intent_visitor_rate: model.conversionMetrics.contactIntentConversion,
      confirmed_website_request_rate: model.conversionMetrics.confirmedBookingConversion,
      booking_code_redeem_rate: model.conversionMetrics.bookingCodeConfirmationRate,
      average_engagement_time: model.averageEngagement,
      submit_incident_state: canonicalSummary?.integrity?.submit_incident_state || 'none'
    },
    tables: {
      countries: model.countryRows,
      cities: model.cityRows,
      top_pages: model.topPageRows,
      experience_detail_opens: model.experienceRows,
      excursion_views: model.experienceRows,
      experience_card_impressions: model.experienceCardImpressions,
      traffic_sources: model.sourceRows,
      devices: model.deviceRows,
      browsers: model.browserRows,
      operating_systems: model.osRows,
      languages: model.languageRows,
      website_flow: model.flowRows,
      booking_funnel: model.funnelRows,
      data_quality: (canonicalSummary?.integrity?.warnings || []).map((warning) => ({ severity: warning.severity, code: warning.code, count: warning.count ?? 0, detail: warning.message || '' }))
    },
    drilldowns: {
      funnel_diagnostics: model.funnelDiagnostics,
      form_by_experience: model.formByExperience,
      contact_paths: model.contactPaths,
      mobile_funnel: model.mobileFunnel,
      session_paths: model.sessionPaths,
      language_conversion: model.languageConversion,
      geography_hypotheses: model.geographyHypotheses,
      traffic_attribution_quality: model.trafficAttributionQuality,
      customer_declared_sources_sample: model.declaredAttributionRows,
      requests_without_tracked_form_open_sample: model.requestsWithoutTrackedFormOpen,
      request_tracking_integrity_sample: model.requestTrackingIntegrity
    },
    anonymized_samples: {
      events: safeAnalyticsRows(events, 'event'),
      sessions: safeAnalyticsRows(sessions, 'session'),
      booking_requests: safeBookingRequestRows(bookingRequests, range, lang)
    },
    privacy_note: 'Names, emails, phone numbers, message text, precise coordinates, payment data, and raw booking-request personal details are intentionally excluded. Analytics session/visitor/journey IDs are pseudonymous, linkable diagnostics; they are not anonymous.'
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const dateStamp = generatedAt.slice(0, 10);
  anchor.href = url;
  anchor.download = `vulcaniq-analytics-${period}-${dateStamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function OwnerOnlyAdminPage({ lang }) {
  return (
    <section className="admin-subpage backup-admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">vulcanIQ</span>
          <h1>{adminCopy(lang, 'Accesso owner richiesto', 'Owner access required')}</h1>
          <p>{adminCopy(lang, 'Questa sezione è disponibile solo agli owner attivi.', 'This section is available only to active owners.')}</p>
        </div>
      </div>
      <div className="admin-alert warning" role="status">
        {adminCopy(lang, 'I manager e gli utenti non autenticati non possono accedere ai controlli di backup.', 'Managers and unauthenticated users cannot access backup controls.')}
      </div>
    </section>
  );
}

const DEFAULT_BACKUP_SCHEDULE = {
  enabled: true,
  frequency: 'daily',
  utc_hour: 2,
  utc_minute: 0,
  weekly_day: 0,
  monthly_day: 1
};

function normalizeBackupSchedule(schedule = {}) {
  const frequency = ['daily', 'weekly', 'monthly'].includes(schedule.frequency) ? schedule.frequency : 'daily';
  return {
    ...DEFAULT_BACKUP_SCHEDULE,
    ...schedule,
    enabled: schedule.enabled !== false,
    frequency,
    utc_hour: clampNumber(schedule.utc_hour, 0, 23, 2),
    utc_minute: clampNumber(schedule.utc_minute, 0, 59, 0),
    weekly_day: schedule.weekly_day === null || schedule.weekly_day === undefined ? 0 : clampNumber(schedule.weekly_day, 0, 6, 0),
    monthly_day: schedule.monthly_day === null || schedule.monthly_day === undefined ? 1 : clampNumber(schedule.monthly_day, 1, 28, 1)
  };
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function twoDigit(value) {
  return String(clampNumber(value, 0, 99, 0)).padStart(2, '0');
}

function backupTimeValue(schedule) {
  return `${twoDigit(schedule.utc_hour)}:${twoDigit(schedule.utc_minute)}`;
}

function parseBackupTime(value, current) {
  const [hour, minute] = String(value || '').split(':');
  return {
    ...current,
    utc_hour: clampNumber(hour, 0, 23, current.utc_hour),
    utc_minute: clampNumber(minute, 0, 59, current.utc_minute)
  };
}

function backupDateFallback(lang) {
  return adminCopy(lang, 'Non disponibile', 'Not available');
}

function formatBackupDate(value, lang) {
  return formatLocalDateTime(value, lang, backupDateFallback(lang));
}

function BackupTimeValue({ value, lang, compact = false }) {
  if (!validDateFromValue(value)) return <span>{backupDateFallback(lang)}</span>;
  return (
    <span className={`backup-time-value ${compact ? 'compact' : ''}`}>
      <span className="backup-time-primary">{formatBackupDate(value, lang)}</span>
    </span>
  );
}

function BackupInlineTime({ label, value, lang }) {
  if (!validDateFromValue(value)) return null;
  return (
    <span className="backup-inline-time">
      <span className="backup-inline-time-label">{label}:</span>{' '}
      <span>{formatBackupDate(value, lang)}</span>
    </span>
  );
}

function BackupSummaryHelper({ latestBackup, lang }) {
  if (!latestBackup) return null;
  const rows = [
    `${adminCopy(lang, 'Dimensione', 'Size')}: ${formatBackupSize(latestBackup.sizeInBytes, lang)}`,
    latestBackup.artifactName || '',
  ].filter(Boolean);
  return (
    <span className="backup-summary-helper">
      {rows.map((row) => <span key={row}>{row}</span>)}
      <BackupInlineTime label={adminCopy(lang, 'Artifact caricato', 'Artifact uploaded')} value={latestBackup.artifactCreatedAt || latestBackup.uploadedAt} lang={lang} />
      <BackupInlineTime label={adminCopy(lang, 'Scadenza artifact', 'Artifact expiry')} value={latestBackup.expiresAt} lang={lang} />
    </span>
  );
}

function formatBackupSize(bytes, lang) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return adminCopy(lang, 'Dimensione non disponibile', 'Size unavailable');
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function envVarName(parts) {
  return Array.isArray(parts) ? parts.join('_') : '';
}

function storageIncludedLabel(storage, lang) {
  const status = storage?.status || (storage?.detailsAvailable === false ? 'none' : 'none');
  if (status === 'complete') return adminCopy(lang, 'Completa', 'Complete');
  if (status === 'partial') return adminCopy(lang, 'Parziale', 'Partial');
  if (status === 'failed') return adminCopy(lang, 'Non riuscita', 'Failed');
  return adminCopy(lang, 'Nessuna esportazione', 'No export');
}

function backupStorageHelper(latestBackup, lang) {
  const storage = latestBackup?.storage;
  if (!storage || storage.detailsAvailable === false) {
    return adminCopy(lang, 'Dettagli Storage non disponibili per questo backup.', 'Storage details are not available for this backup.');
  }
  const fileCount = Number.isFinite(Number(storage.fileCount)) ? Number(storage.fileCount) : null;
  const size = Number.isFinite(Number(storage.sizeInBytes)) ? formatBackupSize(storage.sizeInBytes, lang) : adminCopy(lang, 'Dimensione non disponibile', 'Size unavailable');
  const failureCount = Number.isFinite(Number(storage.failureCount)) ? Number(storage.failureCount) : 0;
  const fileText = fileCount === null ? adminCopy(lang, 'non disponibile', 'unavailable') : String(fileCount);
  const includedText = storage.included ? adminCopy(lang, 'file inclusi', 'files included') : adminCopy(lang, 'nessun file incluso', 'no files included');
  const base = `${adminCopy(lang, 'File Storage', 'Storage files')}: ${fileText} (${includedText}) - ${adminCopy(lang, 'Dimensione Storage', 'Storage size')}: ${size}`;
  if (failureCount > 0) {
    return `${base} - ${adminCopy(lang, 'Errori export', 'Export failures')}: ${failureCount}`;
  }
  return base;
}

function BackupStorageFailures({ storage, lang }) {
  const failures = Array.isArray(storage?.failures) ? storage.failures : [];
  if (!failures.length) return null;
  return (
    <section className="admin-panel backup-panel backup-storage-failures">
      <div className="admin-panel-header"><h2>{adminCopy(lang, 'Dettagli esportazione Storage parziale', 'Partial Storage export details')}</h2><span className="status-pill warning">{failures.length}</span></div>
      <p>{adminCopy(lang, 'Lo ZIP resta utilizzabile per database e file esportati, ma gli oggetti elencati devono essere verificati rispetto allo Storage live prima di un ripristino.', 'The ZIP remains usable for the database and exported files, but the listed objects must be checked against live Storage before restore.')}</p>
      <div className="backup-failure-list">{failures.map((failure,index)=><article key={`${failure.bucket}-${failure.name}-${index}`}><strong>{[failure.bucket,failure.name].filter(Boolean).join('/')||failure.step}</strong><small>{failure.step} · {failure.errorCode}{failure.attempts?` · ${failure.attempts} ${adminCopy(lang,'tentativi','attempts')}`:''} · {failure.referenceChecked?(failure.listedAtExport?adminCopy(lang,'riferimento presente nello Storage live','reference present in live Storage'):adminCopy(lang,'riferimento non trovato nello Storage live','reference not found in live Storage')):adminCopy(lang,'verifica live non disponibile','live check unavailable')}</small></article>)}</div>
    </section>
  );
}

function backupWeekdayOptions(lang) {
  return [
    { value: 0, label: adminCopy(lang, 'Domenica', 'Sunday') },
    { value: 1, label: adminCopy(lang, 'Lunedì', 'Monday') },
    { value: 2, label: adminCopy(lang, 'Martedì', 'Tuesday') },
    { value: 3, label: adminCopy(lang, 'Mercoledì', 'Wednesday') },
    { value: 4, label: adminCopy(lang, 'Giovedì', 'Thursday') },
    { value: 5, label: adminCopy(lang, 'Venerdì', 'Friday') },
    { value: 6, label: adminCopy(lang, 'Sabato', 'Saturday') }
  ];
}

function backupFrequencyLabel(frequency, lang) {
  if (frequency === 'weekly') return adminCopy(lang, 'Settimanale', 'Weekly');
  if (frequency === 'monthly') return adminCopy(lang, 'Mensile', 'Monthly');
  return adminCopy(lang, 'Giornaliero', 'Daily');
}

function backupScheduleSummary(schedule, lang) {
  const normalized = normalizeBackupSchedule(schedule);
  if (!normalized.enabled) return adminCopy(lang, 'Disattivato', 'Disabled');
  const time = backupTimeValue(normalized);
  if (normalized.frequency === 'weekly') {
    const day = backupWeekdayOptions(lang).find((item) => item.value === normalized.weekly_day)?.label || backupWeekdayOptions(lang)[0].label;
    return `${backupFrequencyLabel('weekly', lang)} - ${day} - ${time}`;
  }
  if (normalized.frequency === 'monthly') {
    return `${backupFrequencyLabel('monthly', lang)} - ${adminCopy(lang, 'giorno', 'day')} ${normalized.monthly_day} - ${time}`;
  }
  return `${backupFrequencyLabel('daily', lang)} - ${time}`;
}

function dateIsAfter(value, reference, slackMs = 60000) {
  if (!value || !reference) return false;
  const date = new Date(value).getTime();
  const ref = new Date(reference).getTime();
  if (!Number.isFinite(date) || !Number.isFinite(ref)) return false;
  return date >= (ref - slackMs);
}

function workflowStatusText(run, lang) {
  if (!run) return adminCopy(lang, 'Nessuna esecuzione trovata', 'No workflow run found');
  if (run.status === 'queued') return adminCopy(lang, 'In coda', 'Queued');
  if (run.status === 'in_progress') return adminCopy(lang, 'In esecuzione', 'Running');
  if (run.status === 'completed' && run.conclusion === 'success') return adminCopy(lang, 'Completato', 'Completed');
  if (run.status === 'completed' && run.conclusion) return adminCopy(lang, `Terminato: ${run.conclusion}`, `Finished: ${run.conclusion}`);
  return run.status || adminCopy(lang, 'Non disponibile', 'Not available');
}

function inactiveBackupProgress() {
  return { active: false, value: 0, title: '', detail: '', failed: false, done: false };
}

function clampBackupProgress(value) {
  const parsed = Number(value);
  return Math.max(0, Math.min(100, Number.isFinite(parsed) ? parsed : 0));
}

function isBackupWorkflowActive(run) {
  return Boolean(run && ['queued', 'in_progress', 'running'].includes(run.status));
}

function backupMonitorStorageKey() {
  return 'vulcaniq-backup-monitor-requested-at';
}

function readStoredBackupRequestedAt() {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(backupMonitorStorageKey()) || '';
  } catch {
    return '';
  }
}

function storeBackupRequestedAt(value) {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(backupMonitorStorageKey(), value);
    else window.localStorage.removeItem(backupMonitorStorageKey());
  } catch {}
}

function GlobalBackupProgressBanner({ lang, progress, onOpenBackup }) {
  if (!progress?.active) return null;
  const progressValue = clampBackupProgress(progress.value);
  return (
    <button className={`global-backup-progress-banner ${progress.failed ? 'failed' : ''}`} type="button" onClick={onOpenBackup} aria-label={adminCopy(lang, 'Apri Sistema e backup', 'Open System & backup')}>
      <div className="global-backup-progress-header">
        <strong>{progress.title || adminCopy(lang, 'Backup in esecuzione', 'Backup in progress')}</strong>
        <span>{Math.round(progressValue)}%</span>
      </div>
      <div className="backup-progress-track" role="progressbar" aria-label={adminCopy(lang, 'Avanzamento backup', 'Backup progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressValue}>
        <span className="backup-progress-fill" style={{ width: `${progressValue}%` }} />
      </div>
      <p>{progress.detail || adminCopy(lang, 'GitHub Actions sta creando il dump e preparando lo ZIP.', 'GitHub Actions is creating the dump and preparing the ZIP.')}</p>
    </button>
  );
}

function backupProgressFromStatus(result, requestedAt, lang) {
  const run = result?.workflowRun;
  const latestBackup = result?.latestBackup;
  if (!run || !dateIsAfter(run.createdAt || run.runStartedAt, requestedAt, 90000)) {
    return {
      active: true,
      value: 25,
      title: adminCopy(lang, 'Richiesta inviata', 'Request sent'),
      detail: adminCopy(lang, 'In attesa che GitHub Actions registri la nuova esecuzione.', 'Waiting for GitHub Actions to register the new run.'),
      done: false,
      failed: false
    };
  }

  if (run.status === 'queued') {
    return {
      active: true,
      value: 35,
      title: adminCopy(lang, 'Backup in coda', 'Backup queued'),
      detail: adminCopy(lang, 'La richiesta è stata accettata ed è in attesa di esecuzione.', 'The request was accepted and is waiting to run.'),
      done: false,
      failed: false
    };
  }

  if (run.status === 'in_progress') {
    return {
      active: true,
      value: 70,
      title: adminCopy(lang, 'Backup in esecuzione', 'Backup in progress'),
      detail: adminCopy(lang, 'GitHub Actions sta creando il dump e preparando lo ZIP.', 'GitHub Actions is creating the dump and preparing the ZIP.'),
      done: false,
      failed: false
    };
  }

  if (run.status === 'completed' && run.conclusion === 'success') {
    const artifactReady = latestBackup?.createdAt && dateIsAfter(latestBackup.createdAt, requestedAt, 120000);
    return {
      active: true,
      value: artifactReady ? 100 : 92,
      title: artifactReady ? adminCopy(lang, 'Backup completato', 'Backup completed') : adminCopy(lang, 'Workflow completato', 'Workflow completed'),
      detail: artifactReady
        ? adminCopy(lang, 'Il nuovo backup è pronto e può essere scaricato da questa pagina.', 'The new backup is ready and can be downloaded from this page.')
        : adminCopy(lang, 'Il workflow è terminato. Attendo la pubblicazione dell\'artifact.', 'The workflow finished. Waiting for the artifact to become available.'),
      done: artifactReady,
      failed: false
    };
  }

  if (run.status === 'completed') {
    return {
      active: true,
      value: 100,
      title: adminCopy(lang, 'Backup non completato', 'Backup not completed'),
      detail: adminCopy(lang, 'L\'ultima esecuzione del workflow non è terminata correttamente. Controlla i dettagli mostrati sotto.', 'The latest workflow run did not finish correctly. Check the details shown below.'),
      done: true,
      failed: true
    };
  }

  return {
    active: true,
    value: 50,
    title: workflowStatusText(run, lang),
    detail: adminCopy(lang, 'Stato workflow aggiornato dal server.', 'Workflow status updated by the server.'),
    done: false,
    failed: false
  };
}

function AdminBackupPage({ lang, globalBackupProgress = inactiveBackupProgress(), startGlobalBackupMonitor, stopGlobalBackupMonitor }) {
  const [actionState, setActionState] = useState({ createLoading: false, downloadLoading: false, message: '', error: '' });
  const [statusState, setStatusState] = useState({ loading: true, error: '', latestBackup: null, workflowRun: null, configured: false, message: '' });
  const [scheduleDraft, setScheduleDraft] = useState(DEFAULT_BACKUP_SCHEDULE);
  const [scheduleState, setScheduleState] = useState({ loading: true, saving: false, message: '', error: '' });
  const [showWorkflowDetails, setShowWorkflowDetails] = useState(false);

  async function refreshBackupStatus() {
    setStatusState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await getBackupStatus({ lang });
      setStatusState({
        loading: false,
        error: '',
        latestBackup: result?.latestBackup || null,
        workflowRun: result?.workflowRun || null,
        configured: result?.configured !== false,
        message: result?.message || ''
      });
    } catch (error) {
      setStatusState({
        loading: false,
        error: error?.message || adminCopy(lang, 'Stato backup non disponibile.', 'Backup status is not available.'),
        latestBackup: null,
        workflowRun: null,
        configured: false,
        message: ''
      });
    }
  }

  async function refreshBackupSchedule() {
    setScheduleState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const schedule = await getBackupSchedule({ lang });
      setScheduleDraft(normalizeBackupSchedule(schedule));
      setScheduleState({ loading: false, saving: false, message: '', error: '' });
    } catch (error) {
      setScheduleDraft(DEFAULT_BACKUP_SCHEDULE);
      setScheduleState({
        loading: false,
        saving: false,
        message: '',
        error: error?.message || adminCopy(lang, 'Programmazione backup non disponibile.', 'Backup schedule is not available.')
      });
    }
  }

  useEffect(() => {
    let alive = true;
    async function loadBackupData() {
      const [statusResult, scheduleResult] = await Promise.allSettled([
        getBackupStatus({ lang }),
        getBackupSchedule({ lang })
      ]);
      if (!alive) return;

      if (statusResult.status === 'fulfilled') {
        setStatusState({
          loading: false,
          error: '',
          latestBackup: statusResult.value?.latestBackup || null,
          workflowRun: statusResult.value?.workflowRun || null,
          configured: statusResult.value?.configured !== false,
          message: statusResult.value?.message || ''
        });
      } else {
        setStatusState({
          loading: false,
          error: statusResult.reason?.message || adminCopy(lang, 'Stato backup non disponibile.', 'Backup status is not available.'),
          latestBackup: null,
          workflowRun: null,
          configured: false,
          message: ''
        });
      }

      if (scheduleResult.status === 'fulfilled') {
        setScheduleDraft(normalizeBackupSchedule(scheduleResult.value));
        setScheduleState({ loading: false, saving: false, message: '', error: '' });
      } else {
        setScheduleDraft(DEFAULT_BACKUP_SCHEDULE);
        setScheduleState({
          loading: false,
          saving: false,
          message: '',
          error: scheduleResult.reason?.message || adminCopy(lang, 'Programmazione backup non disponibile.', 'Backup schedule is not available.')
        });
      }
    }
    loadBackupData();
    return () => { alive = false; };
  }, [lang]);

  useEffect(() => {
    function handleGlobalBackupStatusUpdated(event) {
      const result = event.detail || {};
      setStatusState({
        loading: false,
        error: '',
        latestBackup: result?.latestBackup || null,
        workflowRun: result?.workflowRun || null,
        configured: result?.configured !== false,
        message: result?.message || ''
      });
      setActionState({ createLoading: false, downloadLoading: false, message: adminCopy(lang, 'Backup completato. Puoi scaricarlo da questa pagina.', 'Backup completed. You can download it from this page.'), error: '' });
      window.setTimeout(refreshBackupStatus, 2500);
    }
    window.addEventListener('vulcaniq-backup-status-updated', handleGlobalBackupStatusUpdated);
    return () => window.removeEventListener('vulcaniq-backup-status-updated', handleGlobalBackupStatusUpdated);
  }, [lang]);

  async function handleCreateBackup() {
    const requestedAt = new Date().toISOString();
    const initialProgress = {
      active: true,
      value: 10,
      title: adminCopy(lang, 'Backup in esecuzione', 'Backup in progress'),
      detail: adminCopy(lang, 'GitHub Actions sta creando il dump e preparando lo ZIP.', 'GitHub Actions is creating the dump and preparing the ZIP.'),
      failed: false,
      done: false
    };
    startGlobalBackupMonitor?.(requestedAt, initialProgress);
    setActionState({ createLoading: true, downloadLoading: false, message: '', error: '' });
    try {
      const result = await createDatabaseBackup({ lang });
      const serverRequestedAt = result?.requestedAt || requestedAt;
      setActionState({ createLoading: false, downloadLoading: false, message: result?.message || adminCopy(lang, 'Backup avviato', 'Backup started'), error: '' });
      startGlobalBackupMonitor?.(serverRequestedAt, {
        active: true,
        value: 25,
        title: adminCopy(lang, 'Backup in esecuzione', 'Backup in progress'),
        detail: adminCopy(lang, 'GitHub Actions sta creando il dump e preparando lo ZIP.', 'GitHub Actions is creating the dump and preparing the ZIP.'),
        failed: false,
        done: false
      });
    } catch (error) {
      stopGlobalBackupMonitor?.();
      setActionState({ createLoading: false, downloadLoading: false, message: '', error: error?.message || adminCopy(lang, 'Impossibile avviare il backup.', 'Could not start backup.') });
    }
  }

  async function handleDownloadBackup() {
    setActionState({ createLoading: false, downloadLoading: true, message: adminCopy(lang, 'Download del backup in corso...', 'Downloading backup...'), error: '' });
    try {
      await downloadLatestDatabaseBackup({ lang });
      setActionState({ createLoading: false, downloadLoading: false, message: adminCopy(lang, 'Backup scaricato.', 'Backup downloaded.'), error: '' });
      refreshBackupStatus();
    } catch (error) {
      setActionState({ createLoading: false, downloadLoading: false, message: '', error: error?.message || adminCopy(lang, 'Errore durante il download del backup.', 'Backup download failed.') });
    }
  }

  async function handleSaveSchedule() {
    const normalized = normalizeBackupSchedule(scheduleDraft);
    setScheduleState({ loading: false, saving: true, message: '', error: '' });
    try {
      const result = await saveBackupSchedule(normalized, { lang });
      setScheduleDraft(normalizeBackupSchedule(result?.schedule || normalized));
      setScheduleState({ loading: false, saving: false, message: result?.message || adminCopy(lang, 'Programmazione salvata', 'Schedule saved'), error: '' });
    } catch (error) {
      setScheduleState({ loading: false, saving: false, message: '', error: error?.message || adminCopy(lang, 'Programmazione backup non salvata.', 'Backup schedule was not saved.') });
    }
  }

  const latestBackup = statusState.latestBackup;
  const authDataSummary = latestBackup?.auth?.dataIncluded === true
    ? adminCopy(lang, 'La scansione del dump ha rilevato dati Auth. Ripristina le identità con gli UUID originali usando uno schema Supabase Auth compatibile.', 'The dump scan detected Auth data. Restore identities with their original UUIDs using a compatible Supabase Auth schema.')
    : latestBackup?.auth?.dataIncluded === false
      ? adminCopy(lang, 'La scansione del dump non ha rilevato righe Auth. È necessaria una procedura di recupero Auth separata.', 'The dump scan found no Auth rows. A separate Auth recovery procedure is required.')
      : adminCopy(lang, 'La copertura dei dati Auth è sconosciuta: verifica il dump prima di scegliere la procedura di recupero.', 'Auth data coverage is unknown; inspect the dump before choosing a recovery procedure.');
  const authSchemaSummary = latestBackup?.auth?.schemaIncluded === true
    ? adminCopy(lang, 'Sono state rilevate definizioni di tabelle Auth; questo non dimostra un ripristino completo del servizio Auth.', 'Auth table definitions were detected; this does not establish complete managed Auth recovery.')
    : latestBackup?.auth?.schemaIncluded === false
      ? adminCopy(lang, 'Non sono state rilevate definizioni di tabelle Auth.', 'Auth table definitions were not detected.')
      : adminCopy(lang, 'La copertura dello schema Auth è sconosciuta.', 'Auth schema coverage is unknown.');
  const workflowRun = statusState.workflowRun;
  const workflowIsActive = workflowRun && ['queued', 'in_progress'].includes(workflowRun.status);
  const workflowCompleted = workflowRun?.status === 'completed';
  const workflowSucceeded = workflowCompleted && workflowRun?.conclusion === 'success';
  const workflowFailed = workflowCompleted && workflowRun?.conclusion && workflowRun.conclusion !== 'success';
  const hasDownloadableBackup = Boolean(latestBackup?.createdAt && latestBackup?.expired !== true);
  const latestCompletedAt = latestBackup?.createdAt || (workflowSucceeded ? workflowRun?.updatedAt || workflowRun?.createdAt : null);
  const workflowArtifactMissing = workflowSucceeded && !hasDownloadableBackup;

  const latestBackupLabel = statusState.loading
    ? adminCopy(lang, 'Caricamento...', 'Loading...')
    : latestCompletedAt
      ? <BackupTimeValue value={latestCompletedAt} lang={lang} />
      : workflowFailed
        ? adminCopy(lang, 'Backup non riuscito', 'Backup failed')
        : adminCopy(lang, 'Nessun backup completato', 'No completed backup yet');
  const latestBackupHelper = hasDownloadableBackup
    ? <BackupSummaryHelper latestBackup={latestBackup} lang={lang} />
    : workflowArtifactMissing
      ? adminCopy(lang, 'L’ultimo workflow di backup è terminato correttamente, ma non è stato trovato uno ZIP scaricabile. L’artifact potrebbe essere scaduto, non caricato o non risolto dall’endpoint di download diretto.', 'The latest backup workflow completed successfully, but no downloadable ZIP artifact was found. The artifact may have expired, may not have been uploaded, or the direct-download lookup may need checking.')
      : latestBackup?.expired
        ? adminCopy(lang, 'L’ultimo artifact backup è scaduto. Crea un nuovo backup per abilitarne il download diretto.', 'The latest backup artifact has expired. Create a new backup to enable direct download.')
        : (statusState.message || adminCopy(lang, 'Crea un backup per generare il primo ZIP scaricabile.', 'Create a backup to generate the first downloadable ZIP.'));
  const downloadAvailabilityLabel = statusState.loading
    ? adminCopy(lang, 'Caricamento...', 'Loading...')
    : hasDownloadableBackup
      ? adminCopy(lang, 'Disponibile', 'Available')
      : adminCopy(lang, 'Non disponibile', 'Not available');
  const downloadAvailabilityHelper = hasDownloadableBackup
    ? adminCopy(lang, 'Lo ZIP dell’ultimo backup può essere scaricato direttamente da questa pagina.', 'The latest backup ZIP can be downloaded directly from this page.')
    : workflowArtifactMissing
      ? adminCopy(lang, 'Il backup risulta completato, ma lo ZIP non è disponibile per il download diretto.', 'The backup appears completed, but the ZIP is not available for direct download.')
      : adminCopy(lang, 'Nessun artifact scaricabile disponibile.', 'No downloadable artifact available.');
  const lastStatusLabel = statusState.loading
    ? adminCopy(lang, 'Caricamento...', 'Loading...')
    : workflowIsActive
      ? workflowStatusText(workflowRun, lang)
      : workflowSucceeded
        ? adminCopy(lang, 'Completato', 'Completed')
        : workflowFailed
          ? adminCopy(lang, 'Fallito', 'Failed')
          : statusState.configured
            ? adminCopy(lang, 'Pronto', 'Ready')
            : adminCopy(lang, 'Da configurare', 'Needs configuration');
  const workflowHelper = workflowRun
    ? <BackupInlineTime label={workflowStatusText(workflowRun, lang)} value={workflowRun.updatedAt || workflowRun.createdAt} lang={lang} />
    : adminCopy(lang, 'Nessuna esecuzione workflow disponibile.', 'No workflow run available.');
  const backupProgress = globalBackupProgress || inactiveBackupProgress();
  const progressValue = clampBackupProgress(backupProgress.value);

  return (
    <section className="admin-subpage backup-admin-page">
      <div className="admin-page-header backup-page-header">
        <div>
          <h1>{adminCopy(lang, 'Backup del database', 'Database backup')}</h1>
        </div>
        <div className="backup-header-actions">
          <button className="button primary" type="button" disabled={actionState.downloadLoading || actionState.createLoading || statusState.loading || !hasDownloadableBackup} onClick={handleDownloadBackup}>
            {actionState.downloadLoading ? adminCopy(lang, 'Download del backup in corso...', 'Downloading backup...') : adminCopy(lang, 'Scarica ultimo backup', 'Download latest backup')}
          </button>
          <button className="button secondary" type="button" disabled={actionState.createLoading || actionState.downloadLoading || workflowIsActive || backupProgress.active} onClick={handleCreateBackup}>
            {actionState.createLoading ? adminCopy(lang, 'Avvio backup...', 'Starting backup...') : adminCopy(lang, 'Crea nuovo backup', 'Create new backup')}
          </button>
          <button className="button secondary" type="button" onClick={() => { setShowWorkflowDetails((value) => !value); refreshBackupStatus(); }}>{adminCopy(lang, 'Vedi stato workflow', 'View workflow status')}</button>
        </div>
      </div>

      {actionState.message && <div className="admin-alert success" role="status">{actionState.message}{actionState.createLoading || actionState.downloadLoading ? null : <><br />{adminCopy(lang, 'Il backup sarà scaricabile direttamente da questa pagina appena pronto.', 'The backup will be downloadable directly from this page as soon as it is ready.')}</>}</div>}
      {actionState.error && <div className="admin-alert error" role="alert">{actionState.error}</div>}
      {statusState.error && <div className="admin-alert warning" role="status">{statusState.error}</div>}
      <div className="admin-alert warning backup-lifecycle-banner" role="note">{adminCopy(lang, 'Backup riservato: dati applicativi, file Storage esportati e checksum SHA-256 richiedono una gestione riservata.', 'Restricted backup: application data, exported Storage files and SHA-256 checksums require confidential handling.')} {authDataSummary} {authSchemaSummary} {adminCopy(lang, 'La configurazione del servizio Auth, D1 e i segreti richiedono un recupero separato. Questo non è un backup completo del sistema.', 'Managed Auth configuration, D1 and secrets require separate recovery. This is not a complete system backup.')}</div>
      {backupProgress.active && (
        <div className={`backup-progress-panel ${backupProgress.failed ? 'failed' : ''}`} role="status" aria-live="polite">
          <div className="backup-progress-head">
            <strong>{backupProgress.title}</strong>
            <span>{Math.round(progressValue)}%</span>
          </div>
          <div
            className="backup-progress-track"
            role="progressbar"
            aria-label={adminCopy(lang, 'Avanzamento backup', 'Backup progress')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressValue}
          >
            <span className="backup-progress-fill" style={{ width: `${progressValue}%` }} />
          </div>
          {backupProgress.detail && <p>{backupProgress.detail}</p>}
        </div>
      )}

      {workflowIsActive && (
        <section className="admin-panel backup-panel backup-workflow-panel current-backup-panel">
          <div className="admin-panel-header">
            <h2>{adminCopy(lang, 'Backup in esecuzione', 'Backup in progress')}</h2>
            <span className="status-pill pending">{workflowStatusText(workflowRun, lang)}</span>
          </div>
          <dl className="backup-workflow-grid compact-workflow-grid">
            <div><dt>{adminCopy(lang, 'Backup corrente avviato', 'Current backup started')}</dt><dd><BackupTimeValue value={workflowRun.createdAt || workflowRun.runStartedAt} lang={lang} compact /></dd></div>
            <div><dt>{adminCopy(lang, 'Backup corrente aggiornato', 'Current backup updated')}</dt><dd><BackupTimeValue value={workflowRun.updatedAt} lang={lang} compact /></dd></div>
            <div><dt>{adminCopy(lang, 'Ultimo backup completato', 'Last completed backup')}</dt><dd>{latestBackup?.createdAt ? <BackupTimeValue value={latestBackup.createdAt} lang={lang} compact /> : adminCopy(lang, 'Nessun backup completato', 'No completed backup yet')}</dd></div>
          </dl>
        </section>
      )}

      <div className="admin-summary-grid backup-summary-grid">
        <SummaryCard label={adminCopy(lang, 'Ultimo backup completato', 'Last completed backup')} value={latestBackupLabel} helper={latestBackupHelper} />
        <SummaryCard label={adminCopy(lang, 'Download backup', 'Backup download')} value={downloadAvailabilityLabel} helper={downloadAvailabilityHelper} />
        <SummaryCard label={adminCopy(lang, 'Ultimo stato', 'Last status')} value={lastStatusLabel} helper={latestBackup?.artifactName || workflowHelper} />
        <SummaryCard label={adminCopy(lang, 'Programmazione backup', 'Backup schedule')} value={backupFrequencyLabel(scheduleDraft.frequency, lang)} helper={backupScheduleSummary(scheduleDraft, lang)} />
        <SummaryCard label={adminCopy(lang, 'Esportazione Storage', 'Storage export')} value={storageIncludedLabel(latestBackup?.storage, lang)} helper={backupStorageHelper(latestBackup, lang)} />
        <SummaryCard label={adminCopy(lang, 'Integrità artifact', 'Artifact integrity')} value={latestBackup?.integrity?.sha256ManifestIncluded ? 'SHA-256' : adminCopy(lang, 'Non verificata', 'Unverified')} helper={adminCopy(lang, 'Conserva lo ZIP come materiale riservato. Verifica checksums.sha256 prima del ripristino.', 'Treat the ZIP as restricted material. Verify checksums.sha256 before restore.')} />
      </div>

      <BackupStorageFailures storage={latestBackup?.storage} lang={lang} />

      {showWorkflowDetails && (
        <section className="admin-panel backup-panel backup-workflow-panel">
          <div className="admin-panel-header">
            <h2>{adminCopy(lang, 'Stato workflow backup', 'Backup workflow status')}</h2>
            <button className="button secondary small-button" type="button" onClick={refreshBackupStatus}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
          </div>
          <p>{adminCopy(lang, 'Questi dettagli vengono letti server-side da GitHub Actions e mostrati qui: l\'admin non deve avere accesso a GitHub.', 'These details are read server-side from GitHub Actions and shown here: the admin does not need GitHub access.')}</p>
          {workflowRun ? (
            <dl className="backup-workflow-grid">
              <div><dt>{adminCopy(lang, 'Esecuzione', 'Run')}</dt><dd>{workflowRun.runNumber ? `#${workflowRun.runNumber}` : '-'}</dd></div>
              <div><dt>{adminCopy(lang, 'Stato', 'Status')}</dt><dd>{workflowStatusText(workflowRun, lang)}</dd></div>
              <div><dt>{adminCopy(lang, 'Tipo', 'Type')}</dt><dd>{workflowRun.event || '-'}</dd></div>
              <div><dt>{adminCopy(lang, 'Backup corrente avviato', 'Current backup started')}</dt><dd><BackupTimeValue value={workflowRun.createdAt || workflowRun.runStartedAt} lang={lang} compact /></dd></div>
              <div><dt>{adminCopy(lang, 'Backup corrente aggiornato', 'Current backup updated')}</dt><dd><BackupTimeValue value={workflowRun.updatedAt} lang={lang} compact /></dd></div>
              <div><dt>{adminCopy(lang, 'Risultato', 'Conclusion')}</dt><dd>{workflowRun.conclusion || adminCopy(lang, 'In corso', 'In progress')}</dd></div>
            </dl>
          ) : (
            <div className="admin-alert warning">{adminCopy(lang, 'Nessuna esecuzione workflow disponibile.', 'No workflow run available.')}</div>
          )}
        </section>
      )}

      <section className="admin-panel backup-panel">
        <div className="admin-panel-header">
          <h2>{adminCopy(lang, 'Programmazione backup', 'Backup schedule')}</h2>
        </div>
        <p>{adminCopy(lang, 'Backup automatico gestito dal server. Il workflow controlla la programmazione salvata e crea il backup solo quando è dovuto.', 'Automatic backup managed by the server. The workflow checks the saved schedule and creates a backup only when it is due.')}</p>

        <div className="backup-schedule-form">
          <label className="backup-toggle-row">
            <input
              type="checkbox"
              checked={scheduleDraft.enabled}
              onChange={(event) => setScheduleDraft((current) => ({ ...current, enabled: event.target.checked }))}
            />
            <span>{adminCopy(lang, 'Backup automatico', 'Automatic backup')}</span>
          </label>

          <div className="backup-schedule-grid">
            <label>
              <span>{adminCopy(lang, 'Frequenza', 'Frequency')}</span>
              <select value={scheduleDraft.frequency} onChange={(event) => setScheduleDraft((current) => normalizeBackupSchedule({ ...current, frequency: event.target.value }))}>
                <option value="daily">{adminCopy(lang, 'Giornaliero', 'Daily')}</option>
                <option value="weekly">{adminCopy(lang, 'Settimanale', 'Weekly')}</option>
                <option value="monthly">{adminCopy(lang, 'Mensile', 'Monthly')}</option>
              </select>
            </label>
            <label>
              <span>{adminCopy(lang, 'Ora', 'Time')}</span>
              <input type="time" value={backupTimeValue(scheduleDraft)} onChange={(event) => setScheduleDraft((current) => parseBackupTime(event.target.value, current))} />
            </label>
            {scheduleDraft.frequency === 'weekly' && (
              <label>
                <span>{adminCopy(lang, 'Giorno della settimana', 'Day of week')}</span>
                <select value={scheduleDraft.weekly_day} onChange={(event) => setScheduleDraft((current) => ({ ...current, weekly_day: clampNumber(event.target.value, 0, 6, 0) }))}>
                  {backupWeekdayOptions(lang).map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
                </select>
              </label>
            )}
            {scheduleDraft.frequency === 'monthly' && (
              <label>
                <span>{adminCopy(lang, 'Giorno del mese', 'Day of month')}</span>
                <input type="number" min="1" max="28" value={scheduleDraft.monthly_day} onChange={(event) => setScheduleDraft((current) => ({ ...current, monthly_day: clampNumber(event.target.value, 1, 28, 1) }))} />
              </label>
            )}
          </div>

          <div className="backup-schedule-actions">
            <button className="button primary" type="button" disabled={scheduleState.saving || scheduleState.loading} onClick={handleSaveSchedule}>
              {scheduleState.saving ? adminCopy(lang, 'Salvataggio...', 'Saving...') : adminCopy(lang, 'Salva programmazione', 'Save schedule')}
            </button>
            <button className="button secondary" type="button" disabled={scheduleState.saving || scheduleState.loading} onClick={refreshBackupSchedule}>{adminCopy(lang, 'Ricarica', 'Reload')}</button>
          </div>
        </div>
        {scheduleState.message && <div className="admin-alert success" role="status">{scheduleState.message}</div>}
        {scheduleState.error && <div className="admin-alert warning" role="status">{scheduleState.error}</div>}
        <p className="small-note">{adminCopy(lang, 'Il controllo automatico viene eseguito ogni ora e usa questa programmazione salvata per decidere se creare un nuovo backup.', 'The automatic check runs hourly and uses this saved schedule to decide whether to create a new backup.')}</p>
      </section>

      <WeeklyReportsAdminPanel lang={lang} />

      <details className="admin-panel backup-panel backup-restore-details">
        <summary>
          <span>
            <strong>{adminCopy(lang, 'Come ripristinare', 'How to restore')}</strong>
            <small>{adminCopy(lang, 'Verifica il recupero in un ambiente locale isolato; il ripristino live richiede un piano separato.', 'Validate recovery in an isolated local environment; a live restore requires a separate plan.')}</small>
          </span>
        </summary>
        <div className="backup-restore-content">
          <p>{adminCopy(lang, 'I comandi seguenti consentono solo una verifica su una destinazione locale isolata e identificata con certezza. Il backup contiene dati riservati. Un ripristino live o una modifica Cloudflare richiedono autorizzazione e piano separati.', 'The commands below support validation only on a positively identified, isolated local target. The backup contains confidential data. A live restore or Cloudflare change requires separate authorization and planning.')}</p>

          <h3>{adminCopy(lang, '1. Verifica lo ZIP estratto', '1. Verify the extracted ZIP')}</h3>
          <p>{adminCopy(lang, 'Scarica il backup da questa pagina, estrailo in una cartella locale e verifica che i file principali siano al livello superiore dello ZIP.', 'Download the backup from this page, extract it into a local folder, and verify the main files are at the top level of the ZIP.')}</p>
          <ul className="backup-restore-list">
            <li><code>00_project_info.json</code></li>
            <li><code>01_roles.sql</code></li>
            <li><code>02_schema.sql</code></li>
            <li><code>03_data.sql</code></li>
            <li><code>README_RESTORE.md</code></li>
            <li><code>restore-supabase.ps1</code> / <code>restore-supabase.sh</code></li>
            <li><code>restore-storage.js</code></li>
            <li><code>cloudflare-env-template.txt</code></li>
            <li><code>storage-assets/manifest.json</code></li>
            <li><code>checksums.sha256</code> / <code>validate-backup.mjs</code></li>
          </ul>
          <p className="small-note">{adminCopy(lang, 'Esegui node validate-backup.mjs . prima del ripristino. Se mancano file, checksum o metadati, interrompi la procedura e riconcilia la copertura del backup.', 'Run node validate-backup.mjs . before restoring. If files, checksums or metadata are missing, stop and reconcile backup coverage.')}</p>

          <h3>{adminCopy(lang, '2. Prepara la destinazione locale isolata', '2. Prepare the isolated local target')}</h3>
          <ol className="backup-restore-list">
            <li>{adminCopy(lang, 'Identifica una destinazione locale dedicata e sacrificabile, senza collegamenti a Production o ad altri ambienti condivisi.', 'Positively identify a dedicated disposable local target with no connection to Production or other shared environments.')}</li>
            <li>{adminCopy(lang, 'Il validatore accetta solo localhost, 127.0.0.1 o ::1 e un database con prefisso vulcaniq_restore_. Verifica porta, credenziali e nome del database locale.', 'The validator accepts only localhost, 127.0.0.1 or ::1 and a database prefixed vulcaniq_restore_. Verify the local port, credentials and database name.')}</li>
            <li>{adminCopy(lang, 'Prima di importare lo schema applicativo o i dati, prepara uno schema gestito Supabase Auth e Storage compatibile con il dump e verifica estensioni e ruoli richiesti.', 'Before importing application schema or data, prepare managed Supabase Auth and Storage schemas compatible with the dump and verify required extensions and roles.')}</li>
            <li>{adminCopy(lang, 'Il dump non è un sistema Supabase autonomo. Verifica la copertura Auth e conserva gli UUID originali prima di ripristinare le righe collegate.', 'The dump is not a standalone Supabase system. Verify Auth coverage and preserve original UUIDs before restoring linked rows.')}</li>
          </ol>

          <h3>{adminCopy(lang, '3. Ripristina ruoli, schema e dati', '3. Restore roles, schema, and data')}</h3>
          <p>{adminCopy(lang, 'Solo dopo le verifiche precedenti, apri un terminale nella cartella estratta. Servono Node.js e psql; sostituisci i segnaposto esclusivamente con i dati della destinazione locale verificata.', 'After the prerequisites pass, open a terminal in the extracted folder. Node.js and psql are required; replace placeholders only with the verified local target settings.')}</p>
          <div className="backup-code-grid">
            <div>
              <strong>PowerShell</strong>
              <code>{`.\\restore-supabase.ps1 -NewDbUrl "postgresql://postgres:[LOCAL-PASSWORD]@127.0.0.1:54322/vulcaniq_restore_drill"`}</code>
            </div>
            <div>
              <strong>Bash/macOS/Linux</strong>
              <code>{`./restore-supabase.sh 'postgresql://postgres:[LOCAL-PASSWORD]@127.0.0.1:54322/vulcaniq_restore_drill'`}</code>
            </div>
          </div>
          <p>{adminCopy(lang, 'Ordine di ripristino: 01_roles.sql se applicabile, poi 02_schema.sql, poi 03_data.sql. Non invertire schema e dati.', 'Restore order: 01_roles.sql if applicable, then 02_schema.sql, then 03_data.sql. Do not invert schema and data.')}</p>

          <h3>{adminCopy(lang, '4. Verifica Auth, admin e owner', '4. Verify Auth, admins, and owners')}</h3>
          <ol className="backup-restore-list">
            <li>{adminCopy(lang, 'Verifica la copertura Auth del dump e usa una procedura di recupero Supabase Auth compatibile. Conserva gli UUID originali per mantenere i collegamenti ai dati applicativi; non ricreare automaticamente gli utenti con nuovi UUID.', 'Verify the dump’s Auth coverage and use a compatible Supabase Auth recovery procedure. Preserve original UUIDs to retain application data links; do not automatically recreate users with new UUIDs.')}</li>
            <li>{adminCopy(lang, 'Verifica le righe in public.admin_profiles, soprattutto gli owner attivi che possono accedere ai backup.', 'Verify rows in public.admin_profiles, especially active owners who can access backups.')}</li>
            <li>{adminCopy(lang, 'Se manca una tabella attesa, interrompi la verifica e riconcilia schema e migrazioni prima di proseguire.', 'If an expected table is missing, stop validation and reconcile the schema and migrations before proceeding.')}</li>
          </ol>

          <h3>{adminCopy(lang, '5. Verifica e ripristino Supabase Storage', '5. Check and restore Supabase Storage')}</h3>
          <p>{adminCopy(lang, "Il dump del database non include i file binari di Supabase Storage, salvo che questo backup sia stato generato con l'esportazione Storage attiva. Dopo il ripristino, controlla bucket, immagini, PDF, volantini e altri asset caricati, quindi ricarica manualmente eventuali file mancanti.", 'The database dump does not include Supabase Storage binary files unless this backup was generated with Storage export enabled. After restore, check buckets, images, PDFs, leaflets, and other uploaded assets, then re-upload missing files.')}</p>
          <p>{adminCopy(lang, 'Questo backup include i file Supabase Storage nella cartella storage-assets/. Dopo il ripristino, verifica tutti i bucket, le immagini, i PDF, i volantini e gli asset caricati. Se un file manca o il caricamento fallisce, ricaricalo manualmente.', 'This backup includes Supabase Storage files under storage-assets/. After restore, verify all buckets, images, PDFs, leaflets, and uploaded assets. If any file is missing or failed to upload, re-upload it manually.')}</p>
          <div className="backup-code-grid">
            <div>
              <strong>PowerShell</strong>
              <code>{`$env:RESTORE_ISOLATED="true"`}</code>
              <code>{`$env:SUPABASE_URL="http://127.0.0.1:54321"`}</code>
              <code>{`$env:${envVarName(['SUPABASE', 'SECRET', 'KEY'])}="[LOCAL-SECRET]"`}</code>
              <code>{`node restore-storage.js`}</code>
            </div>
            <div>
              <strong>Bash/macOS/Linux</strong>
              <code>{`RESTORE_ISOLATED=true SUPABASE_URL="http://127.0.0.1:54321" ${envVarName(['SUPABASE', 'SECRET', 'KEY'])}="[LOCAL-SECRET]" node restore-storage.js`}</code>
            </div>
          </div>

          <h3>{adminCopy(lang, '6. Aggiorna Cloudflare Pages', '6. Update Cloudflare Pages')}</h3>
          <p>{adminCopy(lang, 'Aggiorna le variabili Cloudflare con i valori del nuovo progetto Supabase e dei segreti GitHub server-side. Non creare variabili VITE per token GitHub o service role.', 'Update Cloudflare variables with the new Supabase project values and server-side GitHub secrets. Do not create VITE variables for GitHub tokens or service-role keys.')}</p>
          <ul className="backup-restore-list">
            <li><code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code></li>
            <li><code>{envVarName(['SUPABASE', 'URL'])}</code> / <code>{envVarName(['SUPABASE', 'SERVICE', 'ROLE', 'KEY'])}</code></li>
            <li><code>GITHUB_OWNER</code>, <code>GITHUB_REPO</code>, <code>{envVarName(['GITHUB', 'BACKUP', 'WORKFLOW', 'ID'])}</code>, <code>{envVarName(['GITHUB', 'BACKUP', 'REF'])}</code>, <code>{envVarName(['GITHUB', 'BACKUP', 'TOKEN'])}</code></li>
          </ul>

          <h3>{adminCopy(lang, '7. Ridistribuisci e verifica', '7. Redeploy and verify')}</h3>
          <ol className="backup-restore-list">
            <li>{adminCopy(lang, 'Ridistribuisci Cloudflare Pages.', 'Redeploy Cloudflare Pages.')}</li>
            <li>{adminCopy(lang, 'Verifica il sito pubblico.', 'Verify the public website.')}</li>
            <li>{adminCopy(lang, 'Accedi a /admin con un owner attivo.', 'Log in to /admin with an active owner.')}</li>
            <li>{adminCopy(lang, 'Verifica pagina backup, calendario, richieste, analytics, recensioni, finanze e CMS.', 'Verify backup page, calendar, requests, analytics, reviews, finance, and CMS.')}</li>
            <li>{adminCopy(lang, 'Verifica immagini, PDF, volantini e asset caricati.', 'Verify images, PDFs, leaflets, and uploaded assets.')}</li>
            <li>{adminCopy(lang, 'Esegui un booking/questionnaire flow di test.', 'Run a test booking/questionnaire flow.')}</li>
            <li>{adminCopy(lang, 'Crea un nuovo backup e scaricalo da questa pagina.', 'Create a new backup and download it from this page.')}</li>
          </ol>
        </div>
      </details>
    </section>
  );
}

function analyticsAdminErrorMessage(lang, error) {
  const raw = `${error?.message || error || ''}`.toLowerCase();
  if (raw.includes('analytics_events') || raw.includes('analytics_sessions') || raw.includes('schema cache') || raw.includes('pgrst')) {
    return adminCopy(lang, 'La tabella degli eventi analytics non è disponibile o non è ancora sincronizzata.', 'The analytics events table is not available or has not synced yet.');
  }
  return adminCopy(lang, 'Analytics non disponibili al momento.', 'Analytics are not available right now.');
}

function analyticsTechnicalError(error) {
  return error?.message || error?.details || error?.hint || error?.code || '';
}

function ShortLinksPanel({ lang }) {
  const links = [
    ['/r/google-profile', '/?utm_source=google_business_profile&utm_medium=organic&utm_campaign=profile', 'Google profile'],
    ['/r/google-booking', '/experiences?utm_source=google_business_profile&utm_medium=booking&utm_campaign=fixed_excursions', 'Google booking'],
    ['/r/ig-bio', '/?utm_source=instagram&utm_medium=social&utm_campaign=bio', 'Instagram bio'],
    ['/r/wa', '/?utm_source=whatsapp&utm_medium=share&utm_campaign=direct', 'WhatsApp'],
    ['/r/partner', '/?utm_source=partner&utm_medium=referral&utm_campaign=partner', 'Partner'],
    ['/r/qr', '/?utm_source=qr&utm_medium=offline&utm_campaign=printed_qr', 'QR'],
    ['/r/card', '/?utm_source=business_card&utm_medium=offline&utm_campaign=card', 'Business card']
  ];
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  async function copyLink(path) {
    const value = `${origin}${path}`;
    try { await navigator.clipboard.writeText(value); } catch {}
    trackEvent('gbp_utm_link_click', { language: lang, short_link: path, action: 'copy' }, { dedupe: false });
  }
  return (
    <AnalyticsPanel title={adminCopy(lang, 'Link UTM rapidi', 'Quick UTM links')}>
      <AnalyticsHelperNote>{adminCopy(lang, 'Usa questo link nella scheda Google per distinguere il traffico Google Business Profile da Instagram, WhatsApp, QR e partner.', 'Use this link in Google Business Profile to separate Google traffic from Instagram, WhatsApp, QR and partner traffic.')}</AnalyticsHelperNote>
      <div className="short-link-panel">
        {links.map(([path, destination, label]) => (
          <div className="short-link-row" key={path}>
            <strong>{label}</strong>
            <code>{origin}{path}</code>
            <button className="button secondary" type="button" onClick={() => copyLink(path)}>{adminCopy(lang, 'Copia', 'Copy')}</button>
            <small>{destination}</small>
          </div>
        ))}
      </div>
    </AnalyticsPanel>
  );
}

function AdminAnalyticsPage({ lang, profile, adminContent = {} }) {
  const [period, setPeriod] = useState('30d');
  const [customRange, setCustomRange] = useState(() => defaultAnalyticsCustomRange());
  const [reloadToken, setReloadToken] = useState(0);
  const [browserExcluded, setBrowserExcluded] = useState(() => isAnalyticsBrowserExcluded());
  const [state, setState] = useState({
    loading: true, error: '', technicalError: '', summary: null,
    events: [], sessions: [], bookingRequests: [], eventTotal: 0, sessionTotal: 0,
    lastRefreshed: null
  });
  const [analyticsDetailsOpen, setAnalyticsDetailsOpen] = useState(false);
  const range = useMemo(() => canonicalAnalyticsDateRange(period, new Date(), customRange), [period, customRange, reloadToken]);

  useEffect(() => {
    let alive = true;
    async function loadAnalytics() {
      if (period === 'custom' && range.valid === false) {
        if (alive) setState((current) => ({ ...current, loading: false, error: adminCopy(lang, 'Seleziona un intervallo personalizzato valido.', 'Select a valid custom date range.'), technicalError: '' }));
        return;
      }
      setState((current) => ({ ...current, loading: true, error: '', technicalError: '' }));
      try {
        const summary = await getAdminAnalyticsSummary({ ...range, useReportingBaseline: range.useReportingBaseline !== false });
        const drilldownRange = {
          from: summary?.meta?.effective_from || '',
          to: summary?.meta?.effective_to || range.to || ''
        };
        const [eventPage, sessionPage, requests] = await Promise.all([
          listAnalyticsEventPage({ ...drilldownRange, page: 0, pageSize: 250 }),
          listAnalyticsSessionPage({ ...drilldownRange, page: 0, pageSize: 250 }),
          listBookingRequests({ limit: 1000 }).catch(() => [])
        ]);
        if (!alive) return;
        setState({
          loading: false, error: '', technicalError: '', summary,
          events: eventPage.rows || [], sessions: sessionPage.rows || [], bookingRequests: requests || [],
          eventTotal: eventPage.total || 0, sessionTotal: sessionPage.total || 0,
          lastRefreshed: new Date().toISOString()
        });
      } catch (error) {
        if (!alive) return;
        setState((current) => ({
          ...current, loading: false,
          error: analyticsAdminErrorMessage(lang, error),
          technicalError: analyticsTechnicalError(error),
          summary: null, events: [], sessions: [], eventTotal: 0, sessionTotal: 0,
          lastRefreshed: new Date().toISOString()
        }));
      }
    }
    loadAnalytics();
    return () => { alive = false; };
  }, [period, lang, reloadToken, range.from, range.to, range.useReportingBaseline, range.valid]);

  const rawModel = useMemo(() => buildAnalyticsModel({ events: state.events, sessions: state.sessions, bookingRequests: state.bookingRequests, range, lang }), [state.events, state.sessions, state.bookingRequests, range, lang]);
  const model = useMemo(() => {
    if (!state.summary) return rawModel;
    const canonical = summaryToAdminModelPatch(state.summary, formatDuration, lang);
    return {
      ...rawModel,
      ...canonical,
      conversionMetrics: { ...rawModel.conversionMetrics, ...canonical.conversionMetrics },
      // Core warnings come from the server contract. Raw-sample warnings remain
      // available in the details modal but cannot override operational truth.
      warnings: canonical.warnings,
      requestTrackingSummary: {
        ...rawModel.requestTrackingSummary,
        website_form_requests: canonical.websiteRequests,
        booking_code_requests: canonical.bookingCodeRequests,
        website_form_submit_attempts: canonical.submitAttempts,
        website_form_submit_successes: canonical.submitSuccesses,
        booking_code_redeem_attempts: canonical.bookingCodeRedeemAttempts,
        booking_code_redeem_successes: canonical.bookingCodeRedeemSuccesses,
        current_submit_errors: canonical.submitIncidentState === 'current_failure' ? canonical.submitErrors : 0
      }
    };
  }, [rawModel, state.summary]);
  const hasData = Boolean(state.summary && (model.pageViews > 0 || model.visitors > 0 || model.websiteRequests > 0 || model.bookingCodeRequests > 0 || model.giftCardRequests > 0));
  const emptyText = adminCopy(lang, 'Nessun dato disponibile per il periodo selezionato.', 'No analytics data available for the selected period.');
  const setupText = adminCopy(lang, 'I dati inizieranno a comparire dopo le prime visite pubbliche al sito.', 'Data will start appearing after the first public visits to the website.');

  async function startNewBaseline() {
    const confirmed = window.confirm(adminCopy(lang, 'Le metriche operative inizieranno da adesso. I dati storici resteranno salvati e saranno ancora visibili in “Tutti i dati storici”. Continuare?', 'Operational metrics will start from now. Historical analytics will remain stored and visible under “All historical data”. Continue?'));
    if (!confirmed) return;
    try {
      await setAnalyticsReportingBaseline(new Date().toISOString());
      setPeriod('baseline');
      setReloadToken((value) => value + 1);
    } catch (error) {
      setState((current) => ({ ...current, error: analyticsAdminErrorMessage(lang, error), technicalError: analyticsTechnicalError(error) }));
    }
  }

  async function clearBaseline() {
    const confirmed = window.confirm(adminCopy(lang, 'Rimuovere la baseline di reporting? Nessun dato verrà eliminato.', 'Clear the reporting baseline? No data will be deleted.'));
    if (!confirmed) return;
    try {
      await clearAnalyticsReportingBaseline();
      setReloadToken((value) => value + 1);
    } catch (error) {
      setState((current) => ({ ...current, error: analyticsAdminErrorMessage(lang, error), technicalError: analyticsTechnicalError(error) }));
    }
  }

  function toggleBrowserExclusion(excluded) {
    setAnalyticsBrowserExcluded(excluded);
    setBrowserExcluded(isAnalyticsBrowserExcluded());
  }

  return (
    <section className="admin-subpage analytics-admin-page">
      <div className="admin-page-header analytics-page-header">
        <div>
          <span className="kicker">vulcanIQ</span>
          <AdminEditableText as="h1" itemKey="admin.analytics.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Dati', 'Analytics')} />
          <AdminEditableText as="p" itemKey="admin.analytics.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Metriche anonime e privacy-first sulle visite pubbliche, le azioni e il percorso verso la prenotazione.', 'Anonymous privacy-first metrics about public visits, actions, and movement toward booking.')} />
        </div>
        <div className="analytics-header-actions">
          <label className="analytics-period-filter">
            <span>{adminCopy(lang, 'Periodo', 'Period')}</span>
            <select value={period} onChange={(event) => setPeriod(event.target.value)}>
              {ANALYTICS_PERIODS.map(([key]) => <option key={key} value={key}>{analyticsPeriodLabel(key, lang)}</option>)}
            </select>
          </label>
          {period === 'custom' && <div className="analytics-custom-range">
            <label><span>{adminCopy(lang, 'Dal', 'From')}</span><input type="date" value={customRange.from} onChange={(event) => setCustomRange((current) => ({ ...current, from: event.target.value }))} /></label>
            <label><span>{adminCopy(lang, 'Al', 'To')}</span><input type="date" value={customRange.to} onChange={(event) => setCustomRange((current) => ({ ...current, to: event.target.value }))} /></label>
          </div>}
          <button className="button secondary analytics-export-button" type="button" disabled={state.loading || (period === 'custom' && range.valid === false)} onClick={() => downloadAnalyticsExport({ lang, period, range, model, canonicalSummary: state.summary, events: state.events, sessions: state.sessions, bookingRequests: state.bookingRequests, eventTotal: state.eventTotal, sessionTotal: state.sessionTotal })}>{adminCopy(lang, 'Esporta metriche', 'Export metrics')}</button>
        </div>
      </div>

      {state.summary && <AnalyticsHealthPanel
        lang={lang}
        meta={state.summary.meta}
        lastRefreshed={state.lastRefreshed}
        busy={state.loading}
        browserExcluded={browserExcluded}
        onRefresh={() => setReloadToken((value) => value + 1)}
        onStartBaseline={startNewBaseline}
        onClearBaseline={clearBaseline}
        canManageBaseline={['owner', 'manager'].includes(profile?.role) && profile?.active !== false}
        onToggleBrowserExclusion={toggleBrowserExclusion}
      />}

      <ShortLinksPanel lang={lang} />

      {state.error && (
        <div className="admin-alert warning" role="status">
          <p>{state.error}</p>
          <p>{setupText}</p>
          {state.technicalError && (
            <details className="admin-technical-details">
              <summary>{adminCopy(lang, 'Dettagli tecnici', 'Technical details')}</summary>
              <code>{state.technicalError}</code>
            </details>
          )}
        </div>
      )}
      {state.loading ? <p>{adminCopy(lang, 'Caricamento dati...', 'Loading analytics...')}</p> : (
        <>
          {!hasData && <div className="admin-alert warning" role="status">{emptyText}<br />{setupText}</div>}
          {(state.eventTotal > state.events.length || state.sessionTotal > state.sessions.length) && <p className="analytics-raw-sample-note">{adminCopy(lang, `Le metriche principali sono aggregate sul server e complete. I dettagli tecnici sotto mostrano solo un campione paginato (${state.events.length}/${state.eventTotal} eventi; ${state.sessions.length}/${state.sessionTotal} sessioni).`, `Primary metrics are complete server-side aggregates. Technical drilldowns below show only a paginated sample (${state.events.length}/${state.eventTotal} events; ${state.sessions.length}/${state.sessionTotal} sessions).`)}</p>}

          <AnalyticsStaticPanel title={<AdminEditableText itemKey="admin.analytics.overview.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Panoramica', 'Overview')} />}>
            <AnalyticsWarningList warnings={model.warnings} lang={lang} onOpenDetails={() => setAnalyticsDetailsOpen(true)} />
            <div className="admin-summary-grid analytics-summary-grid">
              <SummaryCard label={adminCopy(lang, 'Visitatori unici stimati', 'Approx. unique visitors')} value={model.visitors || '—'} helper={adminCopy(lang, 'Profili browser anonimi', 'Anonymous browser profiles')} />
              <SummaryCard label={adminCopy(lang, 'Visualizzazioni pagina', 'Page views')} value={model.pageViews} />
              <SummaryCard label={adminCopy(lang, 'Sessioni', 'Sessions')} value={model.sessions ?? '—'} />
              <SummaryCard label={adminCopy(lang, 'Richieste sito', 'Website requests')} value={model.websiteRequests} helper={adminCopy(lang, 'Tutti i record business storici', 'All historical business records')} />
              <SummaryCard label={adminCopy(lang, 'Completamento funnel sito', 'Website funnel completion')} value={model.conversionMetrics.websiteFunnelCompletion || '—'} />
              <SummaryCard label={adminCopy(lang, 'Visitatori con intento contatto', 'Contact-intent visitors')} value={model.contactIntentVisitors ?? 0} helper={model.conversionMetrics.contactIntentConversion} />
              <SummaryCard label={adminCopy(lang, 'Richieste con codice', 'Booking-code requests')} value={model.bookingCodeRequests} helper={adminCopy(lang, 'Tutti i record business storici', 'All historical business records')} />
              <SummaryCard label="Gift Card" value={model.giftCardRequests ?? 0} helper={adminCopy(lang, 'Tutti i record business storici', 'All historical business records')} />
              <SummaryCard label={adminCopy(lang, 'Tentativi invio sito', 'Website submit attempts')} value={model.submitAttempts} />
              <SummaryCard label={adminCopy(lang, 'Invii riusciti sito', 'Website submit successes')} value={model.submitSuccesses} />
              <SummaryCard label={adminCopy(lang, 'Errori invio sito', 'Website submit errors')} value={model.submitErrors} />
              <SummaryCard label={adminCopy(lang, 'Tempo medio di coinvolgimento', 'Average engagement time')} value={model.averageEngagement} />
            </div>
          </AnalyticsStaticPanel>

          {state.summary && <AnalyticsCanonicalFunnels lang={lang} payload={state.summary} />}

          {state.summary && <AnalyticsStaticPanel title={adminCopy(lang, 'Domanda per esperienza · canonica', 'Experience demand · canonical')}>
            <AnalyticsHelperNote>{adminCopy(lang, 'Questi valori arrivano dalla stessa aggregazione server-side usata dai KPI e dal report settimanale. Le richieste database includono solo il periodo compatibile con il contratto di tracking.', 'These values come from the same server-side aggregate used by the KPI cards and weekly report. Database requests include only the period compatible with the tracking contract.')}</AnalyticsHelperNote>
            <AnalyticsTable
              columns={[
                { key: 'experience', label: adminCopy(lang, 'Esperienza', 'Experience') },
                { key: 'card_impressions', label: adminCopy(lang, 'Impression card', 'Card impressions') },
                { key: 'detail_opens', label: adminCopy(lang, 'Dettagli aperti', 'Detail opens') },
                { key: 'unique_detail_visitors', label: adminCopy(lang, 'Visitatori dettaglio', 'Detail visitors') },
                { key: 'form_opens', label: adminCopy(lang, 'Aperture modulo', 'Form opens') },
                { key: 'tracked_successes', label: adminCopy(lang, 'Invii tracciati', 'Tracked successes') },
                { key: 'database_requests', label: adminCopy(lang, 'Richieste DB compatibili', 'Compatible DB requests') },
                { key: 'confirmed_database_requests', label: adminCopy(lang, 'Confermate', 'Confirmed') },
                { key: 'contact_actions', label: adminCopy(lang, 'Azioni contatto', 'Contact actions') },
                { key: 'tracked_conversion', label: adminCopy(lang, 'Dettaglio → invio', 'Detail → submit') }
              ]}
              rows={model.canonicalExperienceRows || []}
              empty={emptyText}
            />
          </AnalyticsStaticPanel>}

          <AnalyticsPanel title={adminCopy(lang, 'Qualità dati', 'Data quality')}>
            <AnalyticsHelperNote>{adminCopy(lang, 'Avvisi diagnostici per capire quando il funnel non è internamente coerente. Le metriche pubbliche escludono traffico admin/API.', 'Diagnostic warnings for identifying when the funnel is not internally coherent. Public metrics exclude admin/API traffic.')}</AnalyticsHelperNote>
            <AnalyticsTable
              columns={[
                { key: 'check', label: adminCopy(lang, 'Controllo', 'Check') },
                { key: 'count', label: adminCopy(lang, 'Conteggio', 'Count') },
                { key: 'detail', label: adminCopy(lang, 'Dettaglio', 'Detail') }
              ]}
              rows={state.summary ? (state.summary.integrity?.warnings || []).map((warning) => ({ check: warning.code || warning.severity || 'diagnostic', count: warning.count ?? 0, detail: warning.message || '—' })) : model.dataQualityRows}
              empty={emptyText}
            />
          </AnalyticsPanel>

          <AnalyticsPanel title={<AdminEditableText itemKey="admin.analytics.bookingFunnel.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Diagnostica dettagliata (campione)', 'Detailed diagnostics (sample)')} />}>
            <AnalyticsHelperNote>{adminCopy(lang, 'Questa sezione usa solo il campione tecnico paginato per ispezionare singoli percorsi. Non è la fonte dei KPI o dei funnel canonici sopra.', 'This section uses only the paginated technical sample to inspect individual journeys. It is not the source of the KPI cards or canonical funnels above.')}</AnalyticsHelperNote>
            {model.lowSampleNote && <AnalyticsHelperNote>{adminCopy(lang, 'Campione dati ridotto: usa questi numeri per diagnosticare tracciamento e UX, non per conclusioni marketing definitive.', 'Small data sample: use these numbers to diagnose tracking and UX, not for definitive marketing conclusions.')}</AnalyticsHelperNote>}
            <AnalyticsSubsection title={adminCopy(lang, 'Diagnostica funnel', 'Funnel diagnostics')}>
              <AnalyticsTable
                columns={[
                  { key: 'step', label: adminCopy(lang, 'Step', 'Step') },
                  { key: 'count', label: adminCopy(lang, 'Conteggio', 'Count') },
                  { key: 'dropoff', label: 'Drop-off' }
                ]}
                rows={model.funnelDiagnostics}
                empty={emptyText}
              />
            </AnalyticsSubsection>
            <AnalyticsSubsection title={adminCopy(lang, 'Integrità richieste', 'Request tracking integrity')}>
              <AnalyticsTable
                columns={[
                  { key: 'created_at', label: adminCopy(lang, 'Creata il', 'Created at') },
                  { key: 'request_type', label: adminCopy(lang, 'Tipo', 'Type') },
                  { key: 'experience_id', label: adminCopy(lang, 'Esperienza', 'Experience') },
                  { key: 'matched_submit_attempt', label: adminCopy(lang, 'Tentativo', 'Attempt') },
                  { key: 'matched_submit_success', label: adminCopy(lang, 'Invio riuscito', 'Submit success') },
                  { key: 'matched_booking_code_redeem_success', label: adminCopy(lang, 'Riscatto codice', 'Code redeem') },
                  { key: 'matched_booking_request_created_event', label: adminCopy(lang, 'Evento richiesta', 'Request event') },
                  { key: 'tracking_match_method', label: adminCopy(lang, 'Match', 'Match') },
                  { key: 'tracking_integrity_status', label: adminCopy(lang, 'Stato', 'Status') },
                  { key: 'heard_about_us_display', label: adminCopy(lang, 'Fonte dichiarata', 'Declared source') }
                ]}
                rows={model.requestTrackingIntegrity.slice(0, 25)}
                empty={emptyText}
              />
            </AnalyticsSubsection>
            <div className="analytics-two-column-grid">
              <AnalyticsSubsection title={adminCopy(lang, 'Modulo per esperienza', 'Booking form by experience')}>
                <AnalyticsTable
                  columns={[
                    { key: 'experience', label: adminCopy(lang, 'Esperienza/tipologia', 'Experience/type') },
                    { key: 'experience_views', label: adminCopy(lang, 'Viste esperienza', 'Experience views') },
                    { key: 'detail_opens', label: adminCopy(lang, 'Dettagli aperti', 'Detail opens') },
                    { key: 'form_opens', label: adminCopy(lang, 'Aperture modulo', 'Form opens') },
                    { key: 'submit_attempts', label: adminCopy(lang, 'Tentativi invio', 'Submit attempts') },
                    { key: 'submit_successes', label: adminCopy(lang, 'Invii riusciti', 'Submit successes') },
                    { key: 'booking_requests', label: adminCopy(lang, 'Richieste create', 'Created requests') },
                    { key: 'confirmed_bookings', label: adminCopy(lang, 'Confermate', 'Confirmed') },
                    { key: 'whatsapp_clicks', label: 'WhatsApp' },
                    { key: 'email_clicks', label: 'Email' },
                    { key: 'phone_clicks', label: adminCopy(lang, 'Telefono', 'Phone') },
                    { key: 'view_to_request', label: adminCopy(lang, 'Vista → richiesta', 'View → request') },
                    { key: 'form_to_request', label: adminCopy(lang, 'Modulo → richiesta', 'Form → request') }
                  ]}
                  rows={model.formByExperience}
                  empty={adminCopy(lang, 'Nessuna esperienza specificata nei dati del periodo.', 'No experience specified in this period’s data.')}
                />
              </AnalyticsSubsection>
              <AnalyticsSubsection title={adminCopy(lang, 'Conversioni principali', 'Core conversions')}>
                <div className="admin-summary-grid analytics-mini-summary-grid">
                  <SummaryCard label={adminCopy(lang, 'Tentativi invio modulo', 'Form submit attempts')} value={model.submitAttempts} />
                  <SummaryCard label={adminCopy(lang, 'Invii riusciti tracciati', 'Tracked successful submissions')} value={model.submitSuccesses} />
                  <SummaryCard label={adminCopy(lang, 'Errori invio', 'Submit errors')} value={model.submitErrors} />
                  <SummaryCard label={adminCopy(lang, 'Tentativi codice', 'Code attempts')} value={model.bookingCodeRedeemAttempts} />
                  <SummaryCard label={adminCopy(lang, 'Riscatti codice riusciti', 'Code successes')} value={model.bookingCodeRedeemSuccesses} />
                  <SummaryCard label={adminCopy(lang, 'Conversione invii', 'Tracked conversion')} value={model.conversionMetrics.trackedSubmissionConversion} />
                </div>
              </AnalyticsSubsection>
            </div>
          </AnalyticsPanel>

          <AnalyticsPanel title={<AdminEditableText itemKey="admin.analytics.contactIntent.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Intento di contatto', 'Contact intent')} />}>
            <AnalyticsHelperNote>{adminCopy(lang, 'I totali e i visitatori con intento contatto arrivano dall’aggregazione canonica server-side. La tabella dei percorsi sotto è un campione diagnostico paginato.', 'Contact totals and contact-intent visitors come from the canonical server-side aggregate. The path table below is a paginated diagnostic sample.')}</AnalyticsHelperNote>
            <div className="admin-summary-grid analytics-mini-summary-grid">
              <SummaryCard label={adminCopy(lang, 'Click WhatsApp', 'WhatsApp clicks')} value={model.whatsappClicks} />
              <SummaryCard label={adminCopy(lang, 'Click email', 'Email clicks')} value={model.emailClicks} />
              <SummaryCard label={adminCopy(lang, 'Click telefono', 'Phone clicks')} value={model.phoneClicks} />
              <SummaryCard label={adminCopy(lang, 'Click Google Maps', 'Google Maps clicks')} value={model.mapsClicks} />
            </div>
            <AnalyticsSubsection title={adminCopy(lang, 'Percorsi di contatto · campione diagnostico', 'Contact paths · diagnostic sample')}>
              <AnalyticsTable
                columns={[
                  { key: 'cta_location', label: adminCopy(lang, 'Posizione CTA', 'CTA location') },
                  { key: 'action_type', label: adminCopy(lang, 'Azione', 'Action type') },
                  { key: 'count', label: adminCopy(lang, 'Conteggio', 'Count') },
                  { key: 'device', label: adminCopy(lang, 'Dispositivo', 'Device') },
                  { key: 'language', label: adminCopy(lang, 'Lingua', 'Language') },
                  { key: 'top_previous_section', label: adminCopy(lang, 'Sezione precedente', 'Top previous section') }
                ]}
                rows={model.contactPaths}
                empty={emptyText}
              />
            </AnalyticsSubsection>
          </AnalyticsPanel>

          <AnalyticsPanel title={<AdminEditableText itemKey="admin.analytics.sources.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Fonti traffico', 'Traffic sources')} />}>
            {model.directTrafficShare !== '0%' && <AnalyticsHelperNote>{adminCopy(lang, 'Molto traffico risulta Diretto. Usa link UTM per Instagram, WhatsApp, QR code, biglietti da visita e partner per capire da dove arrivano gli utenti.', 'Most traffic appears as Direct. Use UTM links for Instagram, WhatsApp, QR codes, business cards, and partners to understand where users come from.')}</AnalyticsHelperNote>}
            <div className="analytics-two-column-grid">
              <AnalyticsSubsection title={adminCopy(lang, 'Qualità attribuzione', 'Attribution quality')}>
                <AnalyticsTable
                  columns={[
                    { key: 'source', label: adminCopy(lang, 'Sorgente', 'Source') },
                    { key: 'count', label: adminCopy(lang, 'Conteggio', 'Count') },
                    { key: 'notes', label: adminCopy(lang, 'Note', 'Notes') }
                  ]}
                  rows={model.trafficAttributionQuality}
                  empty={emptyText}
                />
              </AnalyticsSubsection>
              <AnalyticsSubsection title={adminCopy(lang, 'Sorgenti principali · page views', 'Top sources · page views')}>
                <AnalyticsRowList rows={model.sourceRows} total={Math.max(1, model.sourceRows.reduce((sum, row) => sum + row.count, 0))} empty={emptyText} />
              </AnalyticsSubsection>
            </div>
            <AnalyticsSubsection title={adminCopy(lang, 'Dove ci hanno scoperto · campione richieste', 'Where customers found us · request sample')}>
              <AnalyticsHelperNote>{adminCopy(lang, 'Dato dichiarato dal cliente. Non sostituisce traffic_source, che resta attribuzione tecnica da referrer/UTM/sessione.', 'Customer-declared source. This does not replace traffic_source, which remains technical attribution from referrer/UTM/session data.')}</AnalyticsHelperNote>
              <AnalyticsTable
                columns={[
                  { key: 'source', label: adminCopy(lang, 'Fonte conoscenza', 'Discovery source') },
                  { key: 'details', label: adminCopy(lang, 'Dettagli Altro', 'Other details') },
                  { key: 'booking_requests', label: adminCopy(lang, 'Richieste', 'Requests') },
                  { key: 'confirmed_bookings', label: adminCopy(lang, 'Confermate', 'Confirmed') },
                  { key: 'contact_events', label: adminCopy(lang, 'Contatti diretti', 'Direct contacts') },
                  { key: 'form_events', label: adminCopy(lang, 'Eventi modulo', 'Form events') }
                ]}
                rows={model.declaredAttributionRows}
                empty={emptyText}
              />
            </AnalyticsSubsection>
          </AnalyticsPanel>

          <AnalyticsPanel title={<AdminEditableText itemKey="admin.analytics.audienceUx.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Pubblico e UX', 'Audience and UX')} />}>
            <AnalyticsHelperNote>{adminCopy(lang, 'Dispositivi, browser, sistemi operativi, lingua, pagine e geografia sono aggregati dal server sulle page view complete. I funnel mobile, le ipotesi geografiche e i percorsi sessione sono invece campioni diagnostici paginati.', 'Devices, browsers, operating systems, language, pages, and geography are complete server-side page-view aggregates. Mobile funnels, geography hypotheses, and session paths are paginated diagnostic samples.')}</AnalyticsHelperNote>
            <div className="analytics-two-column-grid">
              <AnalyticsSubsection title={adminCopy(lang, 'Funnel mobile', 'Mobile funnel')}>
                <AnalyticsTable
                  columns={[
                    { key: 'device_browser', label: adminCopy(lang, 'Dispositivo/browser', 'Device/browser') },
                    { key: 'page_views', label: adminCopy(lang, 'Page views', 'Page views') },
                    { key: 'experience_views', label: adminCopy(lang, 'Viste esperienza', 'Experience views') },
                    { key: 'detail_opens', label: adminCopy(lang, 'Dettagli', 'Details') },
                    { key: 'calendar_date_selections', label: adminCopy(lang, 'Date calendario', 'Calendar dates') },
                    { key: 'form_opens', label: adminCopy(lang, 'Aperture modulo', 'Form opens') },
                    { key: 'field_starts', label: adminCopy(lang, 'Avvii compilazione', 'Field starts') },
                    { key: 'submit_attempts', label: adminCopy(lang, 'Tentativi invio', 'Submit attempts') },
                    { key: 'validation_errors', label: adminCopy(lang, 'Errori validazione', 'Validation errors') },
                    { key: 'submit_successes', label: adminCopy(lang, 'Invii riusciti', 'Submit successes') },
                    { key: 'submit_errors', label: adminCopy(lang, 'Errori invio', 'Submit errors') },
                    { key: 'booking_requests', label: adminCopy(lang, 'Richieste', 'Requests') },
                    { key: 'whatsapp_clicks', label: 'WhatsApp' },
                    { key: 'email_clicks', label: 'Email' },
                    { key: 'phone_clicks', label: adminCopy(lang, 'Telefono', 'Phone') }
                  ]}
                  rows={model.mobileFunnel}
                  empty={emptyText}
                />
              </AnalyticsSubsection>
              <AnalyticsSubsection title={adminCopy(lang, 'Dispositivi', 'Devices')}>
                <h4>{adminCopy(lang, 'Page views per dispositivo', 'Page views by device')}</h4>
                <AnalyticsRowList rows={model.deviceRows} total={model.pageViews || 1} empty={emptyText} />
                <h4>{adminCopy(lang, 'Page views per browser', 'Page views by browser')}</h4>
                <AnalyticsRowList rows={model.browserRows} total={model.pageViews || 1} empty={emptyText} />
                <h4>{adminCopy(lang, 'Page views per sistema operativo', 'Page views by operating system')}</h4>
                <AnalyticsRowList rows={model.osRows} total={model.pageViews || 1} empty={emptyText} />
              </AnalyticsSubsection>
            </div>
            <div className="analytics-two-column-grid">
              <AnalyticsSubsection title={adminCopy(lang, 'Lingua e conversione · campione diagnostico', 'Language and conversion · diagnostic sample')}>
                <AnalyticsTable
                  columns={[
                    { key: 'language', label: adminCopy(lang, 'Lingua', 'Language') },
                    { key: 'actions', label: adminCopy(lang, 'Azioni', 'Actions') },
                    { key: 'page_views', label: adminCopy(lang, 'Page views', 'Page views') },
                    { key: 'form_opens', label: adminCopy(lang, 'Aperture modulo', 'Form opens') },
                    { key: 'submit_attempts', label: adminCopy(lang, 'Tentativi invio', 'Submit attempts') },
                    { key: 'submit_successes', label: adminCopy(lang, 'Invii riusciti', 'Submit successes') },
                    { key: 'whatsapp_clicks', label: 'WhatsApp' },
                    { key: 'email_clicks', label: 'Email' },
                    { key: 'language_switches', label: adminCopy(lang, 'Cambi lingua', 'Language switches') }
                  ]}
                  rows={model.languageConversion}
                  empty={emptyText}
                />
              </AnalyticsSubsection>
              <AnalyticsSubsection title={adminCopy(lang, 'Lingua', 'Language')}>
                <AnalyticsRowList rows={model.languageRows} total={model.pageViews || 1} empty={emptyText} helperLabel={adminCopy(lang, 'page views', 'page views')} />
              </AnalyticsSubsection>
            </div>
            <div className="analytics-two-column-grid">
              <AnalyticsSubsection title={adminCopy(lang, 'Geografia: ipotesi · campione diagnostico', 'Geography: hypotheses · diagnostic sample')}>
                <AnalyticsTable
                  columns={[
                    { key: 'country_city', label: adminCopy(lang, 'Paese/città', 'Country/city') },
                    { key: 'actions', label: adminCopy(lang, 'Azioni', 'Actions') },
                    { key: 'language', label: adminCopy(lang, 'Lingua', 'Language') },
                    { key: 'form_opens', label: adminCopy(lang, 'Aperture modulo', 'Form opens') },
                    { key: 'contact_clicks', label: adminCopy(lang, 'Click contatto', 'Contact clicks') },
                    { key: 'device', label: adminCopy(lang, 'Dispositivo', 'Device') }
                  ]}
                  rows={model.geographyHypotheses}
                  empty={emptyText}
                />
              </AnalyticsSubsection>
              <AnalyticsSubsection title={adminCopy(lang, 'Geografia', 'Geography')}>
                <h4>{adminCopy(lang, 'Paesi principali', 'Top countries')}</h4>
                <AnalyticsRowList rows={model.countryRows} total={model.pageViews || 1} empty={emptyText} />
                <h4>{adminCopy(lang, 'Città principali', 'Top cities')}</h4>
                <AnalyticsRowList rows={model.cityRows} total={model.pageViews || 1} empty={adminCopy(lang, 'Città non disponibile se Cloudflare non la fornisce.', 'City is unavailable if Cloudflare does not provide it.')} />
              </AnalyticsSubsection>
            </div>
            <div className="analytics-two-column-grid">
              <AnalyticsSubsection title={adminCopy(lang, 'Percorsi sessione · campione diagnostico', 'Session paths · diagnostic sample')}>
                <AnalyticsTable
                  columns={[
                    { key: 'path', label: adminCopy(lang, 'Percorso', 'Path') },
                    { key: 'sessions', label: adminCopy(lang, 'Sessioni', 'Sessions') },
                    { key: 'contact_actions', label: adminCopy(lang, 'Azioni contatto', 'Contact actions') },
                    { key: 'booking_form_opens', label: adminCopy(lang, 'Aperture modulo', 'Booking form opens') }
                  ]}
                  rows={model.sessionPaths}
                  empty={adminCopy(lang, 'Servono più eventi ordinati per mostrare i percorsi sessione.', 'More ordered events are needed to show session paths.')}
                />
              </AnalyticsSubsection>
              <AnalyticsSubsection title={adminCopy(lang, 'Flusso sito', 'Website flow')}>
                <h4>{adminCopy(lang, 'Azioni principali', 'Key actions')}</h4>
                <AnalyticsRowList rows={model.flowRows} total={Math.max(1, model.flowRows.reduce((sum, row) => sum + row.count, 0))} empty={emptyText} />
                <h4>{adminCopy(lang, 'Pagine principali', 'Top pages')}</h4>
                <AnalyticsRowList rows={model.topPageRows} total={model.pageViews || 1} empty={emptyText} />
                <h4>{adminCopy(lang, 'Visualizzazioni esperienze', 'Excursion detail views')}</h4>
                <AnalyticsRowList rows={model.experienceRows} total={model.experienceViews || 1} empty={emptyText} />
              </AnalyticsSubsection>
            </div>
          </AnalyticsPanel>
        </>
      )}
      {analyticsDetailsOpen && <AnalyticsDetailsModal lang={lang} model={model} onClose={() => setAnalyticsDetailsOpen(false)} />}
    </section>
  );
}

function AdminAnalyticsPreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-subpage analytics-admin-page admin-preview-page">
      <div className="admin-page-header analytics-page-header">
        <div>
          <span className="kicker">vulcanIQ</span>
          <AdminEditableText as="h1" itemKey="admin.analytics.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Dati', 'Analytics')} />
          <AdminEditableText as="p" itemKey="admin.analytics.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Metriche anonime e privacy-first sulle visite pubbliche, le azioni e il percorso verso la prenotazione.', 'Anonymous privacy-first metrics about public visits, actions, and movement toward booking.')} />
        </div>
      </div>
      <AnalyticsStaticPanel title={<AdminEditableText itemKey="admin.analytics.overview.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Panoramica', 'Overview')} />}>
        <div className="admin-summary-grid analytics-summary-grid">
          <SummaryCard label={adminCopy(lang, 'Visitatori', 'Visitors')} value="128" />
          <SummaryCard label={adminCopy(lang, 'Visualizzazioni pagina', 'Page views')} value="412" />
          <SummaryCard label={adminCopy(lang, 'Richieste prenotazione', 'Booking requests')} value="18" />
          <SummaryCard label={adminCopy(lang, 'Tasso conversione prenotazione', 'Booking conversion rate')} value="14%" />
        </div>
      </AnalyticsStaticPanel>
    </section>
  );
}

function FinancialAuditPanel({ lang }) {
  const [range, setRange] = useState({ from: '', to: '' });
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  async function download(format) {
    setBusy(format); setError(''); setMessage('');
    try { const result = await downloadFinancialAudit({ ...range, locale: lang, format }); setMessage(adminCopy(lang, `Audit generato: ${result.filename}`, `Audit generated: ${result.filename}`)); }
    catch (err) { setError(err.message || adminCopy(lang, 'Audit non generato.', 'Audit was not generated.')); }
    finally { setBusy(''); }
  }
  return <details className="admin-panel finance-collapsible-panel finance-audit-panel">
    <summary className="finance-collapsible-summary"><strong>{adminCopy(lang, 'Financial Audit & Compliance', 'Financial Audit & Compliance')}</strong></summary>
    <div className="finance-collapsible-body"><p className="small-note">{adminCopy(lang, 'Il PDF è un riepilogo; il CSV contiene le righe di evidenza dettagliate e il manifest JSON contiene i metadati di integrità. Il checksum dell’evidenza riguarda i dati canonici, non i byte dei file. Non è una certificazione legale o fiscale.', 'The PDF is a summary; the CSV contains detailed evidence rows and the JSON manifest contains integrity metadata. The evidence checksum covers canonical data, not file bytes. This is not a legal or tax certification.')}</p>
      <div className="admin-filter-bar finance-audit-filter"><label><span>{adminCopy(lang, 'Da', 'From')}</span><input type="date" value={range.from} onChange={(event) => setRange((value) => ({ ...value, from: event.target.value }))}/></label><label><span>{adminCopy(lang, 'A', 'To')}</span><input type="date" value={range.to} onChange={(event) => setRange((value) => ({ ...value, to: event.target.value }))}/></label></div>
      {error && <div className="admin-alert error" role="alert">{error}</div>}{message && <div className="admin-alert success" role="status">{message}</div>}
      <div className="modal-actions"><button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => download('pdf')}>{busy === 'pdf' ? adminCopy(lang, 'Generazione…', 'Generating…') : adminCopy(lang, 'PDF riepilogo', 'Summary PDF')}</button><button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => download('csv')}>{adminCopy(lang, 'CSV evidenze dettagliate', 'Detailed evidence CSV')}</button><button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => download('manifest')}>{adminCopy(lang, 'Manifest integrità JSON', 'JSON integrity manifest')}</button></div>
    </div>
  </details>;
}

function FinanceAdminPage({ lang, session, profile, adminContent = {} }) {
const [entries, setEntries] = useState([]);
const [serverTotals, setServerTotals] = useState(null);
const [requests, setRequests] = useState([]);
const [fixedExcursions, setFixedExcursions] = useState([]);
const [leaflets, setLeaflets] = useState([]);
const [partnerCommissions, setPartnerCommissions] = useState([]);
const [reconciliationEntries, setReconciliationEntries] = useState([]);
const [reconciliationCodes, setReconciliationCodes] = useState([]);
const [reconciliationGiftCards, setReconciliationGiftCards] = useState([]);
const [partnerCommissionSummary, setPartnerCommissionSummary] = useState({
  commissions: [],
  pendingAmount: 0,
  approvedUnpaidAmount: 0,
  paidAmount: 0,
  cancelledAmount: 0,
  unpaidLiability: 0,
  pendingCount: 0,
  approvedCount: 0,
  paidCount: 0,
  cancelledCount: 0,
  byPartner: [],
  byCurrency: []
});
const [filters, setFilters] = useState({
    type: 'all',
    dateMode: 'all',
    specificDate: todayIso(),
    specificMonth: monthValueFromDate(),
    fromDate: '',
    toDate: '',
    category: 'all',
    linked: 'all',
    includeArchived: false
  });
  const [form, setForm] = useState({ entry_date: todayIso(), type: 'income', amount: '', currency: 'EUR', title: '', description: '', category: 'booking_payment', payment_method: '', booking_request_id: '', fixed_excursion_id: '', leaflet_id: '' });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [activeFinanceDetail, setActiveFinanceDetail] = useState(null);
  const [refundTarget, setRefundTarget] = useState(null);
  const financeIntentRef = useRef(null);
  const financeInFlightRef = useRef(false);
  const [financeSaving, setFinanceSaving] = useState(false);
  const financeLoadRef = useRef(0);

  const resolvedDateRange = useMemo(() => resolveFinanceDateRange(filters, lang), [filters, lang]);

  async function refresh() {
    const loadId = ++financeLoadRef.current;
    setLoading(true);
    setError('');
    const dateRange = resolveFinanceDateRange(filters, lang);
    try {
      const [entryData, requestData, fixedData, leafletData, commissionSummaryData, allFinanceData, codeData, giftCardData, totalsData] = await Promise.all([
        listFinanceEntries({ ...filters, fromDate: dateRange.startDate, toDate: dateRange.endDate }),
        listBookingRequests({}),
        listFixedExcursions({ activeOnly: false }),
        listMonthlyLeaflets({ activeOnly: false }),
        listPartnerCommissionSummary({}),
        listFinanceEntries({ includeArchived: true }),
        listBookingCodes({}),
        listGiftCardRequests({}),
        getFinanceTotals({ ...filters, fromDate: dateRange.startDate, toDate: dateRange.endDate })
      ]);
      if (loadId !== financeLoadRef.current) return;
      setEntries(entryData);
      setRequests(requestData);
      setFixedExcursions(fixedData);
      setLeaflets(leafletData);
      setPartnerCommissions(commissionSummaryData.commissions || []);
      setPartnerCommissionSummary(commissionSummaryData);
      setReconciliationEntries(allFinanceData);
      setReconciliationCodes(codeData);
      setReconciliationGiftCards(giftCardData);
      setServerTotals(totalsData);
    } catch (err) {
      if (loadId === financeLoadRef.current) setError(adminCopy(lang, 'Dati finanziari non aggiornati. Riprova prima di usare i totali.', 'Finance data is not current. Retry before using these totals.'));
    } finally {
      if (loadId === financeLoadRef.current) setLoading(false);
    }
  }

  useEffect(() => { refresh(); return () => { financeLoadRef.current += 1; }; }, [filters.type, filters.dateMode, filters.specificDate, filters.specificMonth, filters.fromDate, filters.toDate, filters.category, filters.linked, filters.includeArchived]);

  function update(field, value) {
    // Canonical booking linkage is set by trusted booking commands, never this manual editor.
    if (field === 'booking_request_id') return;
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'type' ? { category: value === 'income' ? 'booking_payment' : 'fuel' } : {})
    }));
  }

  function updateFilter(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
      ...(field === 'type' ? { category: 'all' } : {})
    }));
  }

  function startEdit(entry) {
    const current = entries.find(item => item.id === entry.id);
    if (!current || !financeEntryActions(current).edit) {
      setError(adminCopy(lang, 'Questa voce non è più modificabile. Rivedi il dettaglio e il percorso di correzione autorizzato.', 'This entry is no longer editable. Review its details and the authorized correction path.'));
      return;
    }
    setEditing(entry);
    setForm({
      entry_date: entry.entry_date || todayIso(),
      type: entry.type || 'income',
      amount: String(entry.amount || ''),
      currency: entry.currency || 'EUR',
      title: entry.title || '',
      description: entry.description || '',
      category: entry.category || (entry.type === 'expense' ? 'fuel' : 'booking_payment'),
      payment_method: entry.payment_method || '',
      booking_request_id: entry.booking_request_id || '',
      fixed_excursion_id: entry.fixed_excursion_id || '',
      leaflet_id: entry.leaflet_id || ''
    });
  }

  function resetForm() {
    financeIntentRef.current = null;
    setEditing(null);
    setForm({ entry_date: todayIso(), type: 'income', amount: '', currency: 'EUR', title: '', description: '', category: 'booking_payment', payment_method: '', booking_request_id: '', fixed_excursion_id: '', leaflet_id: '' });
  }

  useEffect(() => {
    if (!editing) return;
    const current = entries.find(item => item.id === editing.id);
    if (current && financeEntryActions(current).edit) return;
    resetForm();
    setError(adminCopy(lang, 'Questa voce non è più modificabile. Rivedi il dettaglio e il percorso di correzione autorizzato.', 'This entry is no longer editable. Review its details and the authorized correction path.'));
  }, [entries, editing]);

  async function submit(event) {
    event.preventDefault();
    if (financeInFlightRef.current) return;
    setError('');
    setFeedback('');
    if (editing && (!financeEntryActions(editing).edit || !financeEntryActions(entries.find(item => item.id === editing.id)).edit)) {
      resetForm();
      setError(adminCopy(lang, 'Questa voce non è più modificabile. Rivedi il dettaglio e il percorso di correzione autorizzato.', 'This entry is no longer editable. Review its details and the authorized correction path.'));
      return;
    }
    if (!form.entry_date || !form.title.trim() || parseMoneyAmount(form.amount) <= 0) {
      setError(adminCopy(lang, 'Data, titolo e importo positivo sono obbligatori.', 'Date, title, and a positive amount are required.'));
      return;
    }
    financeInFlightRef.current = true;
    setFinanceSaving(true);
    try {
      if (!financeIntentRef.current) financeIntentRef.current = crypto.randomUUID();
      const normalizedForm = { ...form, booking_request_id: editing?.booking_request_id || '', amount: parseMoneyAmount(form.amount), currency: normalizeCurrency(form.currency), idempotency_key: financeIntentRef.current };
      if (editing) await updateFinanceEntry(editing.id, { ...normalizedForm, expected_updated_at: editing.updated_at }, session.user.id);
      else await createFinanceEntry(normalizedForm, session.user.id);
      setFeedback(editing ? adminCopy(lang, 'Voce aggiornata.', 'Entry updated.') : adminCopy(lang, 'Voce aggiunta.', 'Entry added.'));
      resetForm();
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Voce non salvata.', 'Entry not saved.'));
    } finally {
      financeInFlightRef.current = false;
      setFinanceSaving(false);
    }
  }

  async function archive(entry) {
    setError('');
    const current = entries.find(item => item.id === entry.id);
    if (!current || !financeEntryActions(current).archive) {
      setError(adminCopy(lang, 'Questa voce non può essere archiviata. I movimenti riconosciuti restano nello storico.', 'This entry cannot be archived. Recognized transactions remain in the ledger.'));
      return;
    }
    try {
      await archiveFinanceEntry(entry.id, session.user.id, 'archived from admin');
      setFeedback(adminCopy(lang, 'Voce archiviata.', 'Entry archived.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Archivio non riuscito.', 'Archive failed.'));
    }
  }

  const requestById = useMemo(() => new Map(requests.map((request) => [request.id, request])), [requests]);
  const fixedById = useMemo(() => new Map(fixedExcursions.map((item) => [item.id, item])), [fixedExcursions]);
  const leafletById = useMemo(() => new Map(leaflets.map((item) => [item.id, item])), [leaflets]);
  const financeById = useMemo(() => new Map(reconciliationEntries.map((entry) => [entry.id, entry])), [reconciliationEntries]);
  const enrichedEntries = useMemo(() => entries.map((entry) => enrichFinanceEntry(entry, { requestById, fixedById, leafletById })), [entries, requestById, fixedById, leafletById]);
  const reportEntries = filters.includeArchived ? enrichedEntries : enrichedEntries.filter((entry) => entry.active !== false);
  const detailSummary = calculateFinanceSummary(reportEntries);
  const summaryCurrencies = (serverTotals?.byCurrency || []).map(row => ({ currency: row.currency, income: Number(row.income), expenses: Number(row.expense), expectedIncome: Number(row.expected), net: Number(row.income) - Number(row.expense) }));
  const singleCurrency = summaryCurrencies.length === 1 ? summaryCurrencies[0] : { income: 0, expenses: 0, expectedIncome: 0, net: 0 };
  const financeSummary = { ...detailSummary, ...singleCurrency, byCurrency: summaryCurrencies };
  const reconciliation = useMemo(() => buildFinancialReconciliation({ bookings: requests, bookingCodes: reconciliationCodes, giftCards: reconciliationGiftCards, partnerCommissions, financeEntries: reconciliationEntries }), [requests, reconciliationCodes, reconciliationGiftCards, partnerCommissions, reconciliationEntries]);
  const aggregateCurrency = financeSummary.byCurrency?.length === 1 ? financeSummary.byCurrency[0].currency : null;
  const aggregateMoney = (key) => !serverTotals ? '—' : aggregateCurrency ? formatMoney(financeSummary[key] || 0, aggregateCurrency, lang) : financeSummary.byCurrency?.length > 1 ? adminCopy(lang, 'Più valute', 'Multiple currencies') : formatMoney(0, 'EUR', lang);
  const linkedEntries = reportEntries.filter(financeEntryIsLinked);
  const unlinkedExpenseEntries = financeSummary.expenseEntries.filter((entry) => !financeEntryIsLinked(entry));
  const categories = filters.type === 'expense' ? FINANCE_CATEGORIES.expense : filters.type === 'income' ? FINANCE_CATEGORIES.income : [...FINANCE_CATEGORIES.income, ...FINANCE_CATEGORIES.expense];

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          <AdminEditableText as="h1" itemKey="admin.finance.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Finanze', 'Finance')} />
        </div>
        <button className="button secondary" type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
      </div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      <div className="admin-summary-grid finance-summary-grid">
        <SummaryCard label={adminCopy(lang, 'Incassato', 'Recorded payments')} value={aggregateMoney('income')} onClick={() => setActiveFinanceDetail({ key: 'income', title: adminCopy(lang, 'Entrate', 'Income'), entries: financeSummary.incomeEntries, total: financeSummary.income })} helper={adminCopy(lang, 'Apri dettaglio', 'Open details')} />
        <SummaryCard label={adminCopy(lang, 'Entrate attese', 'Expected revenue')} value={aggregateMoney('expectedIncome')} onClick={() => setActiveFinanceDetail({ key: 'expected-income', title: adminCopy(lang, 'Entrate attese', 'Expected income'), entries: financeSummary.expectedEntries, total: financeSummary.expectedIncome })} helper={adminCopy(lang, 'Non confermate', 'Not confirmed')} />
        <SummaryCard label={adminCopy(lang, 'Uscite', 'Expenses')} value={aggregateMoney('expenses')} onClick={() => setActiveFinanceDetail({ key: 'expenses', title: adminCopy(lang, 'Uscite', 'Expenses'), entries: financeSummary.expenseEntries, total: financeSummary.expenses })} helper={adminCopy(lang, 'Apri dettaglio', 'Open details')} />
        <SummaryCard label={adminCopy(lang, 'Risultato netto', 'Net result')} value={aggregateMoney('net')} onClick={() => setActiveFinanceDetail({ key: 'net', title: adminCopy(lang, 'Utile netto', 'Net profit'), entries: reportEntries, total: financeSummary.net })} helper={adminCopy(lang, 'Entrate meno uscite', 'Income minus expenses')} />
        <SummaryCard label={adminCopy(lang, 'Prenotazioni collegate', 'Linked bookings')} value={linkedEntries.length} onClick={() => setActiveFinanceDetail({ key: 'linked', title: adminCopy(lang, 'Prenotazioni collegate', 'Linked bookings'), entries: linkedEntries, total: linkedEntries.length })} helper={adminCopy(lang, 'Vedi movimenti', 'View entries')} />
        <SummaryCard label={adminCopy(lang, 'Spese non collegate', 'Unlinked expenses')} value={unlinkedExpenseEntries.length} onClick={() => setActiveFinanceDetail({ key: 'unlinked-expenses', title: adminCopy(lang, 'Spese non collegate', 'Unlinked expenses'), entries: unlinkedExpenseEntries, total: unlinkedExpenseEntries.length })} helper={adminCopy(lang, 'Vedi spese', 'View expenses')} />
        {Number(partnerCommissionSummary?.unpaidLiability || 0) > 0 && <SummaryCard label={adminCopy(lang, 'Liabilità commissioni partner', 'Partner commission liabilities')} value={formatCurrencyMetricRows(partnerCommissionSummary.byCurrency || [], 'unpaidLiability', lang)} helper={adminCopy(lang, 'In attesa + approvate non pagate', 'Pending + approved unpaid')} />}
        <SummaryCard label={adminCopy(lang, 'Commissioni pagate', 'Paid commissions')} value={formatCurrencyMetricRows(partnerCommissionSummary?.byCurrency || [], 'paidAmount', lang)} helper={`${partnerCommissionSummary?.paidCount || 0} ${adminCopy(lang, 'record', 'records')}`} />
      </div>
      <div className="admin-filter-bar finance-filter-bar">
        <select value={filters.dateMode} onChange={(event) => updateFilter('dateMode', event.target.value)} aria-label={adminCopy(lang, 'Filtro date', 'Date filter')}>
          {FINANCE_DATE_FILTERS.map(([key]) => <option key={key} value={key}>{financeDateFilterLabel(key, lang)}</option>)}
        </select>
        {filters.dateMode === 'specific-date' && <input type="date" value={filters.specificDate} onChange={(event) => updateFilter('specificDate', event.target.value)} aria-label={adminCopy(lang, 'Data specifica', 'Specific date')} />}
        {filters.dateMode === 'specific-month' && <input type="month" value={filters.specificMonth} onChange={(event) => updateFilter('specificMonth', event.target.value)} aria-label={adminCopy(lang, 'Mese specifico', 'Specific month')} />}
        {filters.dateMode === 'custom' && <input type="date" value={filters.fromDate} onChange={(event) => updateFilter('fromDate', event.target.value)} aria-label={adminCopy(lang, 'Da data', 'From date')} />}
        {filters.dateMode === 'custom' && <input type="date" value={filters.toDate} onChange={(event) => updateFilter('toDate', event.target.value)} aria-label={adminCopy(lang, 'A data', 'To date')} />}
        <select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}><option value="all">{adminCopy(lang, 'Tutti i tipi', 'All types')}</option><option value="income">{adminCopy(lang, 'Entrate', 'Income')}</option><option value="expense">{adminCopy(lang, 'Uscite', 'Expenses')}</option></select>
        <select value={filters.category} onChange={(event) => updateFilter('category', event.target.value)}><option value="all">{adminCopy(lang, 'Tutte le categorie', 'All categories')}</option>{categories.map(([key]) => <option key={key} value={key}>{financeCategoryLabel(key, lang)}</option>)}</select>
        <select value={filters.linked} onChange={(event) => updateFilter('linked', event.target.value)}><option value="all">{adminCopy(lang, 'Collegate e libere', 'Linked and unlinked')}</option><option value="linked">{adminCopy(lang, 'Solo collegate', 'Linked only')}</option><option value="unlinked">{adminCopy(lang, 'Solo non collegate', 'Unlinked only')}</option></select>
        <label className="finance-archive-filter"><input type="checkbox" checked={filters.includeArchived} onChange={(event) => updateFilter('includeArchived', event.target.checked)} /><span>{adminCopy(lang, 'Includi archivio', 'Include archive')}</span></label>
        <p className="small-note finance-filter-range-note">{adminCopy(lang, 'Periodo', 'Period')}: {resolvedDateRange.label}</p>
      </div>
      <FinanceReconciliationPanel lang={lang} reconciliation={reconciliation} requestById={requestById} financeById={financeById} session={session} onChanged={refresh} onOpenEntry={(entry) => setActiveFinanceDetail({ key: 'movement', title: adminCopy(lang, 'Dettaglio movimento', 'Movement detail'), entries: [entry], total: Number(entry.amount || 0), selectedEntry: entry })} onRefundEntry={(entry) => setRefundTarget(entry)} />
      {['owner', 'finance'].includes(profile?.role) && <FinancialAuditPanel lang={lang} />}
      <FinanceOverview lang={lang} summary={financeSummary} rangeLabel={resolvedDateRange.label} onOpen={setActiveFinanceDetail} />
      <FinanceProfitLoss lang={lang} summary={financeSummary} adminContent={adminContent} />
      <PartnerCommissionsFinancePanel lang={lang} session={session} commissions={partnerCommissions} summary={partnerCommissionSummary} onChanged={async (message) => { setFeedback(message); await refresh(); }} />
      <div className="admin-two-column finance-layout">
        <details className="admin-panel finance-collapsible-panel finance-form-panel" open={Boolean(editing)}>
          <summary className="finance-collapsible-summary">
            <strong>{editing ? contentText(adminContent, 'admin.finance.editEntry.title', lang, adminCopy(lang, 'Modifica voce', 'Edit entry')) : contentText(adminContent, 'admin.finance.addEntry.title', lang, adminCopy(lang, 'Aggiungi voce', 'Add entry'))}</strong>
          </summary>
          <div className="finance-collapsible-body">
          <p className="small-note">{adminCopy(lang, 'Per le prenotazioni usa normalmente Prenotazione → Registra pagamento. Questa voce manuale resta per carburante, attrezzatura, pubblicità, assicurazione, parcheggi, costi guida e movimenti reali fuori sistema.', 'For bookings, normally use Booking → Record payment. Manual Finance remains for fuel, equipment, advertising, insurance, parking, guide costs, and genuine off-system transactions.')}</p>
          <form className="admin-form-grid" onSubmit={submit}>
            <AdminSelect label={adminCopy(lang, 'Tipo', 'Type')} value={form.type} onChange={(value) => update('type', value)} options={['income', 'expense']} formatter={(value) => value === 'income' ? adminCopy(lang, 'Entrata', 'Income') : adminCopy(lang, 'Uscita', 'Expense')} />
            <AdminInput label={adminCopy(lang, 'Data', 'Date')} type="date" value={form.entry_date} onChange={(value) => update('entry_date', value)} />
            <AdminInput label={adminCopy(lang, 'Importo', 'Amount')} type="text" value={form.amount} onChange={(value) => update('amount', value)} />
            <AdminInput label={adminCopy(lang, 'Valuta', 'Currency')} value={form.currency} onChange={(value) => update('currency', normalizeCurrency(value))} />
            <AdminInput label={adminCopy(lang, 'Titolo', 'Title')} value={form.title} onChange={(value) => update('title', value)} />
            <AdminSelect label={adminCopy(lang, 'Categoria', 'Category')} value={form.category} onChange={(value) => update('category', value)} options={(form.type === 'income' ? FINANCE_CATEGORIES.income : FINANCE_CATEGORIES.expense).map(([key]) => key)} formatter={(value) => financeCategoryLabel(value, lang)} />
            <AdminInput label={adminCopy(lang, 'Metodo pagamento', 'Payment method')} value={form.payment_method} onChange={(value) => update('payment_method', value)} />
            <AdminSelect label={adminCopy(lang, 'Prenotazione collegata', 'Linked booking')} value={form.booking_request_id} disabled options={['', ...(form.booking_request_id ? [form.booking_request_id] : [])]} formatter={(value) => value ? (requestById.has(value) ? requestFinanceLabel(requestById.get(value), lang) : value) : adminCopy(lang, 'Nessuna', 'None')} />
            <p className="small-note full">{adminCopy(lang, 'Il collegamento alla prenotazione è di sola lettura. Per un nuovo pagamento collegato usa Prenotazione → Registra pagamento.', 'Booking linkage is read-only. For a new linked payment, use Booking → Record payment.')}</p>
            <AdminSelect label={adminCopy(lang, 'Escursione fissa collegata', 'Linked fixed excursion')} value={form.fixed_excursion_id} onChange={(value) => update('fixed_excursion_id', value)} options={['', ...fixedExcursions.map((item) => item.id)]} formatter={(value) => value ? fixedExcursionLabel(fixedExcursions.find((item) => item.id === value), lang) : adminCopy(lang, 'Nessuna', 'None')} />
            <AdminSelect label={adminCopy(lang, 'Calendario mensile collegato', 'Linked monthly leaflet')} value={form.leaflet_id} onChange={(value) => update('leaflet_id', value)} options={['', ...leaflets.map((item) => item.id)]} formatter={(value) => value ? leafletLabel(leaflets.find((item) => item.id === value), lang) : adminCopy(lang, 'Nessuno', 'None')} />
            <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione / note', 'Description / notes')}</span><textarea rows={4} value={form.description} onChange={(event) => update('description', event.target.value)} /></label>
            <div className="modal-actions full"><button className="button primary" type="submit" disabled={financeSaving} aria-busy={financeSaving}>{financeSaving ? adminCopy(lang, 'Salvataggio…', 'Saving…') : editing ? adminCopy(lang, 'Salva modifiche', 'Save changes') : adminCopy(lang, 'Aggiungi voce', 'Add entry')}</button>{editing && <button className="button secondary" type="button" disabled={financeSaving} onClick={resetForm}>{adminCopy(lang, 'Annulla modifica', 'Cancel edit')}</button>}</div>
          </form>
          </div>
        </details>
        <details className="admin-panel finance-collapsible-panel finance-entries-panel">
          <summary className="finance-collapsible-summary">
            <AdminEditableText as="strong" itemKey="admin.finance.entries.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Voci finanziarie', 'Financial entries')} />
            <em>{entries.length}</em>
          </summary>
          <div className="finance-collapsible-body">
          {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : enrichedEntries.length === 0 ? <p>{adminCopy(lang, 'Nessuna voce trovata.', 'No entries found.')}</p> : (
            <div className="finance-entry-list">
              {enrichedEntries.map((entry) => <FinanceEntryCard key={entry.id} entry={entry} lang={lang} onOpen={() => setActiveFinanceDetail({ key: 'movement', title: adminCopy(lang, 'Dettaglio movimento', 'Movement detail'), entries: [entry], total: Number(entry.amount || 0), selectedEntry: entry })} onEdit={() => startEdit(entry)} onArchive={() => archive(entry)} onRefund={() => setRefundTarget(entry)} />)}
            </div>
          )}
          </div>
        </details>
      </div>
      {refundTarget && <FinanceRefundDialog entry={refundTarget} lang={lang} onClose={() => setRefundTarget(null)} onSaved={async () => { setRefundTarget(null); setFeedback(adminCopy(lang, 'Rimborso/storno registrato.', 'Refund/reversal recorded.')); await refresh(); }} />}
      {activeFinanceDetail && <FinanceDetailModal detail={activeFinanceDetail} lang={lang} onClose={() => setActiveFinanceDetail(null)} />}
    </section>
  );
}

function PartnerCommissionsFinancePanel({ lang, session, commissions = [], summary = null, onChanged }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const data = summary || { pendingAmount: 0, approvedUnpaidAmount: 0, paidAmount: 0, cancelledAmount: 0, unpaidLiability: 0, pendingCount: 0, approvedCount: 0, paidCount: 0, cancelledCount: 0, byPartner: [], byCurrency: [] };
  const visible = statusFilter === 'all' ? commissions : commissions.filter((item) => item.status === statusFilter);

  async function setStatus(item, status) {
    setBusyId(item.id);
    setError('');
    try {
      await updatePartnerCommissionStatus(item.id, status, item.status_notes || '', session.user.id);
      trackEvent(status === 'paid' ? 'partner_commission_marked_paid' : 'partner_commission_status_changed', { partner_id: item.partner_id || '', source_type: item.source_type || '', commission_status: status, currency: item.currency || 'EUR', has_commission_amount: Boolean(item.commission_amount), commission_type: item.commission_type || '', source_section: 'admin_finance', admin_action: `set_${status}` }, { dedupe: false });
      onChanged?.(status === 'paid' ? adminCopy(lang, 'Commissione segnata come pagata.', 'Commission marked as paid.') : adminCopy(lang, 'Commissione aggiornata.', 'Commission updated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Commissione non aggiornata.', 'Commission not updated.'));
    } finally {
      setBusyId('');
    }
  }

  return (
    <details className="admin-panel finance-collapsible-panel partner-commissions-panel" open>
      <summary className="finance-collapsible-summary">
        <strong>{adminCopy(lang, 'Commissioni partner', 'Partner commissions')}</strong>
        {data.byCurrency?.some((row) => Number(row.unpaidLiability || 0) > 0) && <em>{formatCurrencyMetricRows(data.byCurrency, 'unpaidLiability', lang)} {adminCopy(lang, 'non pagate', 'unpaid')}</em>}
      </summary>
      <div className="finance-collapsible-body">
        <p className="small-note">{adminCopy(lang, 'Le commissioni sono interne, non pubbliche, e vengono conteggiate come liabilità fino al pagamento manuale.', 'Commissions are internal, non-public, and counted as liabilities until manually paid.')}</p>
        {error && <div className="admin-alert error compact-alert">{error}</div>}
        <div className="admin-summary-grid partner-commission-summary-grid">
          <SummaryCard label={adminCopy(lang, 'In attesa', 'Pending')} value={formatCurrencyMetricRows(data.byCurrency || [], 'pendingAmount', lang)} helper={`${data.pendingCount || 0} ${adminCopy(lang, 'record', 'records')}`} />
          <SummaryCard label={adminCopy(lang, 'Approvate non pagate', 'Approved unpaid')} value={formatCurrencyMetricRows(data.byCurrency || [], 'approvedUnpaidAmount', lang)} helper={`${data.approvedCount || 0} ${adminCopy(lang, 'record', 'records')}`} />
          {data.byCurrency?.some((row) => Number(row.unpaidLiability || 0) > 0) && <SummaryCard label={adminCopy(lang, 'Totale non pagato', 'Total unpaid')} value={formatCurrencyMetricRows(data.byCurrency || [], 'unpaidLiability', lang)} helper={adminCopy(lang, 'Liabilità finance', 'Finance liability')} />}
          <SummaryCard label={adminCopy(lang, 'Pagate', 'Paid')} value={formatCurrencyMetricRows(data.byCurrency || [], 'paidAmount', lang)} helper={`${data.paidCount || 0} ${adminCopy(lang, 'record', 'records')}`} />
          <SummaryCard label={adminCopy(lang, 'Annullate', 'Cancelled')} value={formatCurrencyMetricRows(data.byCurrency || [], 'cancelledAmount', lang)} helper={`${data.cancelledCount || 0} ${adminCopy(lang, 'record', 'records')}`} />
        </div>
        <div className="admin-two-column partner-commission-layout">
          <section className="partner-settlement-section">
            <h3>{adminCopy(lang, 'Riepilogo settlement per partner', 'Partner settlement summary')}</h3>
            {!data.byPartner?.length ? <p className="small-note">{adminCopy(lang, 'Nessuna commissione partner presente.', 'No partner commissions yet.')}</p> : (
              <div className="admin-table-wrap">
                <table className="admin-table compact-table">
                  <thead><tr><th>Partner</th><th>{adminCopy(lang, 'In attesa', 'Pending')}</th><th>{adminCopy(lang, 'Approvate', 'Approved')}</th><th>{adminCopy(lang, 'Pagate', 'Paid')}</th><th>{adminCopy(lang, 'Record', 'Records')}</th><th>{adminCopy(lang, 'Ultima', 'Last')}</th></tr></thead>
                  <tbody>{data.byPartner.map((row) => <tr key={`${row.partner_id || row.partner_name}:${row.currency || 'EUR'}`}><td>{row.partner_name || '—'}</td><td>{formatMoney(row.pendingAmount || 0, row.currency || 'EUR', lang)}</td><td>{formatMoney(row.approvedUnpaidAmount || 0, row.currency || 'EUR', lang)}</td><td>{formatMoney(row.paidAmount || 0, row.currency || 'EUR', lang)}</td><td>{row.count}</td><td>{row.lastCommissionDate ? formatLocalDateTime(row.lastCommissionDate, lang, '') : '—'}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
          <section className="partner-commission-list-section">
            <div className="admin-panel-header compact-header"><h3>{adminCopy(lang, 'Dettaglio commissioni', 'Commission details')}</h3><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">{adminCopy(lang, 'Tutti gli stati', 'All statuses')}</option>{PARTNER_COMMISSION_STATUSES.map((status) => <option value={status} key={status}>{partnerCommissionStatusLabel(status, lang)}</option>)}</select></div>
            {!visible.length ? <p className="small-note">{adminCopy(lang, 'Nessuna commissione per questo filtro.', 'No commissions for this filter.')}</p> : (
              <div className="partner-commission-card-list">
                {visible.map((item) => (
                  <article className="partner-commission-card" key={item.id}>
                    <div className="request-card-head">
                      <div><h4>{item.partner_name || '—'}</h4><p>{partnerCommissionSourceLabel(item, lang)} · {item.experience_title || adminExperienceLabel(item.experience_id, lang) || '—'} · {item.experience_date ? formatDateForMessage(item.experience_date, lang) : '—'}</p></div>
                      <span className={`status-pill ${item.status}`}>{partnerCommissionStatusLabel(item.status, lang)}</span>
                    </div>
                    <dl className="request-details-grid compact-details-grid">
                      <div><dt>{adminCopy(lang, 'Lordo', 'Gross')}</dt><dd>{formatMoney(item.gross_amount, item.currency, lang)}</dd></div>
                      <div><dt>{adminCopy(lang, 'Regola', 'Rule')}</dt><dd>{item.commission_type === 'percentage' ? `${item.commission_value}%` : formatMoney(item.commission_value, item.currency, lang)}</dd></div>
                      <div><dt>{adminCopy(lang, 'Commissione', 'Commission')}</dt><dd>{formatMoney(item.commission_amount, item.currency, lang)}</dd></div>
                      <div><dt>{adminCopy(lang, 'Cliente', 'Customer')}</dt><dd>{item.customer_display_name || '—'}</dd></div>
                    </dl>
                    {item.status_notes && <p className="small-note">{item.status_notes}</p>}
                    <div className="request-actions-row">
                      {item.status === 'pending' && <button className="button secondary" type="button" disabled={busyId === item.id} onClick={() => setStatus(item, 'approved')}>{adminCopy(lang, 'Approva', 'Approve')}</button>}
                      {['pending', 'approved'].includes(item.status) && <button className="button secondary danger" type="button" disabled={busyId === item.id} onClick={() => setStatus(item, 'cancelled')}>{adminCopy(lang, 'Annulla', 'Cancel')}</button>}
                      {item.status === 'approved' && <button className="button primary" type="button" disabled={busyId === item.id} onClick={() => setStatus(item, 'paid')}>{adminCopy(lang, 'Segna pagata', 'Mark paid')}</button>}
                      {['paid', 'cancelled'].includes(item.status) && <span className="small-note">{adminCopy(lang, 'Solo consultazione', 'View only')}</span>}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </details>
  );
}

function reconciliationIssueLabel(type, lang) {
  const labels = {
    booking_no_payment: ['Prenotazione accettata senza pagamento registrato', 'Accepted booking with no recorded payment'],
    booking_balance_due: ['Saldo prenotazione da incassare', 'Booking balance due'],
    ambiguous_expected: ['Più entrate attese ambigue sulla prenotazione', 'Multiple ambiguous expected entries on booking'],
    suspected_duplicate_payment: ['Possibile pagamento duplicato', 'Possible duplicate payment'],
    cancelled_booking_with_net_payment: ['Prenotazione annullata con incasso netto non rimborsato', 'Cancelled booking with unrefunded net payment'],
    cancelled_booking_code_with_net_payment: ['Codice annullato con incasso netto non rimborsato', 'Cancelled booking code with unrefunded net payment'],
    booking_code_no_payment: ['Codice usato senza pagamento registrato', 'Redeemed code with no recorded payment'],
    booking_code_balance_due: ['Saldo codice prenotazione da incassare', 'Booking-code balance due'],
    booking_code_ambiguous_expected: ['Entrate attese ambigue per codice', 'Ambiguous expected entries for booking code'],
    booking_code_duplicate_payment: ['Possibile pagamento codice duplicato', 'Possible duplicate booking-code payment'],
    gift_card_paid_missing_income: ['Gift Card pagata senza entrata registrata', 'Paid Gift Card without recorded income'],
    gift_card_issued_with_income_review: ['Gift Card emessa con entrata storica da verificare', 'Issued Gift Card with historical income to review'],
    gift_card_issued_unpaid: ['Gift Card emessa ma non pagata', 'Issued Gift Card but unpaid'],
    gift_card_duplicate_income: ['Possibile entrata Gift Card duplicata', 'Possible duplicate Gift Card income'],
    cancelled_gift_card_with_net_payment: ['Gift Card annullata con incasso netto non rimborsato', 'Cancelled Gift Card with unrefunded net payment'],
    paid_commission_missing_expense: ['Commissione pagata senza uscita Finance', 'Paid commission without Finance expense'],
    duplicate_commission_expense: ['Possibile uscita commissione duplicata', 'Possible duplicate commission expense'],
    unlinked_business_finance_entry: ['Movimento business senza fonte identificabile', 'Business transaction without identifiable source']
  };
  const pair = labels[type] || ['Movimento da verificare', 'Transaction requires review'];
  return lang === 'it' ? pair[0] : pair[1];
}

function FinanceReconciliationPanel({ lang, reconciliation, requestById, financeById, session, onChanged, onOpenEntry, onRefundEntry }) {
  const issues = reconciliation?.issues || [];
  return (
    <details className="admin-panel finance-collapsible-panel finance-reconciliation-panel" open={issues.length > 0}>
      <summary className="finance-collapsible-summary"><strong>{adminCopy(lang, 'Da riconciliare', 'Money to reconcile')}</strong><em>{issues.length}</em></summary>
      <div className="finance-collapsible-body">
        <p className="small-note">{adminCopy(lang, 'Saldi dovuti, record ambigui e incoerenze vengono segnalati senza modificare automaticamente lo storico.', 'Balances due, ambiguous records and inconsistencies are surfaced without automatically changing history.')}</p>
        {Object.keys(reconciliation?.totalsByCurrency || {}).length > 0 && <p className="small-note"><strong>{adminCopy(lang, 'Importi coinvolti per valuta', 'Amounts involved by currency')}:</strong> {Object.entries(reconciliation.totalsByCurrency).map(([currency, amount]) => formatMoney(amount, currency, lang)).join(' · ')}</p>}
        {!issues.length ? <p className="notification-status success">{adminCopy(lang, 'Nessuna anomalia deterministica rilevata nei record caricati.', 'No deterministic anomalies found in the loaded records.')}</p> : <div className="finance-reconciliation-list">
          {issues.map((issue, index) => {
            const request = issue.sourceType === 'booking_request' ? requestById.get(issue.sourceId) : null;
            return <article className="finance-reconciliation-item" key={`${issue.type}:${issue.sourceId}:${index}`}>
              <div><strong>{reconciliationIssueLabel(issue.type, lang)}</strong><p className="small-note">{issue.sourceType} · {String(issue.sourceId || '').slice(0, 8)}… · {formatMoney(issue.amount || 0, issue.currency || 'EUR', lang)}</p></div>
              <div className="request-actions-row">
                {request && ['booking_no_payment','booking_balance_due'].includes(issue.type) && <RequestIncomeConfirmAction request={request} lang={lang} session={session} onUpdated={() => onChanged?.()} />}
                {issue.financeEntryId && financeById?.get(issue.financeEntryId) && <button className="button secondary" type="button" onClick={() => onOpenEntry?.(financeById.get(issue.financeEntryId))}>{adminCopy(lang, 'Rivedi movimento', 'Review transaction')}</button>}
                {issue.financeEntryId && financeById?.get(issue.financeEntryId) && ['cancelled_booking_with_net_payment','cancelled_booking_code_with_net_payment','cancelled_gift_card_with_net_payment'].includes(issue.type) && <button className="button secondary" type="button" onClick={() => onRefundEntry?.(financeById.get(issue.financeEntryId))}>{adminCopy(lang, 'Registra rimborso', 'Record refund')}</button>}
                {issue.route && !request && <a className="button secondary" href={issue.route}>{adminCopy(lang, 'Apri record', 'Open record')}</a>}
                {request && !['booking_no_payment','booking_balance_due'].includes(issue.type) && <a className="button secondary" href="/admin/requests">{adminCopy(lang, 'Rivedi prenotazione', 'Review booking')}</a>}
              </div>
            </article>;
          })}
        </div>}
      </div>
    </details>
  );
}

function FinanceOverview({ lang, summary, rangeLabel, onOpen }) {
  const empty = adminCopy(lang, 'Nessun movimento per questo periodo.', 'No movements for this period.');
  return (
    <details className="admin-panel finance-collapsible-panel finance-overview-panel">
      <summary className="finance-collapsible-summary"><strong>{rangeLabel}</strong></summary>
      <div className="finance-collapsible-body">
        <div className="finance-overview-grid">
          <article className="finance-overview-metric"><span>{adminCopy(lang, 'Risultato netto periodo', 'Period net result')}</span><strong>{formatCurrencyMetricRows(summary.byCurrency || [], 'net', lang)}</strong></article>
          <button type="button" className="finance-overview-metric clickable" onClick={() => onOpen({ key: 'linked-bookings', title: adminCopy(lang, 'Movimenti collegati a prenotazioni', 'Movements linked to bookings'), entries: summary.linkedBookingEntries, total: summary.linkedBookingEntries.length })}><span>{adminCopy(lang, 'Movimenti collegati a prenotazioni', 'Movements linked to bookings')}</span><strong>{summary.linkedBookingEntries.length}</strong></button>
          <button type="button" className="finance-overview-metric clickable" onClick={() => onOpen({ key: 'linked-fixed', title: adminCopy(lang, 'Movimenti collegati a escursioni fisse', 'Movements linked to fixed excursions'), entries: summary.linkedFixedEntries, total: summary.linkedFixedEntries.length })}><span>{adminCopy(lang, 'Movimenti collegati a escursioni fisse', 'Movements linked to fixed excursions')}</span><strong>{summary.linkedFixedEntries.length}</strong></button>
          <button type="button" className="finance-overview-metric clickable" onClick={() => onOpen({ key: 'unlinked', title: adminCopy(lang, 'Movimenti non collegati', 'Unlinked movements'), entries: summary.unlinkedEntries, total: summary.unlinkedEntries.length })}><span>{adminCopy(lang, 'Movimenti non collegati', 'Unlinked movements')}</span><strong>{summary.unlinkedEntries.length}</strong></button>
        </div>
        {(summary.byCurrency || []).length > 1 && <p className="small-note">{adminCopy(lang, 'Le valute restano separate: nessuna conversione FX o somma tra valute viene applicata.', 'Currencies remain separate: no FX conversion or cross-currency sum is applied.')}</p>}
        <div className="finance-category-breakdown-grid">
          <FinanceCategoryBreakdown lang={lang} title={adminCopy(lang, 'Entrate per categoria', 'Income by category')} empty={empty} categories={summary.incomeCategories} onOpen={(category) => onOpen({ key: `income-${category.key}`, title: `${adminCopy(lang, 'Entrate', 'Income')} · ${financeCategoryLabel(category.categoryKey || category.key, lang)}`, entries: category.entries, total: category.total })} />
          <FinanceCategoryBreakdown lang={lang} title={adminCopy(lang, 'Uscite per categoria', 'Expenses by category')} empty={empty} categories={summary.expenseCategories} onOpen={(category) => onOpen({ key: `expense-${category.key}`, title: `${adminCopy(lang, 'Uscite', 'Expenses')} · ${financeCategoryLabel(category.categoryKey || category.key, lang)}`, entries: category.entries, total: category.total })} />
        </div>
      </div>
    </details>
  );
}

function FinanceProfitLoss({ lang, summary, adminContent = {} }) {
  const rows = summary.byCurrency?.length ? summary.byCurrency : [{ currency: 'EUR', income: 0, expenses: 0, net: 0 }];
  return (
    <details className="admin-panel finance-collapsible-panel finance-pl-panel">
      <summary className="finance-collapsible-summary"><AdminEditableText as="strong" itemKey="admin.finance.profitLoss.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Profitti e perdite', 'Profit & Loss')} /></summary>
      <div className="finance-collapsible-body">
        {rows.map((row) => {
          const volume = Math.max(Math.abs(row.income), Math.abs(row.expenses), 1);
          const incomeWidth = Math.max(6, Math.round((Math.abs(row.income) / volume) * 100));
          const expenseWidth = Math.max(6, Math.round((Math.abs(row.expenses) / volume) * 100));
          const margin = row.income > 0 ? Math.round((row.net / row.income) * 100) : 0;
          return <section className="finance-pl-currency" key={row.currency} aria-label={`${adminCopy(lang, 'Valuta', 'Currency')} ${row.currency}`}>
            <h3>{row.currency}</h3>
            <div className="finance-pl-grid"><article className="finance-pl-total"><span>{adminCopy(lang, 'Incassato', 'Recorded payments')}</span><strong className="finance-amount income">{formatMoney(row.income, row.currency, lang)}</strong></article><article className="finance-pl-total"><span>{adminCopy(lang, 'Uscite', 'Expenses')}</span><strong className="finance-amount expense">{formatMoney(row.expenses, row.currency, lang)}</strong></article><article className="finance-pl-total highlighted"><span>{adminCopy(lang, 'Risultato netto', 'Net result')}</span><strong className={`finance-amount ${row.net < 0 ? 'expense' : 'income'}`}>{formatMoney(row.net, row.currency, lang)}</strong></article></div>
            <div className="finance-pl-bars" aria-label={adminCopy(lang, 'Confronto entrate e uscite', 'Income versus expenses comparison')}><div className="finance-pl-bar-row"><span>{adminCopy(lang, 'Entrate', 'Income')}</span><div className="finance-pl-bar-track"><i className="income" style={{ width: `${incomeWidth}%` }} /></div><strong>{formatMoney(row.income, row.currency, lang)}</strong></div><div className="finance-pl-bar-row"><span>{adminCopy(lang, 'Uscite', 'Expenses')}</span><div className="finance-pl-bar-track"><i className="expense" style={{ width: `${expenseWidth}%` }} /></div><strong>{formatMoney(row.expenses, row.currency, lang)}</strong></div></div>
            <p className="small-note finance-pl-note">{adminCopy(lang, 'Margine netto sul periodo', 'Net margin for the period')}: <strong>{margin}%</strong></p>
          </section>;
        })}
        {rows.length > 1 && <p className="small-note">{adminCopy(lang, 'Nessun totale consolidato viene mostrato senza un motore FX.', 'No consolidated total is shown without an FX engine.')}</p>}
      </div>
    </details>
  );
}

function FinanceCategoryBreakdown({ lang, title, categories, empty, onOpen }) {
  return (
    <section className="finance-category-breakdown">
      <h3>{title}</h3>
      {!categories.length ? <p className="small-note">{empty}</p> : (
        <div className="finance-category-list">
          {categories.map((category) => (
            <button type="button" className="finance-category-row" key={category.key} onClick={() => onOpen(category)}>
              <span>
                <strong>{financeCategoryLabel(category.key, lang)}</strong>
                <small>{category.entries.length} {category.entries.length === 1 ? adminCopy(lang, 'movimento', 'movement') : adminCopy(lang, 'movimenti', 'movements')} · {category.percentage}%</small>
              </span>
              <strong className={`finance-amount ${category.type}`}>{formatMoney(category.total, category.currency || 'EUR', lang)}</strong>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function FinanceDetailModal({ detail, lang, onClose }) {
  const [selectedEntry, setSelectedEntry] = useState(detail.selectedEntry || null);
  const detailMoney = financeDetailMoney(detail.entries || [], detail.key);
  const detailLedger = calculateLedgerSummary(detail.entries || []);
  const detailCurrencies = detailLedger.byCurrency || [];
  const isCountOnly = detail.key === 'linked' || detail.key === 'linked-bookings' || detail.key === 'linked-fixed' || detail.key === 'unlinked' || detail.key === 'unlinked-expenses';
  useBodyScrollLock(true);
  useEffect(() => { setSelectedEntry(detail.selectedEntry || null); }, [detail]);
  return (
    <div className="modal-backdrop finance-detail-backdrop" role="presentation" onClick={onClose}>
      <section className="admin-modal finance-detail-modal full-screen-admin-modal" role="dialog" aria-modal="true" aria-labelledby="financeDetailTitle" onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <span className="kicker">{selectedEntry ? adminCopy(lang, 'Dettaglio movimento', 'Movement detail') : adminCopy(lang, 'Dettaglio finanze', 'Finance details')}</span>
            <h2 id="financeDetailTitle">{selectedEntry ? selectedEntry.title || detail.title : detail.title}</h2>
            {!selectedEntry && <p>{isCountOnly ? `${detail.entries.length} ${adminCopy(lang, 'movimenti', 'entries')}` : detailMoney ? formatMoney(detailMoney.amount, detailMoney.currency, lang) : detailCurrencies.length > 1 ? adminCopy(lang, 'Più valute — vedi movimenti', 'Multiple currencies — see entries') : formatMoney(0, 'EUR', lang)}</p>}
          </div>
          <div className="modal-actions inline-actions">
            {selectedEntry && detail.entries.length > 1 && <button className="button secondary" type="button" onClick={() => setSelectedEntry(null)}>{adminCopy(lang, 'Indietro', 'Back')}</button>}
            <button className="modal-close-button" type="button" onClick={onClose}>{adminCopy(lang, 'Chiudi', 'Close')}</button>
          </div>
        </div>
        {selectedEntry ? <FinanceMovementDetail entry={selectedEntry} lang={lang} /> : (
          detail.entries.length === 0 ? <p>{adminCopy(lang, 'Nessun movimento disponibile.', 'No entries available.')}</p> : (
            <div className="finance-detail-entry-list">
              {detail.entries.map((entry) => <FinanceMovementRow key={entry.id} entry={entry} lang={lang} onClick={() => setSelectedEntry(entry)} />)}
            </div>
          )
        )}
      </section>
    </div>
  );
}

function FinanceMovementRow({ entry, lang, onClick }) {
  return (
    <button type="button" className="finance-detail-entry finance-movement-row finance-movement-row--clickable" onClick={onClick}>
      <div>
        <strong>{entry.title || '-'}</strong>
        <p>{formatDateForMessage(entry.entry_date, lang)} · {financeCategoryLabel(entry.category, lang)} · {entry.payment_method || adminCopy(lang, 'Metodo non indicato', 'No payment method')}</p>
        {financeEntryCustomerName(entry) && <p className="small-note">{financeEntryCustomerName(entry)}</p>}
        {entry.description && <p className="small-note">{entry.description}</p>}
        <p className="small-note">{financeEntryIsLinked(entry) ? adminCopy(lang, 'Collegata', 'Linked') : adminCopy(lang, 'Non collegata', 'Unlinked')}</p>
      </div>
      <strong className={`finance-amount ${entry.type}`}>{entry.type === 'expense' ? '-' : '+'}{formatMoney(entry.amount, entry.currency)}</strong>
    </button>
  );
}

function FinanceMovementDetail({ entry, lang }) {
  const booking = entry.linkedBooking;
  const fixed = entry.linkedFixedExcursion;
  const leaflet = entry.linkedLeaflet;
  const missing = adminCopy(lang, 'Non disponibile', 'Not available');
  const guests = [booking?.adults ? `${booking.adults} ${adminCopy(lang, 'adulti', 'adults')}` : '', booking?.children ? `${booking.children} ${adminCopy(lang, 'bambini', 'children')}` : ''].filter(Boolean).join(' · ');
  return (
    <div className="finance-movement-detail">
      <section className="finance-movement-hero">
        <div>
          <span className="kicker">{entry.type === 'expense' ? adminCopy(lang, 'Uscita', 'Expense') : adminCopy(lang, 'Entrata', 'Income')}</span>
          <h3>{entry.title || missing}</h3>
          <p>{formatDateForMessage(entry.entry_date, lang)} · {financeCategoryLabel(entry.category, lang)}</p>
        </div>
        <strong className={`finance-amount ${entry.type}`}>{entry.type === 'expense' ? '-' : '+'}{formatMoney(entry.amount, entry.currency)}</strong>
      </section>
      <div className="finance-detail-grid">
        <FinanceDetailSection title={adminCopy(lang, 'Informazioni pagamento', 'Payment information')}>
          <FinanceDetailRow label={adminCopy(lang, 'Tipo', 'Type')} value={entry.type === 'expense' ? adminCopy(lang, 'Uscita', 'Expense') : adminCopy(lang, 'Entrata', 'Income')} />
          <FinanceDetailRow label={adminCopy(lang, 'Data', 'Date')} value={formatDateForMessage(entry.entry_date, lang)} />
          <FinanceDetailRow label={adminCopy(lang, 'Importo', 'Amount')} value={formatMoney(entry.amount, entry.currency)} />
          <FinanceDetailRow label={adminCopy(lang, 'Valuta', 'Currency')} value={entry.currency || 'EUR'} />
          <FinanceDetailRow label={adminCopy(lang, 'Categoria', 'Category')} value={financeCategoryLabel(entry.category, lang)} />
          <FinanceDetailRow label={adminCopy(lang, 'Metodo pagamento', 'Payment method')} value={entry.payment_method || missing} />
          <FinanceDetailRow label={adminCopy(lang, 'Stato', 'Status')} value={financeEntryIsLinked(entry) ? adminCopy(lang, 'Collegata', 'Linked') : adminCopy(lang, 'Non collegata', 'Unlinked')} />
          <FinanceDetailRow label={adminCopy(lang, 'Archiviata', 'Archived')} value={entry.active === false ? adminCopy(lang, 'Sì', 'Yes') : adminCopy(lang, 'No', 'No')} />
          <FinanceDetailRow label={adminCopy(lang, 'Creata', 'Created')} value={entry.created_at ? formatDateForMessage(String(entry.created_at).slice(0, 10), lang) : missing} />
          <FinanceDetailRow label={adminCopy(lang, 'Aggiornata', 'Updated')} value={entry.updated_at ? formatDateForMessage(String(entry.updated_at).slice(0, 10), lang) : missing} />
        </FinanceDetailSection>
        <FinanceDetailSection title={adminCopy(lang, 'Cliente', 'Customer')}>
          {booking ? (
            <>
              <FinanceDetailRow label={adminCopy(lang, 'Nome', 'Name')} value={booking.customer_name || missing} />
              <FinanceDetailRow label="Email" value={booking.customer_email || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Telefono / WhatsApp', 'Phone / WhatsApp')} value={booking.customer_phone || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Contatto preferito', 'Preferred contact')} value={booking.preferred_contact || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Fonte conoscenza', 'Discovery source')} value={heardAboutUsDisplay(booking.heard_about_us, booking.heard_about_us_detail, lang, { fallback: missing })} />
            </>
          ) : <p className="small-note">{adminCopy(lang, 'Nessuna prenotazione collegata.', 'No linked booking.')}</p>}
        </FinanceDetailSection>
        <FinanceDetailSection title={adminCopy(lang, 'Prenotazione collegata', 'Linked booking')}>
          {booking ? (
            <>
              <FinanceDetailRow label={adminCopy(lang, 'Codice', 'Code')} value={booking.booking_code || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Esperienza', 'Experience')} value={adminExperienceLabel(booking.experience_id, lang)} />
              <FinanceDetailRow label={adminCopy(lang, 'Data richiesta / escursione', 'Requested / excursion date')} value={formatDateForMessage(booking.requested_date, lang) || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Ospiti', 'Guests')} value={guests || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Stato richiesta', 'Request status')} value={requestStatusLabels[booking.status]?.[lang] || booking.status || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Tipo richiesta', 'Request type')} value={booking.request_type || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Fonte conoscenza', 'Discovery source')} value={heardAboutUsDisplay(booking.heard_about_us, booking.heard_about_us_detail, lang, { fallback: missing })} />
              <FinanceDetailRow label={adminCopy(lang, 'Nota admin', 'Admin note')} value={booking.admin_note || missing} />
            </>
          ) : <p className="small-note">{adminCopy(lang, 'Nessuna prenotazione collegata.', 'No linked booking.')}</p>}
        </FinanceDetailSection>
        <FinanceDetailSection title={adminCopy(lang, 'Escursione fissa collegata', 'Linked fixed excursion')}>
          {fixed ? (
            <>
              <FinanceDetailRow label={adminCopy(lang, 'Titolo', 'Title')} value={fixedExcursionTitle(fixed, lang) || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Data', 'Date')} value={formatDateForMessage(fixed.date, lang) || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Orario', 'Time')} value={`${fixed.start_time ? String(fixed.start_time).slice(0, 5) : ''}${fixed.end_time ? `–${String(fixed.end_time).slice(0, 5)}` : ''}` || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Esperienza', 'Experience')} value={adminExperienceLabel(fixed.experience_id, lang)} />
              <FinanceDetailRow label={adminCopy(lang, 'Punto d’incontro', 'Meeting point')} value={fixedExcursionField(fixed, 'meeting_point', lang) || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Posti disponibili', 'Places remaining')} value={fixed.places_remaining !== undefined ? `${fixed.places_remaining}/${fixed.capacity || '-'}` : missing} />
            </>
          ) : <p className="small-note">{adminCopy(lang, 'Nessuna escursione fissa collegata.', 'No linked fixed excursion.')}</p>}
        </FinanceDetailSection>
        <FinanceDetailSection title={adminCopy(lang, 'Calendario mensile collegato', 'Linked monthly calendar')}>
          {leaflet ? <FinanceDetailRow label={adminCopy(lang, 'Calendario', 'Calendar')} value={leafletLabel(leaflet, lang)} /> : <p className="small-note">{adminCopy(lang, 'Nessun calendario mensile collegato.', 'No linked monthly calendar.')}</p>}
        </FinanceDetailSection>
        <FinanceDetailSection title={adminCopy(lang, 'Note', 'Notes')}>
          <p>{entry.description || adminCopy(lang, 'Nessuna nota.', 'No notes.')}</p>
          {entry.archive_reason && <p className="small-note">{adminCopy(lang, 'Motivo archivio', 'Archive reason')}: {entry.archive_reason}</p>}
        </FinanceDetailSection>
      </div>
    </div>
  );
}

function FinanceDetailSection({ title, children }) {
  return (
    <details className="finance-detail-section">
      <summary><span>{title}</span></summary>
      <div className="finance-detail-section-body">{children}</div>
    </details>
  );
}

function FinanceDetailRow({ label, value }) {
  return <div className="finance-detail-row"><span>{label}</span><strong>{value || '-'}</strong></div>;
}

function requestFinanceLabel(request, lang) {
  if (!request) return '-';
  return `${formatDateForMessage(request.requested_date, lang) || '-'} · ${request.customer_name || '-'} · ${adminExperienceLabel(request.experience_id, lang)}${request.booking_code ? ` · ${request.booking_code}` : ''}`;
}

function FinanceEntryCard({ entry, lang, onOpen, onEdit, onArchive, onRefund }) {
  const actions = financeEntryActions(entry);
  return (
    <article className={`finance-entry-card ${entry.active === false ? 'inactive' : ''}`}>
      <div className="request-card-head">
        <div><h3>{entry.title}</h3><p>{formatDateForMessage(entry.entry_date, lang)} · {financeCategoryLabel(entry.category, lang)}</p></div>
        <strong className={`finance-amount ${entry.type}`}>{entry.type === 'expense' ? '-' : '+'}{formatMoney(entry.amount, entry.currency)}</strong>
      </div>
      {entry.description && <p>{entry.description}</p>}
      <p className="small-note">{entry.payment_method || adminCopy(lang, 'Metodo non indicato', 'No payment method')} · {financeEntryIsLinked(entry) ? adminCopy(lang, 'Collegata', 'Linked') : adminCopy(lang, 'Non collegata', 'Unlinked')}{financeEntryCustomerName(entry) ? ` · ${financeEntryCustomerName(entry)}` : ''}</p>
      {!actions.edit && <p className="small-note">{actions.refund
        ? adminCopy(lang, 'Movimento riconosciuto: usa Registra rimborso per uno storno autorizzato, senza modificare lo storico.', 'Recognized transaction: use Record refund for an authorized reversal without rewriting history.')
        : entry.type === 'expense'
          ? adminCopy(lang, 'Uscita in sola lettura: richiedi una correzione contabile autorizzata. Lo storno delle uscite non è disponibile qui.', 'Read-only expense: request an authorized audited correction. Expense reversal is not available here.')
          : adminCopy(lang, 'Voce storica in sola lettura: richiedi una verifica e una correzione contabile autorizzata.', 'Read-only historical entry: request review and an authorized audited correction.')}</p>}
      <div className="request-actions">
        <button className="button secondary" type="button" onClick={onOpen}>{adminCopy(lang, 'Dettaglio', 'Details')}</button>
        {actions.edit && <button className="button secondary" type="button" onClick={onEdit}>{adminCopy(lang, 'Modifica', 'Edit')}</button>}
        {actions.refund && <button className="button secondary" type="button" onClick={onRefund}>{adminCopy(lang, 'Registra rimborso', 'Record refund')}</button>}
        {actions.archive && <button className="button secondary danger" type="button" onClick={onArchive}>{adminCopy(lang, 'Archivia', 'Archive')}</button>}
      </div>
    </article>
  );
}

function FinanceRefundDialog({ entry, lang, onClose, onSaved }) {
  const panelRef = useRef(null);
  const inFlight = useRef(false);
  const [form, setForm] = useState({ amount: String(Math.abs(parseMoneyAmount(entry.amount))), entry_date: todayIso(), payment_method: '', reason: '' });
  const [idempotencyKey] = useState(() => createPaymentIdempotencyKey(`refund:${entry.id}`));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useBodyScrollLock(true);
  function close() { if (!inFlight.current) onClose(); }
  useDialogFocusTrap(true, panelRef, close);

  async function save() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true); setError('');
    try {
      await reverseFinanceEntry(entry.id, { amount: form.amount, entry_date: form.entry_date, payment_method: form.payment_method, reason: form.reason, idempotency_key: idempotencyKey });
      await onSaved?.();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Rimborso non registrato.', 'Refund was not recorded.'));
    } finally { inFlight.current = false; setSaving(false); }
  }

  return <div className="modal-backdrop" role="presentation"><section ref={panelRef} tabIndex={-1} className="admin-modal" role="dialog" aria-modal="true" aria-labelledby={`refund-${entry.id}`}>
    <div className="admin-modal-header"><div><h2 id={`refund-${entry.id}`}>{adminCopy(lang, 'Registra rimborso / storno', 'Record refund / reversal')}</h2><p>{entry.title} · {formatMoney(entry.amount, entry.currency, lang)}</p></div><button type="button" className="icon-button" onClick={close} disabled={saving} aria-label={text(lang, 'close')}>×</button></div>
    <p className="small-note">{adminCopy(lang, 'Il pagamento originale resta nello storico. Questo crea un movimento negativo collegato con data e metodo reali.', 'The original payment remains in history. This creates a linked negative transaction with the actual date and method.')}</p>
    <div className="admin-form-grid request-income-confirm-grid"><AdminInput label={adminCopy(lang, 'Importo rimborsato', 'Refund amount')} type="number" inputMode="decimal" value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} /><AdminInput label={adminCopy(lang, 'Data rimborso', 'Refund date')} type="date" value={form.entry_date} onChange={(value) => setForm((current) => ({ ...current, entry_date: value }))} /><AdminInput label={adminCopy(lang, 'Metodo rimborso', 'Refund method')} value={form.payment_method} onChange={(value) => setForm((current) => ({ ...current, payment_method: value }))} /><AdminInput label={adminCopy(lang, 'Motivo / riferimento', 'Reason / reference')} value={form.reason} onChange={(value) => setForm((current) => ({ ...current, reason: value }))} /></div>
    {error && <div className="admin-alert error" role="alert">{error}</div>}
    <div className="modal-actions"><button className="button primary" type="button" onClick={save} disabled={saving}>{saving ? adminCopy(lang, 'Registrazione...', 'Recording...') : adminCopy(lang, 'Registra rimborso', 'Record refund')}</button><button className="button secondary" type="button" onClick={close} disabled={saving}>{adminCopy(lang, 'Chiudi', 'Close')}</button></div>
  </section></div>;
}

function TodayDashboard({ lang, session, navigate, adminContent = {} }) {
  const { requests, counts, loading, error, refresh } = useAdminRequests({});
  const [blocks, setBlocks] = useState([]);
  const [blocksError, setBlocksError] = useState('');
  const [decision, setDecision] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [feedback, setFeedback] = useState('');

  async function loadBlocks() {
    try {
      const data = await listAvailabilityBlocks({ activeOnly: true, fromDate: todayIso(), toDate: addDaysIso(30) });
      setBlocks(data);
      setBlocksError('');
    } catch (err) {
      setBlocksError(err?.message || 'Could not load availability.');
    }
  }

  useEffect(() => { loadBlocks(); }, []);

  const today = todayIso();
  const pending = requests.filter((request) => request.status === 'pending');
  const todayRequests = requests.filter((request) => request.requested_date === today && ['pending', 'accepted'].includes(request.status));
  const pendingToday = todayRequests.filter((request) => request.status === 'pending');
  const acceptedToday = todayRequests.filter((request) => request.status === 'accepted');
  const upcomingAccepted = requests.filter((request) => request.status === 'accepted' && request.requested_date && request.requested_date >= today);
  const next14 = blocks.filter((block) => block.date <= addDaysIso(14));
  const availabilityIssuesToday = blocks.filter((block) => block.date === today && block.active !== false);
  const operational = requests.filter((request) => request.status === 'accepted' && request.requested_date && request.requested_date >= today && request.requested_date <= addDaysIso(7));
  const recentDecisions = requests.filter((request) => ['accepted', 'declined', 'cancelled', 'archived'].includes(request.status)).slice(0, 8);

  async function refreshAll(message = '') {
    await refresh();
    await loadBlocks();
    if (message) setFeedback(message);
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Oggi', 'Today')}</span>
          <AdminEditableText as="h1" itemKey="admin.today.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Pannello operativo', 'Operations')} />
          <AdminEditableText as="p" itemKey="admin.today.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Stato operativo rapido, richieste e attività da controllare oggi.', 'Fast operational status, requests, and activity to review today.')} />
        </div>
        <div className="admin-header-actions">
          <button className="button primary" type="button" onClick={() => setManualOpen(true)}>{adminCopy(lang, 'Aggiungi richiesta manuale', 'Add manual request')}</button>
          <button className="button secondary" type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Gestisci disponibilità', 'Manage availability')}</button>
        </div>
      </div>

      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {(error || blocksError) && <div className="admin-alert error" role="alert">{error || blocksError}</div>}

      <div className="admin-summary-grid admin-primary-stat-grid">
        <SummaryCard label={<AdminEditableText itemKey="admin.today.pendingToday.label" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Pending oggi', 'Pending today')} />} value={counts?.pending_today ?? '—'} onClick={() => document.getElementById('adminTodayRequests')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} helper={<AdminEditableText as="small" itemKey="admin.today.pendingToday.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Apri richieste di oggi', 'Open today requests')} />} ariaLabel={`${contentText(adminContent, 'admin.today.pendingToday.label', lang, adminCopy(lang, 'Pending oggi', 'Pending today'))}: ${counts?.pending_today ?? '—'}`} />
        <SummaryCard label={<AdminEditableText itemKey="admin.today.pendingTotal.label" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Pending totale', 'Pending total')} />} value={counts?.pending_total ?? '—'} onClick={() => navigate('/admin/requests')} helper={<AdminEditableText as="small" itemKey="admin.today.pendingTotal.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Vai alle richieste', 'Go to requests')} />} ariaLabel={`${contentText(adminContent, 'admin.today.pendingTotal.label', lang, adminCopy(lang, 'Pending totale', 'Pending total'))}: ${counts?.pending_total ?? '—'}`} />
        <SummaryCard label={<AdminEditableText itemKey="admin.today.acceptedToday.label" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Accettate oggi', 'Accepted today')} />} value={counts?.accepted_today ?? '—'} onClick={() => navigate('/admin/upcoming')} helper={<AdminEditableText as="small" itemKey="admin.today.acceptedToday.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Vedi confermate', 'View accepted')} />} ariaLabel={`${contentText(adminContent, 'admin.today.acceptedToday.label', lang, adminCopy(lang, 'Accettate oggi', 'Accepted today'))}: ${counts?.accepted_today ?? '—'}`} />
        <SummaryCard label={<AdminEditableText itemKey="admin.today.availabilityToday.label" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Disponibilità oggi', 'Availability issues today')} />} value={counts?.availability_today ?? '—'} onClick={() => navigate('/admin/availability')} helper={<AdminEditableText as="small" itemKey="admin.today.availabilityToday.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Gestisci calendario', 'Manage calendar')} />} ariaLabel={`${contentText(adminContent, 'admin.today.availabilityToday.label', lang, adminCopy(lang, 'Disponibilità oggi', 'Availability issues today'))}: ${counts?.availability_today ?? '—'}`} />
      </div>

      <div className="admin-two-column">
        <section className="admin-panel">
          <details className="admin-archive-details today-requests-details" id="adminTodayRequests">
            <summary><AdminEditableText itemKey="admin.today.todayRequests.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Richieste di oggi', 'Today requests')} /><strong>{todayRequests.length}</strong></summary>
            <div className="today-requests-collapsed-body">
              <div className="admin-panel-header today-requests-inner-header">
                <p className="small-note">{adminCopy(lang, 'Sezione chiusa di default. Aprila solo quando devi controllare le richieste con data oggi.', 'Collapsed by default. Open it only when you need to check requests dated today.')}</p>
                <button type="button" onClick={() => refreshAll()}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
              </div>
              {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : todayRequests.length === 0 ? <p>{adminCopy(lang, 'Nessuna richiesta con data oggi.', 'No requests dated today.')}</p> : (
                <div className="request-card-list">
                  {todayRequests.map((request) => <RequestCard key={request.id} request={request} lang={lang} session={session} onApprove={() => setDecision({ type: 'approve', request })} onDecline={() => setDecision({ type: 'decline', request })} />)}
                </div>
              )}
            </div>
          </details>

          <div className="admin-panel-subsection">
            <div className="admin-panel-header">
              <AdminEditableText as="h2" itemKey="admin.today.pendingRequests.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Richieste pending da confermare', 'Pending requests needing attention')} />
              <button type="button" onClick={() => navigate('/admin/requests')}>{adminCopy(lang, 'Tutte', 'All')}</button>
            </div>
            {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : pending.length === 0 ? <p>{adminCopy(lang, 'Nessuna richiesta in attesa.', 'No pending requests.')}</p> : (
              <div className="request-card-list">
                {pending.map((request) => <RequestCard key={request.id} request={request} lang={lang} session={session} onApprove={() => setDecision({ type: 'approve', request })} onDecline={() => setDecision({ type: 'decline', request })} />)}
              </div>
            )}
          </div>
        </section>

        <aside className="admin-panel compact-panel admin-operations-panel">
          <div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.today.upcomingOperations.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Operazioni imminenti', 'Upcoming operations')} /></div>
          <details className="admin-archive-details admin-operation-group">
            <summary><AdminEditableText itemKey="admin.today.acceptedBookings.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Prenotazioni accettate', 'Accepted bookings')} /><strong>{operational.length}</strong></summary>
            <AdminMiniList
              items={operational}
              empty={adminCopy(lang, 'Nessuna conferma nei prossimi 7 giorni.', 'No accepted bookings in the next 7 days.')}
              render={(request) => <span><strong>{formatDateForMessage(request.requested_date, lang)}</strong> · {request.customer_name || '-'} · {adminExperienceLabel(request.experience_id, lang)}</span>}
            />
            <button className="button secondary admin-inline-button" type="button" onClick={() => navigate('/admin/upcoming')}>{adminCopy(lang, 'Apri prossime prenotazioni', 'Open upcoming bookings')}</button>
          </details>
          <details className="admin-archive-details admin-operation-group">
            <summary><AdminEditableText itemKey="admin.today.nearTermBlocks.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Blocchi prossimi', 'Near-term blocks')} /><strong>{next14.length}</strong></summary>
            <AdminMiniList
              items={blocks.slice(0, 8)}
              empty={adminCopy(lang, 'Nessun blocco attivo nei prossimi 30 giorni.', 'No active blocks in the next 30 days.')}
              render={(block) => <span><strong>{formatDateForMessage(block.date, lang)}</strong> · {adminAvailabilityStatusLabels[block.status]?.[lang] || block.status} · {block.experience_id ? adminExperienceLabel(block.experience_id, lang) : adminCopy(lang, 'Tutte', 'All')}</span>}
            />
          </details>
          <details className="admin-archive-details admin-operation-group">
            <summary><AdminEditableText itemKey="admin.today.recentDecisions.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Decisioni recenti', 'Recent decisions')} /><strong>{recentDecisions.length}</strong></summary>
            <AdminMiniList
              items={recentDecisions}
              empty={adminCopy(lang, 'Nessuna decisione recente.', 'No recent decisions.')}
              render={(request) => <span><strong>{requestStatusLabels[request.status]?.[lang] || request.status}</strong> · {request.customer_name || '-'} · {formatDateForMessage(request.requested_date, lang) || '-'}{request.decision_note ? ` · ${request.decision_note}` : ''}</span>}
            />
          </details>
          <div className="admin-action-groups">
            <AdminActionGroup title={adminCopy(lang, 'Richieste', 'Requests')}>
              <button type="button" onClick={() => setManualOpen(true)}>{adminCopy(lang, 'Aggiungi richiesta', 'Add request')}</button>
              <button type="button" onClick={() => navigate('/admin/requests')}>{adminCopy(lang, 'Storico richieste', 'Request history')}</button>
            </AdminActionGroup>
            <AdminActionGroup title={adminCopy(lang, 'Disponibilità', 'Availability')}>
              <button type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Blocca data', 'Block date')}</button>
              <button type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Segna limitata', 'Mark limited')}</button>
              <button type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Segna su richiesta', 'Mark on request')}</button>
              <a href="/#availability" target="_blank" rel="noopener noreferrer">{adminCopy(lang, 'Apri calendario pubblico', 'Open public calendar')}</a>
            </AdminActionGroup>
            <AdminActionGroup title={adminCopy(lang, 'Contatti rapidi', 'Quick contacts')}>
              <button type="button" onClick={() => copyText(PHONE_TEL)}>{adminCopy(lang, 'Copia WhatsApp Leonardo', 'Copy Leonardo WhatsApp')}</button>
              <button type="button" onClick={() => copyText(EMAIL)}>{adminCopy(lang, 'Copia email business', 'Copy business email')}</button>
            </AdminActionGroup>
          </div>
        </aside>
      </div>

      {decision && <DecisionModal lang={lang} session={session} decision={decision} onClose={() => setDecision(null)} onDone={(message) => { setDecision(null); refreshAll(message); }} />}
      {manualOpen && <ManualRequestModal lang={lang} session={session} onClose={() => setManualOpen(false)} onSaved={() => { setManualOpen(false); refreshAll(adminCopy(lang, 'Richiesta manuale creata.', 'Manual request created.')); }} />}
    </section>
  );
}

function bucketUpcomingRequests(requests) {
  const today = todayIso();
  const tomorrow = addDaysIso(1);
  const next7 = addDaysIso(7);
  const groups = [
    { key: 'today', title: { it: 'Oggi', en: 'Today' }, items: [] },
    { key: 'tomorrow', title: { it: 'Domani', en: 'Tomorrow' }, items: [] },
    { key: 'next7', title: { it: 'Prossimi 7 giorni', en: 'Next 7 days' }, items: [] },
    { key: 'later', title: { it: 'Più avanti', en: 'Later upcoming' }, items: [] }
  ];

  requests.forEach((request) => {
    if (!request.requested_date || request.requested_date < today) return;
    if (request.requested_date === today) groups[0].items.push(request);
    else if (request.requested_date === tomorrow) groups[1].items.push(request);
    else if (request.requested_date <= next7) groups[2].items.push(request);
    else groups[3].items.push(request);
  });

  return groups;
}

function UpcomingPage({ lang, session, navigate, adminContent = {} }) {
  const { requests, counts, loading, error, refresh } = useAdminRequests({ status: 'accepted' });
  const [blocks, setBlocks] = useState([]);
  const [blocksError, setBlocksError] = useState('');

  async function loadBlocks() {
    try {
      const data = await listAvailabilityBlocks({ activeOnly: true, fromDate: todayIso(), toDate: addDaysIso(90) });
      setBlocks(data);
      setBlocksError('');
    } catch (err) {
      setBlocksError(err?.message || 'Could not load availability.');
    }
  }

  useEffect(() => { loadBlocks(); }, []);

  const upcoming = requests
    .filter((request) => request.status === 'accepted' && request.requested_date && request.requested_date >= todayIso())
    .sort((a, b) => String(a.requested_date).localeCompare(String(b.requested_date)) || String(a.created_at).localeCompare(String(b.created_at)));
  const pastAccepted = requests
    .filter((request) => request.status === 'accepted' && request.requested_date && request.requested_date < todayIso())
    .sort((a, b) => String(b.requested_date).localeCompare(String(a.requested_date)) || String(b.created_at).localeCompare(String(a.created_at)));
  const groups = bucketUpcomingRequests(upcoming);
  const nearBlocks = blocks.filter((block) => block.date <= addDaysIso(30));

  async function refreshAll() {
    await refresh();
    await loadBlocks();
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Conferme owner', 'Owner confirmations')}</span>
          <AdminEditableText as="h1" itemKey="admin.upcoming.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Prossime prenotazioni', 'Upcoming bookings')} />
          <AdminEditableText as="p" itemKey="admin.upcoming.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Richieste accettate e blocchi attivi, organizzati per giorno. Nessuna statistica: solo operatività.', 'Accepted requests and active blocks, organized by date. No analytics: just operations.')} />
        </div>
        <div className="admin-header-actions">
          <button className="button secondary" type="button" onClick={refreshAll}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
          <button className="button primary" type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Gestisci disponibilità', 'Manage availability')}</button>
        </div>
      </div>
      {(error || blocksError) && <div className="admin-alert error" role="alert">{error || blocksError}</div>}
      <div className="admin-two-column">
        <section className="admin-panel upcoming-collapsed-panel">
          <details className="admin-archive-details admin-upcoming-group">
            <summary><AdminEditableText itemKey="admin.upcoming.accepted.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Prenotazioni accettate', 'Accepted bookings')} /><strong>{counts?.upcoming_accepted ?? '—'}</strong></summary>
            {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : upcoming.length === 0 ? <p>{adminCopy(lang, 'Nessuna prenotazione accettata futura.', 'No future accepted bookings.')}</p> : (
              <div className="upcoming-group-list">
                {groups.map((group) => group.items.length > 0 && (
                  <details className="admin-archive-details nested-upcoming-group" key={group.key}>
                    <summary><span>{group.title[lang]}</span><strong>{group.items.length}</strong></summary>
                    <div className="request-card-list compact-list">
                      {group.items.map((request) => <RequestCard key={request.id} request={request} lang={lang} session={session} compact />)}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </details>
          <details className="admin-archive-details admin-upcoming-group">
            <summary><AdminEditableText itemKey="admin.upcoming.past.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Esperienze passate', 'Past experiences')} /><strong>{pastAccepted.length}</strong></summary>
            {pastAccepted.length === 0 ? <p className="small-note">{adminCopy(lang, 'Nessuna esperienza passata.', 'No past experiences.')}</p> : (
              <div className="request-card-list compact-list">
                {pastAccepted.map((request) => <RequestCard key={request.id} request={request} lang={lang} session={session} compact />)}
              </div>
            )}
          </details>
        </section>
        <aside className="admin-panel compact-panel">
          <AdminEditableText as="h2" itemKey="admin.upcoming.blocks.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Blocchi e limitazioni', 'Blocks and limitations')} />
          <AdminMiniList
            items={nearBlocks}
            empty={adminCopy(lang, 'Nessun blocco attivo nei prossimi 30 giorni.', 'No active blocks in the next 30 days.')}
            render={(block) => <span><strong>{formatDateForMessage(block.date, lang)}</strong> · {adminAvailabilityStatusLabels[block.status]?.[lang] || block.status} · {block.experience_id ? adminExperienceLabel(block.experience_id, lang) : adminCopy(lang, 'Tutte le esperienze', 'All experiences')}</span>}
          />
          <div className="admin-action-groups">
            <AdminActionGroup title={adminCopy(lang, 'Scorciatoie', 'Shortcuts')}>
              <button type="button" onClick={() => navigate('/admin/today')}>{adminCopy(lang, 'Torna a oggi', 'Back to Today')}</button>
              <button type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Blocca / limita data', 'Block / limit date')}</button>
              <a href="/#availability" target="_blank" rel="noopener noreferrer">{adminCopy(lang, 'Apri calendario pubblico', 'Open public calendar')}</a>
            </AdminActionGroup>
          </div>
        </aside>
      </div>
    </section>
  );
}

function SummaryCard({ label, value, onClick, helper, ariaLabel }) {
  const labelNode = React.isValidElement(label) ? label : <span>{label}</span>;
  const helperNode = helper ? (React.isValidElement(helper) ? helper : <small>{helper}</small>) : null;
  const resolvedAriaLabel = ariaLabel || (typeof label === 'string' ? `${label}: ${value}` : String(value || ''));
  const content = <><strong>{value}</strong>{labelNode}{helperNode}</>;
  if (onClick) {
    return <button type="button" className="summary-card clickable-summary-card" onClick={onClick} aria-label={resolvedAriaLabel}>{content}</button>;
  }
  return <article className="summary-card">{content}</article>;
}

function AdminActionGroup({ title, children }) {
  return <section className="admin-action-group"><h3>{title}</h3><div className="admin-quick-actions grouped-actions">{children}</div></section>;
}

function AdminMiniList({ items, empty, render }) {
  if (!items.length) return <p className="small-note">{empty}</p>;
  return <ul className="admin-mini-list">{items.map((item) => <li key={item.id}>{render(item)}</li>)}</ul>;
}

function RequestCrmControls({ request, lang, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => ({
    lead_status: request.lead_status || 'new_lead',
    lead_priority: request.lead_priority || 'normal',
    next_follow_up_at: request.next_follow_up_at ? String(request.next_follow_up_at).slice(0, 10) : '',
    expected_value: request.expected_value ?? '',
    quoted_amount: request.quoted_amount ?? '',
    lost_reason: request.lost_reason || '',
    internal_notes: request.internal_notes || ''
  }));

  useEffect(() => {
    setForm({
      lead_status: request.lead_status || 'new_lead',
      lead_priority: request.lead_priority || 'normal',
      next_follow_up_at: request.next_follow_up_at ? String(request.next_follow_up_at).slice(0, 10) : '',
      expected_value: request.expected_value ?? '',
      quoted_amount: request.quoted_amount ?? '',
      lost_reason: request.lost_reason || '',
      internal_notes: request.internal_notes || ''
    });
  }, [request.id, request.lead_status, request.lead_priority, request.next_follow_up_at, request.expected_value, request.quoted_amount, request.lost_reason, request.internal_notes]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const payload = {
        lead_status: form.lead_status || null,
        lead_priority: form.lead_priority || null,
        next_follow_up_at: form.next_follow_up_at || null,
        expected_value: form.expected_value === '' ? null : parseMoneyAmount(form.expected_value),
        quoted_amount: form.quoted_amount === '' ? null : parseMoneyAmount(form.quoted_amount),
        lost_reason: form.lost_reason || null,
        internal_notes: form.internal_notes || null
      };
      await updateBookingRequest(request.id, { ...payload, expected_updated_at: request.updated_at });
      if (payload.lead_status !== request.lead_status) trackEvent('lead_status_changed', { request_id: request.id, from_status: request.lead_status || '', to_status: payload.lead_status || '' }, { dedupe: false });
      if (payload.next_follow_up_at !== request.next_follow_up_at) trackEvent('lead_follow_up_set', { request_id: request.id, next_follow_up_at: payload.next_follow_up_at || '' }, { dedupe: false });
      if (payload.expected_value !== request.expected_value || payload.quoted_amount !== request.quoted_amount) trackEvent('lead_value_updated', { request_id: request.id }, { dedupe: false });
      onUpdated?.(adminCopy(lang, 'CRM aggiornata.', 'CRM updated.'));
      setOpen(false);
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'CRM non aggiornata.', 'CRM not updated.'));
    } finally {
      setSaving(false);
    }
  }

  const dueLabel = request.next_follow_up_at
    ? formatDateForMessage(String(request.next_follow_up_at).slice(0, 10), lang)
    : adminCopy(lang, 'Nessun follow-up', 'No follow-up');

  return (
    <div className="request-crm-box">
      <button className="request-crm-toggle" type="button" onClick={() => setOpen((value) => !value)}>
        <span>{adminCopy(lang, 'CRM', 'CRM')}</span>
        <strong>{leadStatusLabel(request.lead_status || 'new_lead', lang)} · {leadPriorityLabel(request.lead_priority || 'normal', lang)}</strong>
        <small>{dueLabel}</small>
      </button>
      {open && (
        <div className="admin-form-grid request-crm-grid">
          <label className="admin-field"><span>{adminCopy(lang, 'Stato lead', 'Lead status')}</span><select value={form.lead_status} onChange={(event) => update('lead_status', event.target.value)}>{LEAD_STATUSES.map((status) => <option key={status} value={status}>{leadStatusLabel(status, lang)}</option>)}</select></label>
          <label className="admin-field"><span>{adminCopy(lang, 'Priorità', 'Priority')}</span><select value={form.lead_priority} onChange={(event) => update('lead_priority', event.target.value)}>{LEAD_PRIORITIES.map((priority) => <option key={priority} value={priority}>{leadPriorityLabel(priority, lang)}</option>)}</select></label>
          <label className="admin-field"><span>{adminCopy(lang, 'Prossimo follow-up', 'Next follow-up')}</span><input type="date" value={form.next_follow_up_at} onChange={(event) => update('next_follow_up_at', event.target.value)} /></label>
          <label className="admin-field"><span>{adminCopy(lang, 'Valore atteso', 'Expected value')}</span><input inputMode="decimal" value={form.expected_value} onChange={(event) => update('expected_value', event.target.value)} /></label>
          <label className="admin-field"><span>{adminCopy(lang, 'Importo preventivato', 'Quoted amount')}</span><input inputMode="decimal" value={form.quoted_amount} onChange={(event) => update('quoted_amount', event.target.value)} /></label>
          <label className="admin-field"><span>{adminCopy(lang, 'Motivo perso', 'Lost reason')}</span><input value={form.lost_reason} onChange={(event) => update('lost_reason', event.target.value)} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Note interne', 'Internal notes')}</span><textarea rows={3} value={form.internal_notes} onChange={(event) => update('internal_notes', event.target.value)} /></label>
          {error && <div className="admin-alert error full">{error}</div>}
          <div className="modal-actions full"><button className="button primary" type="button" onClick={save} disabled={saving}>{saving ? adminCopy(lang, 'Salvataggio...', 'Saving...') : adminCopy(lang, 'Salva CRM', 'Save CRM')}</button></div>
        </div>
      )}
    </div>
  );
}

function createPaymentIdempotencyKey(prefix = 'payment') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}:${crypto.randomUUID()}`;
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function BookingPaymentSummary({ request, lang }) {
  const agreed = requestMoneyValue(request);
  const currency = request.currency || request.finance_entries?.find((entry) => entry.currency)?.currency || 'EUR';
  const summary = paymentSummary(request.finance_entries || [], agreed, currency);
  const history = (request.finance_entries || []).filter((entry) => ['confirmed', 'reversed', 'reversal'].includes(String(entry.status || '').toLowerCase()));
  if (!(agreed > 0) && history.length === 0) return null;
  return (
    <section className="booking-payment-summary" aria-label={adminCopy(lang, 'Riepilogo pagamento', 'Payment summary')}>
      <div className="booking-payment-summary-grid">
        <span><small>{adminCopy(lang, 'Preventivo', 'Quoted')}</small><strong>{formatMoney(summary.agreed, summary.currency, lang)}</strong></span>
        <span><small>{adminCopy(lang, 'Incassato', 'Paid')}</small><strong>{formatMoney(summary.paid, summary.currency, lang)}</strong></span>
        <span><small>{adminCopy(lang, 'Saldo', 'Balance')}</small><strong>{formatMoney(summary.balance, summary.currency, lang)}</strong></span>
        <span><small>{adminCopy(lang, 'Stato pagamento', 'Payment status')}</small><strong>{summary.status}</strong></span>
      </div>
      {history.length > 0 && <details className="booking-payment-history"><summary>{adminCopy(lang, 'Pagamenti', 'Payments')} · {history.length}</summary>{history.map((entry) => <p className="small-note" key={entry.id}>{formatDateForMessage(entry.entry_date, lang) || '-'} · {entry.status === 'reversal' ? adminCopy(lang, 'Rimborso/storno', 'Refund/reversal') : adminCopy(lang, 'Pagamento', 'Payment')} · {formatMoney(entry.amount, entry.currency || summary.currency, lang)} · {entry.payment_method || '-'}</p>)}</details>}
    </section>
  );
}

function RequestIncomeConfirmAction({ request, lang, session, onUpdated }) {
  const panelRef = useRef(null);
  const inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [incomeState, setIncomeState] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => createPaymentIdempotencyKey(`booking:${request.id}`));
  const [form, setForm] = useState(() => ({
    entry_date: todayIso(),
    amount: requestMoneyValue(request) > 0 ? String(requestMoneyValue(request)) : '',
    currency: request.currency || request.finance_entries?.find((entry) => entry.currency)?.currency || 'EUR',
    payment_method: ''
  }));

  useBodyScrollLock(open);
  useDialogFocusTrap(open, panelRef, () => { if (!inFlight.current) closeModal(); });

  useEffect(() => {
    setForm({ entry_date: todayIso(), amount: requestMoneyValue(request) > 0 ? String(requestMoneyValue(request)) : '', currency: request.currency || request.finance_entries?.find((entry) => entry.currency)?.currency || 'EUR', payment_method: '' });
    setIdempotencyKey(createPaymentIdempotencyKey(`booking:${request.id}`));
    setIncomeState(null);
    setError('');
    setWarning('');
  }, [request.id, request.expected_value, request.quoted_amount]);

  async function loadIncomeState() {
    setLoading(true);
    setError('');
    try {
      const state = await getBookingRequestIncomeState(request.id);
      setIncomeState(state);
      const existingCurrency = state.entries.find((entry) => entry.currency)?.currency;
      if (existingCurrency) setForm((current) => ({ ...current, currency: existingCurrency }));
      const recorded = state.confirmed.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0);
      const remaining = Math.max(0, requestMoneyValue(request) - recorded);
      if (remaining > 0) setForm((current) => ({ ...current, amount: String(remaining) }));
      else if (state.pending.length === 1 && parseMoneyAmount(state.pending[0].amount) > 0) setForm((current) => ({ ...current, amount: String(parseMoneyAmount(state.pending[0].amount)) }));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Stato pagamento non disponibile.', 'Payment status unavailable.'));
    } finally {
      setLoading(false);
    }
  }

  function openModal() { setOpen(true); setWarning(''); window.setTimeout(loadIncomeState, 0); }
  function closeModal() { if (saving) return; setOpen(false); setError(''); setWarning(''); }

  async function recordPayment() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true); setError(''); setWarning('');
    try {
      const result = await confirmBookingRequestIncome({
        request,
        amount: form.amount,
        currency: form.currency,
        entryDate: form.entry_date,
        paymentMethod: form.payment_method,
        idempotencyKey,
        userId: session?.user?.id || null
      });
      if (result.commissionWarning) setWarning(adminCopy(lang, `Pagamento registrato. Commissione partner da verificare: ${result.commissionWarning}`, `Payment recorded. Partner commission needs review: ${result.commissionWarning}`));
      const state = await getBookingRequestIncomeState(request.id);
      setIncomeState(state);
      const recorded = state.confirmed.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0);
      const remaining = Math.max(0, requestMoneyValue(request) - recorded);
      setForm((current) => ({ ...current, amount: remaining > 0 ? String(remaining) : '', payment_method: '' }));
      setIdempotencyKey(createPaymentIdempotencyKey(`booking:${request.id}`));
      onUpdated?.(result.status === 'already_recorded'
        ? adminCopy(lang, 'Questo pagamento era già stato registrato.', 'This payment was already recorded.')
        : adminCopy(lang, 'Pagamento registrato e collegato alla prenotazione.', 'Payment recorded and linked to the booking.'));
    } catch (err) {
      const code = err?.code || '';
      const message = code === 'BOOKING_INCOME_MULTIPLE_PENDING'
        ? adminCopy(lang, 'Ci sono più entrate attese collegate. Riconciliale in Finanze prima di registrare il pagamento.', 'Multiple expected income entries are linked. Reconcile them in Finance before recording the payment.')
        : code === 'BOOKING_INCOME_PAYMENT_METHOD_REQUIRED' ? adminCopy(lang, 'Indica il metodo di pagamento.', 'Enter the payment method.')
          : code === 'BOOKING_INCOME_AMOUNT_REQUIRED' ? adminCopy(lang, 'Inserisci un importo positivo.', 'Enter a positive amount.')
            : err?.message || adminCopy(lang, 'Pagamento non registrato.', 'Payment was not recorded.');
      setError(message);
    } finally { inFlight.current = false; setSaving(false); }
  }

  if (!session || request.finance_access === false || !bookingRequestCanConfirmIncome(request)) return null;
  const confirmedEntries = incomeState?.confirmed || [];
  const pendingEntries = incomeState?.pending || [];
  const confirmedTotal = confirmedEntries.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0);
  const agreed = requestMoneyValue(request);
  const balance = Math.max(0, agreed - confirmedTotal);
  const status = confirmedTotal === 0 ? 'UNPAID' : agreed > 0 && confirmedTotal < agreed ? 'PART-PAID' : agreed > 0 && confirmedTotal > agreed ? 'OVERPAID' : 'PAID';
  const hasAmbiguousPending = pendingEntries.length > 1;

  return (
    <>
      <div className="request-actions request-income-actions">
        <button className="button primary" type="button" onClick={openModal}>{adminCopy(lang, 'Registra pagamento', 'Record payment')}</button>
      </div>
      {open && <div className="modal-backdrop" role="presentation">
        <section ref={panelRef} tabIndex={-1} className="admin-modal" role="dialog" aria-modal="true" aria-labelledby={`recordPaymentTitle-${request.id}`}>
          <div className="admin-modal-header"><div><h2 id={`recordPaymentTitle-${request.id}`}>{adminCopy(lang, 'Registra pagamento', 'Record payment')}</h2><p>{request.customer_name || adminCopy(lang, 'Cliente senza nome', 'Unnamed customer')} · {adminExperienceLabel(request.experience_id, lang)}</p></div><button type="button" className="icon-button" onClick={closeModal} aria-label={text(lang, 'close')}>×</button></div>
          {loading ? <p>{adminCopy(lang, 'Controllo movimenti collegati...', 'Checking linked finance entries...')}</p> : <>
            <div className="booking-payment-summary-grid modal-payment-summary"><span><small>{adminCopy(lang, 'Concordato', 'Agreed')}</small><strong>{formatMoney(agreed, form.currency, lang)}</strong></span><span><small>{adminCopy(lang, 'Già incassato', 'Already paid')}</small><strong>{formatMoney(confirmedTotal, form.currency, lang)}</strong></span><span><small>{adminCopy(lang, 'Saldo', 'Balance')}</small><strong>{formatMoney(balance, form.currency, lang)}</strong></span><span><small>{adminCopy(lang, 'Stato', 'Status')}</small><strong>{status}</strong></span></div>
            {confirmedEntries.length > 0 && <div className="payment-history-list"><strong>{adminCopy(lang, 'Pagamenti registrati', 'Recorded payments')}</strong>{confirmedEntries.map((entry) => <p className="small-note" key={entry.id}>{formatDateForMessage(entry.entry_date, lang) || '-'} · {formatMoney(entry.amount, entry.currency || form.currency, lang)} · {entry.payment_method || '-'}</p>)}</div>}
            {pendingEntries.length === 1 && <div className="admin-alert info compact-alert">{adminCopy(lang, 'L’entrata attesa verrà ridotta del pagamento registrato; l’eventuale saldo resterà atteso.', 'The expected entry will be reduced by the recorded payment; any remaining balance stays expected.')}</div>}
            {hasAmbiguousPending && <div className="admin-alert warning" role="alert">{adminCopy(lang, 'Più entrate attese sono collegate: riconciliale prima in Finanze.', 'Multiple expected entries are linked: reconcile them in Finance first.')}</div>}
            {!hasAmbiguousPending && <div className="admin-form-grid request-income-confirm-grid"><AdminInput label={adminCopy(lang, 'Data pagamento', 'Payment date')} type="date" value={form.entry_date} onChange={(value) => setForm((current) => ({ ...current, entry_date: value }))} /><AdminInput label={adminCopy(lang, 'Importo effettivo', 'Actual amount')} type="number" inputMode="decimal" value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} /><AdminInput label={adminCopy(lang, 'Valuta', 'Currency')} value={form.currency} onChange={(value) => setForm((current) => ({ ...current, currency: normalizeCurrency(value) }))} /><AdminInput label={adminCopy(lang, 'Metodo di pagamento', 'Payment method')} value={form.payment_method} placeholder={adminCopy(lang, 'Contanti, bonifico, carta...', 'Cash, bank transfer, card...')} onChange={(value) => setForm((current) => ({ ...current, payment_method: value }))} /></div>}
            {!hasAmbiguousPending && balance === 0 && <p className="small-note">{adminCopy(lang, 'Il saldo è già zero. Un ulteriore pagamento verrà registrato come sovrappagamento esplicito.', 'Balance is already zero. Any additional payment will be recorded as an explicit overpayment.')}</p>}
          </>}
          {warning && <div className="admin-alert warning" role="status">{warning}</div>}{error && <div className="admin-alert error" role="alert">{error}</div>}
          <div className="modal-actions">{!loading && !hasAmbiguousPending && <button className="button primary" type="button" onClick={recordPayment} disabled={saving}>{saving ? adminCopy(lang, 'Registrazione...', 'Recording...') : adminCopy(lang, 'Registra pagamento', 'Record payment')}</button>}<button className="button secondary" type="button" onClick={closeModal} disabled={saving}>{adminCopy(lang, 'Chiudi', 'Close')}</button></div>
        </section>
      </div>}
    </>
  );
}

function RequestsCrmDashboard({ requests, lang }) {
  const summary = useMemo(() => buildRequestsCrmSummary(requests, lang), [requests, lang]);
  return (
    <section className="admin-panel requests-crm-dashboard">
      <div className="admin-panel-header"><h2>{adminCopy(lang, 'CRM e valore prenotazioni', 'CRM and booking value')}</h2><small>{formatLocalDateTime(summary.generatedAt, lang, '')}</small></div>
      <div className="admin-summary-grid crm-summary-grid">
        <SummaryCard label={adminCopy(lang, 'Valore prenotazioni accettate', 'Accepted booking value')} value={formatMoney(summary.confirmedRevenue, 'EUR', lang)} />
        <SummaryCard label={adminCopy(lang, 'Pipeline attesa', 'Expected pipeline')} value={formatMoney(summary.expectedPipeline, 'EUR', lang)} />
        <SummaryCard label={adminCopy(lang, 'Valore medio', 'Average booking value')} value={formatMoney(summary.averageBookingValue, 'EUR', lang)} />
        <SummaryCard label={adminCopy(lang, 'Conversione lead', 'Lead conversion')} value={`${summary.leadToConfirmedRate.toFixed(1)}%`} />
        <SummaryCard label={adminCopy(lang, 'Follow-up oggi/scaduti', 'Due/overdue follow-ups')} value={`${summary.due}/${summary.overdue}`} />
        <SummaryCard label={adminCopy(lang, 'Alta priorità', 'High priority')} value={summary.highPriority} />
      </div>
      <div className="crm-breakdown-grid">
        <div><h3>{adminCopy(lang, 'Valore per fonte', 'Value by source')}</h3>{summary.sourceBreakdown.length ? <ul className="admin-mini-list">{summary.sourceBreakdown.map(([key, value]) => <li key={key}><strong>{key}</strong> · {formatMoney(value, 'EUR', lang)}</li>)}</ul> : <p className="small-note">{adminCopy(lang, 'Nessun dato confermato.', 'No confirmed data.')}</p>}</div>
        <div><h3>{adminCopy(lang, 'Valore per esperienza', 'Value by experience')}</h3>{summary.experienceBreakdown.length ? <ul className="admin-mini-list">{summary.experienceBreakdown.map(([key, value]) => <li key={key}><strong>{key}</strong> · {formatMoney(value, 'EUR', lang)}</li>)}</ul> : <p className="small-note">{adminCopy(lang, 'Nessun dato confermato.', 'No confirmed data.')}</p>}</div>
      </div>
    </section>
  );
}

function reviewStatusLabelForRecord(record, lang) {
  if (record?.review_received_at || record?.review_submitted) return adminCopy(lang, 'Recensione ricevuta', 'Review received');
  if (record?.review_requested_at) return adminCopy(lang, 'Recensione richiesta', 'Review requested');
  return adminCopy(lang, 'Recensione non richiesta', 'Review not requested');
}

function reviewCodeForRecord(record, type = 'request') {
  return type === 'booking_code' ? record?.code : (record?.review_code || record?.booking_code || '');
}

function buildReviewRequestMessage({ record, type, lang }) {
  const name = type === 'booking_code' ? record.customer_name : record.customer_name;
  const code = reviewCodeForRecord(record, type);
  const link = `/reviews?code=${encodeURIComponent(code)}`;
  return lang === 'it'
    ? `Ciao ${name || ''}, grazie per aver vissuto l’Etna con vulcanIQ.\n\nSe ti va, puoi lasciare una recensione usando questo link:\n${link}\n\nGrazie ancora,\nTeam vulcanIQ`
    : `Hi ${name || ''}, thank you for experiencing Mount Etna with vulcanIQ.\n\nIf you’d like, you can leave a review using this link:\n${link}\n\nThank you again,\nvulcanIQ team`;
}

function ReviewRequestActions({ record, type = 'request', lang, session, onUpdated }) {
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const code = reviewCodeForRecord(record, type);
  const link = code ? `/reviews?code=${encodeURIComponent(code)}` : '';
  const phone = normalizePhoneForWhatsApp(record.customer_phone);
  const whatsappMessage = buildReviewRequestMessage({ record, type, lang });
  const eligible = type === 'booking_code'
    ? record.status === 'redeemed' && record.completion_status === 'completed'
    : isRequestConfirmedRevenue(record) || record.lead_status === 'completed' || record.status === 'accepted';

  async function run(action) {
    if (!eligible || !code) return;
    setBusy(action);
    setError('');
    try {
      if (action === 'copy') {
        await copyText(link);
        if (type === 'booking_code') await markBookingCodeReviewLinkCopied(record.id, session.user.id);
        else await markBookingRequestReviewLinkCopied(record.id, session.user.id);
        trackEvent('review_link_copied', { record_type: type, record_id: record.id, language: lang, has_booking_code: Boolean(code), source_type: type }, { dedupe: false });
        setCopied('link');
      }
      if (action === 'requested') {
        if (type === 'booking_code') await markBookingCodeReviewRequested(record.id, 'manual', session.user.id);
        else await markBookingRequestReviewRequested(record.id, 'manual', session.user.id);
        trackEvent('review_requested_marked', { record_type: type, record_id: record.id, language: lang, has_booking_code: Boolean(code), source_type: type }, { dedupe: false });
      }
      if (action === 'received') {
        if (type === 'booking_code') await markBookingCodeReviewReceived(record.id, session.user.id);
        else await markBookingRequestReviewReceived(record.id, session.user.id);
        trackEvent('review_received_marked', { record_type: type, record_id: record.id, language: lang, has_booking_code: Boolean(code), source_type: type }, { dedupe: false });
      }
      onUpdated?.(adminCopy(lang, 'Workflow recensione aggiornato.', 'Review workflow updated.'));
      window.setTimeout(() => setCopied(''), 1400);
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Azione recensione non completata.', 'Review action failed.'));
    } finally {
      setBusy('');
    }
  }

  async function openWhatsapp() {
    if (!eligible || !code) return;
    setError('');
    try {
      if (type === 'booking_code') await markBookingCodeReviewRequested(record.id, 'whatsapp', session.user.id);
      else await markBookingRequestReviewRequested(record.id, 'whatsapp', session.user.id);
      trackEvent('review_request_whatsapp_click', { record_type: type, record_id: record.id, language: lang, has_booking_code: Boolean(code), source_type: type }, { dedupe: false });
      const target = phone ? `https://wa.me/${phone}?text=${encode(whatsappMessage)}` : `https://wa.me/?text=${encode(whatsappMessage)}`;
      window.open(target, '_blank', 'noopener,noreferrer');
      onUpdated?.(adminCopy(lang, 'Richiesta recensione segnata.', 'Review request marked.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'WhatsApp non aperto.', 'WhatsApp not opened.'));
    }
  }

  if (!eligible) return null;
  return (
    <div className="review-request-actions admin-inline-workflow">
      <p className="small-note"><strong>{reviewStatusLabelForRecord(record, lang)}</strong>{record.review_requested_at ? ` · ${formatLocalDateTime(record.review_requested_at, lang, '')}` : ''}</p>
      {!code && <p className="small-note warning-text">{adminCopy(lang, 'Nessun codice recensione disponibile.', 'No review code available.')}</p>}
      <div className="request-actions-row">
        <button className="button secondary" type="button" disabled={!code || Boolean(busy)} onClick={() => run('copy')}>{adminCopy(lang, 'Copia link recensione', 'Copy review link')} {copied === 'link' ? '· ✓' : ''}</button>
        <button className="button secondary" type="button" disabled={!code || Boolean(busy)} onClick={openWhatsapp}>{adminCopy(lang, 'Apri richiesta WhatsApp', 'Open WhatsApp request')}</button>
        <button className="button secondary" type="button" disabled={!code || Boolean(busy)} onClick={() => run('requested')}>{adminCopy(lang, 'Segna recensione richiesta', 'Mark review requested')}</button>
        <button className="button secondary" type="button" disabled={!code || Boolean(busy)} onClick={() => run('received')}>{adminCopy(lang, 'Segna recensione ricevuta', 'Mark review received')}</button>
      </div>
      {error && <p className="form-status error">{error}</p>}
    </div>
  );
}

function ReferralActions({ record, type = 'request', lang, session, onUpdated }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState(record?.referral_code || '');
  const eligible = type === 'booking_code'
    ? record.status === 'redeemed' && record.completion_status === 'completed'
    : isRequestConfirmedRevenue(record) || ['completed', 'review_requested', 'review_received'].includes(record.lead_status);

  async function createOrCopy() {
    if (!eligible) return;
    setBusy(true);
    setError('');
    try {
      const created = await createCustomerReferralCode({
        customer_name: record.customer_name,
        customer_email: record.customer_email,
        customer_phone: record.customer_phone,
        source_booking_request_id: type === 'request' ? record.id : null,
        source_booking_code_id: type === 'booking_code' ? record.id : null,
        source_type: type
      }, session.user.id);
      setCode(created.code);
      const link = referralLink(created.code, requestLang(record, lang));
      await copyText(link);
      trackEvent('referral_code_created', { referral_code: created.code, source_type: type, source_id: record.id, language: lang }, { dedupe: false });
      trackEvent('referral_link_copied', { referral_code: created.code, source_type: type, source_id: record.id, language: lang }, { dedupe: false });
      onUpdated?.(adminCopy(lang, `Codice referral copiato: ${created.code}`, `Referral code copied: ${created.code}`));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Codice referral non creato.', 'Referral code not created.'));
    } finally {
      setBusy(false);
    }
  }

  if (!eligible) return null;
  return (
    <div className="referral-actions admin-inline-workflow">
      <p className="small-note"><strong>{adminCopy(lang, 'Referral cliente', 'Customer referral')}</strong>{code ? ` · ${code}` : ''}</p>
      <div className="request-actions-row">
        <button className="button secondary" type="button" disabled={busy} onClick={createOrCopy}>{code ? adminCopy(lang, 'Copia link referral', 'Copy referral link') : adminCopy(lang, 'Genera referral', 'Generate referral')}</button>
      </div>
      {error && <p className="form-status error">{error}</p>}
    </div>
  );
}

function ReferralCodesPanel({ lang, session }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try { setItems(await listCustomerReferralCodes({ limit: 100 })); }
    catch (err) { setError(err?.message || adminCopy(lang, 'Referral non caricati.', 'Could not load referrals.')); }
    finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, []);

  async function copyReferral(item) {
    const link = referralLink(item.code, lang);
    await copyText(link);
    trackEvent('referral_link_copied', { referral_code: item.code, source_type: item.source_type || 'unknown', source_id: item.source_booking_request_id || item.source_booking_code_id || '', language: lang }, { dedupe: false });
    setFeedback(adminCopy(lang, `Link referral copiato: ${item.code}`, `Referral link copied: ${item.code}`));
  }

  async function disableReferral(item) {
    if (!window.confirm(adminCopy(lang, `Disattivare ${item.code}?`, `Disable ${item.code}?`))) return;
    try {
      await disableCustomerReferralCode(item.id, session.user.id);
      trackEvent('referral_code_disabled', { referral_code: item.code, source_type: item.source_type || 'unknown', source_id: item.source_booking_request_id || item.source_booking_code_id || '', language: lang }, { dedupe: false });
      await refresh();
      setFeedback(adminCopy(lang, 'Referral disattivato.', 'Referral disabled.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Referral non disattivato.', 'Referral not disabled.'));
    }
  }

  return (
    <section className="admin-panel referral-codes-panel">
      <div className="admin-panel-header">
        <h2>{adminCopy(lang, 'Referral clienti', 'Customer referrals')} · {items.length}</h2>
        <button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
      </div>
      {feedback && <div className="admin-alert success compact-alert">{feedback}</div>}
      {error && <div className="admin-alert error compact-alert">{error}</div>}
      {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : items.length === 0 ? <p className="small-note">{adminCopy(lang, 'Nessun referral generato.', 'No referrals generated.')}</p> : (
        <div className="referral-code-list">
          {items.map((item) => (
            <article className="referral-code-card" key={item.id}>
              <div>
                <strong>{item.code}</strong>
                <p className="small-note">{item.customer_name || '-'} · {item.source_type || '-'} · {adminCopy(lang, 'Usi', 'Uses')} {item.used_count || 0}{item.last_used_at ? ` · ${formatLocalDateTime(item.last_used_at, lang, '')}` : ''}</p>
              </div>
              <span className={`status-pill ${item.active ? 'accepted' : 'cancelled'}`}>{item.active ? adminCopy(lang, 'Attiva', 'Active') : adminCopy(lang, 'Inattiva', 'Inactive')}</span>
              <div className="request-actions-row">
                <button className="button secondary" type="button" onClick={() => copyReferral(item)}>{adminCopy(lang, 'Copia link', 'Copy link')}</button>
                {item.active && <button className="button secondary danger" type="button" onClick={() => disableReferral(item)}>{adminCopy(lang, 'Disattiva', 'Disable')}</button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

const GIFT_CARD_STATUSES = ['new', 'contacted', 'quoted', 'paid', 'issued', 'cancelled'];

function giftCardStatusLabel(status, lang) {
  const labels = {
    new: { it: 'Nuova richiesta', en: 'New request' },
    contacted: { it: 'Contattato', en: 'Contacted' },
    quoted: { it: 'Preventivo inviato', en: 'Quote sent' },
    paid: { it: 'Pagato', en: 'Paid' },
    issued: { it: 'Emesso', en: 'Issued' },
    cancelled: { it: 'Annullato', en: 'Cancelled' }
  };
  return labels[status]?.[lang] || status || '-';
}

function buildGiftCardAdminReply(request, lang) {
  const budget = request.budget ? formatMoney(request.budget, request.currency || 'EUR', lang) : (lang === 'it' ? 'da definire' : 'to define');
  return lang === 'it'
    ? `Ciao ${request.buyer_name || ''},\n\ngrazie per la richiesta Gift Card vulcanIQ.\n\nGift Card per: ${request.recipient_name || '-'}\nEsperienza/interesse: ${request.experience_type || '-'}\nBudget indicativo: ${budget}\n${request.booking_code ? `Codice destinatario: ${request.booking_code}\n` : ''}\nTi confermiamo disponibilità e proposta il prima possibile.\n\nTeam vulcanIQ`
    : `Hi ${request.buyer_name || ''},\n\nthank you for your vulcanIQ Gift Card request.\n\nGift Card for: ${request.recipient_name || '-'}\nExperience/interest: ${request.experience_type || '-'}\nIndicative budget: ${budget}\n${request.booking_code ? `Recipient code: ${request.booking_code}\n` : ''}\nWe will confirm availability and proposal as soon as possible.\n\nvulcanIQ team`;
}

function GiftCardPaymentDialog({ item, lang, onClose, onSaved }) {
  const panelRef = useRef(null);
  const inFlight = useRef(false);
  const [form, setForm] = useState({
    payment_amount: item.budget ? String(item.budget) : '',
    payment_date: todayIso(),
    payment_method: '',
    currency: item.currency || 'EUR'
  });
  const [idempotencyKey] = useState(() => createPaymentIdempotencyKey(`gift-card:${item.id}`));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useBodyScrollLock(true);
  useDialogFocusTrap(true, panelRef, () => { if (!inFlight.current) onClose(); });

  async function save() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true); setError('');
    try {
      if (!(parseMoneyAmount(form.payment_amount) > 0) || !form.payment_date || !String(form.payment_method || '').trim()) {
        throw new Error(adminCopy(lang, 'Importo, data e metodo di pagamento sono obbligatori.', 'Payment amount, date and method are required.'));
      }
      const result = await onSaved?.({
        status: 'paid',
        currency: normalizeCurrency(form.currency),
        payment_amount: parseMoneyAmount(form.payment_amount),
        payment_date: form.payment_date,
        payment_method: form.payment_method,
        payment_idempotency_key: idempotencyKey
      });
      if (result) onClose();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Pagamento Gift Card non registrato.', 'Gift Card payment was not recorded.'));
    } finally { inFlight.current = false; setSaving(false); }
  }

  return <div className="modal-backdrop" role="presentation"><section ref={panelRef} tabIndex={-1} className="admin-modal" role="dialog" aria-modal="true" aria-labelledby={`giftCardPayment-${item.id}`}>
    <div className="admin-modal-header"><div><h2 id={`giftCardPayment-${item.id}`}>{adminCopy(lang, 'Registra pagamento Gift Card', 'Record Gift Card payment')}</h2><p>{item.buyer_name || '-'} · {item.recipient_name || '-'}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label={text(lang, 'close')}>×</button></div>
    <div className="booking-payment-summary-grid modal-payment-summary"><span><small>{adminCopy(lang, 'Valore concordato', 'Agreed value')}</small><strong>{formatMoney(item.budget || 0, form.currency, lang)}</strong></span><span><small>{adminCopy(lang, 'Stato', 'Status')}</small><strong>{giftCardStatusLabel(item.status, lang)}</strong></span></div>
    <div className="admin-form-grid request-income-confirm-grid"><AdminInput label={adminCopy(lang, 'Importo effettivo', 'Actual amount')} type="number" inputMode="decimal" value={form.payment_amount} onChange={(value) => setForm((current) => ({ ...current, payment_amount: value }))} /><AdminInput label={adminCopy(lang, 'Data pagamento', 'Payment date')} type="date" value={form.payment_date} onChange={(value) => setForm((current) => ({ ...current, payment_date: value }))} /><AdminInput label={adminCopy(lang, 'Valuta', 'Currency')} value={form.currency} onChange={(value) => setForm((current) => ({ ...current, currency: normalizeCurrency(value) }))} /><AdminInput label={adminCopy(lang, 'Metodo di pagamento', 'Payment method')} value={form.payment_method} placeholder={adminCopy(lang, 'Contanti, bonifico, carta...', 'Cash, bank transfer, card...')} onChange={(value) => setForm((current) => ({ ...current, payment_method: value }))} /></div>
    <p className="small-note">{adminCopy(lang, 'Segnare Pagato registra denaro reale una sola volta. Emesso genera/consegna il voucher e non crea un’altra entrata.', 'Marking Paid records actual money once. Issued generates/delivers the voucher and does not create another income entry.')}</p>
    {error && <div className="admin-alert error" role="alert">{error}</div>}
    <div className="modal-actions"><button className="button primary" type="button" onClick={save} disabled={saving}>{saving ? adminCopy(lang, 'Registrazione...', 'Recording...') : adminCopy(lang, 'Registra pagamento', 'Record payment')}</button><button className="button secondary" type="button" onClick={onClose} disabled={saving}>{adminCopy(lang, 'Chiudi', 'Close')}</button></div>
  </section></div>;
}

function useAdminGiftCards(filters = {}) {
  const { data, ...state } = useLatestQuery(() => listGiftCardRequests(filters), filters);
  return { items: data, ...state };
}

function NotificationStatusControl({ record, table, lang, onUpdated }) {
  const [state, setState] = useState({ loading: false, error: '' });
  const status = record.notification_email_status || (record.notification_email_sent_at ? 'sent' : 'not_sent');
  const canRetry = ['failed', 'not_sent'].includes(status);

  async function retry() {
    setState({ loading: true, error: '' });
    try {
      const result = await retryRequestNotification(table, record.id);
      setState({ loading: false, error: '' });
      const message = result?.sent > 0
        ? adminCopy(lang, 'Notifica email inviata.', 'Email notification sent.')
        : adminCopy(lang, 'Nessuna notifica da reinviare.', 'No notification required a resend.');
      await onUpdated?.(message);
    } catch (error) {
      setState({ loading: false, error: error?.message || adminCopy(lang, 'Riprova notifica non riuscito.', 'Notification retry failed.') });
    }
  }

  return (
    <div className={`notification-status-control notification-${status}`}>
      <span><strong>{adminCopy(lang, 'Notifica email', 'Email notification')}:</strong> {status}</span>
      {record.notification_email_sent_at && <small>{formatLocalDateTime(record.notification_email_sent_at, lang, '')}</small>}
      {record.notification_email_error && <small>{record.notification_email_error}</small>}
      {canRetry && <button className="button secondary" type="button" onClick={retry} disabled={state.loading}>{state.loading ? adminCopy(lang, 'Invio...', 'Sending...') : adminCopy(lang, 'Riprova email', 'Retry email')}</button>}
      {state.error && <small className="admin-warning-critical">{state.error}</small>}
    </div>
  );
}

function GiftCardsAdminPage({ lang, session, adminContent = {} }) {
  const [filters, setFilters] = useState({ status: 'all', search: '', limit: 250 });
  const { items, loading, error, refresh } = useAdminGiftCards(filters);
  const [feedback, setFeedback] = useState('');
  const [actionError, setActionError] = useState('');
  const [paymentTarget, setPaymentTarget] = useState(null);

  async function updateItem(item, patch, message = '') {
    setActionError('');
    setFeedback('');
    try {
      const previousStatus = item.status;
      const updated = await updateGiftCardRequest(item.id, { ...patch, expected_updated_at: item.updated_at }, session.user.id);
      if (patch.status && patch.status !== previousStatus) {
        trackEvent('gift_card_status_changed', { request_id: item.id, previous_status: previousStatus, next_status: patch.status, language: lang }, { dedupe: false });
        if (patch.status === 'paid') trackEvent('gift_card_paid', { request_id: item.id, previous_status: previousStatus, next_status: patch.status, language: lang }, { dedupe: false });
        if (patch.status === 'issued') trackEvent('gift_card_issued', { request_id: item.id, previous_status: previousStatus, next_status: patch.status, language: lang }, { dedupe: false });
        if (patch.status === 'cancelled') trackEvent('gift_card_cancelled', { request_id: item.id, previous_status: previousStatus, next_status: patch.status, language: lang }, { dedupe: false });
        if (['paid', 'issued'].includes(patch.status) && updated?.booking_code) {
          trackEvent('gift_card_booking_code_created', { request_id: item.id, booking_code_id: updated.booking_code_id || '', language: lang }, { dedupe: false });
          message = message || adminCopy(lang, `Gift Card aggiornata. Codice destinatario: ${updated.booking_code}`, `Gift Card updated. Recipient code: ${updated.booking_code}`);
        }
      }
      await refresh();
      setFeedback(message || adminCopy(lang, 'Gift Card aggiornata.', 'Gift Card updated.'));
      return updated;
    } catch (err) {
      setActionError(err?.message || adminCopy(lang, 'Gift Card non aggiornata.', 'Gift Card not updated.'));
      return null;
    }
  }

  async function copyReply(item, channel) {
    const replyLang = item.buyer_preferred_language || lang;
    const body = buildGiftCardAdminReply(item, replyLang);
    await copyText(body);
    trackEvent(channel === 'email' ? 'gift_card_email_reply_copied' : 'gift_card_whatsapp_reply_copied', { request_id: item.id, language: replyLang }, { dedupe: false });
    setFeedback(channel === 'email' ? adminCopy(lang, 'Risposta email copiata.', 'Email reply copied.') : adminCopy(lang, 'Risposta WhatsApp copiata.', 'WhatsApp reply copied.'));
  }

  return (
    <section className="admin-page gift-cards-admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">Revenue OS</span>
          <AdminEditableText as="h1" itemKey="admin.giftCards.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Richieste Gift Card', 'Gift Card requests')} />
          <AdminEditableText as="p" itemKey="admin.giftCards.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Gestisci richieste, stato, note interne e revenue Gift Card separata dalle escursioni.', 'Manage requests, status, internal notes, and Gift Card revenue separately from excursions.')} />
        </div>
      </div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {(error || actionError) && <div className="admin-alert error" role="alert">{error || actionError}</div>}
      <div className="admin-filter-bar">
        <input aria-label="Search" placeholder={adminCopy(lang, 'Cerca Gift Card', 'Search Gift Cards')} value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        <select aria-label="Status" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="all">{adminCopy(lang, 'Tutti gli stati', 'All statuses')}</option>{GIFT_CARD_STATUSES.map((status) => <option key={status} value={status}>{giftCardStatusLabel(status, lang)}</option>)}</select>
        <button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
      </div>
      <section className="admin-panel">
        <div className="admin-panel-header"><h2>{adminCopy(lang, 'Richieste Gift Card', 'Gift Card requests')} · {items.length}</h2></div>
        {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : items.length === 0 ? <p>{adminCopy(lang, 'Nessuna richiesta Gift Card.', 'No Gift Card requests.')}</p> : (
          <div className="request-card-list gift-card-admin-list">
            {items.map((item) => (
              <article className="request-card gift-card-admin-card" key={item.id}>
                <div className="request-card-head"><div><span className="gift-card-identity-label">{adminCopy(lang, 'Acquirente', 'Buyer / Purchaser')}</span><h3>{item.buyer_name || adminCopy(lang, 'Acquirente senza nome', 'Unnamed buyer')}</h3><p>{item.buyer_phone || '—'} · {item.buyer_email || '—'}</p></div><span className={`status-pill ${item.status}`}>{giftCardStatusLabel(item.status, lang)}</span></div>
                <dl className="request-details-grid">
                  <div><dt>{adminCopy(lang, 'Destinatario indicato', 'Intended recipient')}</dt><dd>{item.recipient_name || '-'}</dd></div>
                  <div><dt>{adminCopy(lang, 'Esperienza', 'Experience')}</dt><dd>{item.experience_type || '-'}</dd></div>
                  <div><dt>{adminCopy(lang, 'Budget', 'Budget')}</dt><dd>{item.budget ? formatMoney(item.budget, item.currency, lang) : '-'}</dd></div>
                  <div><dt>{adminCopy(lang, 'Consegna preferita', 'Preferred delivery')}</dt><dd>{formatDateForMessage(item.preferred_delivery_date, lang) || '-'}</dd></div>
                  <div><dt>{adminCopy(lang, 'Lingua', 'Language')}</dt><dd>{item.buyer_preferred_language || '-'}</dd></div>
                  <div><dt>{adminCopy(lang, 'Finance', 'Finance')}</dt><dd>{item.finance_entry_id ? adminCopy(lang, 'Collegata', 'Linked') : adminCopy(lang, 'Non collegata', 'Not linked')}</dd></div>
                  <div><dt>{adminCopy(lang, 'Codice destinatario', 'Recipient code')}</dt><dd>{item.booking_code || '-'}</dd></div>
                </dl>
                {(item.recipient_claimed_at || item.claimed_recipient_name || item.recipient_email || item.recipient_phone) && (
                  <section className="gift-card-claim-details" aria-label={adminCopy(lang, 'Dettagli destinatario che ha riscattato la Gift Card', 'Claimed recipient details')}>
                    <h4>{adminCopy(lang, 'Destinatario / richiedente effettivo', 'Recipient / Claimant')}</h4>
                    <dl className="request-details-grid">
                      <div><dt>{adminCopy(lang, 'Nome', 'Name')}</dt><dd>{item.claimed_recipient_name || '-'}</dd></div>
                      <div><dt>Email</dt><dd>{item.recipient_email || '-'}</dd></div>
                      <div><dt>{adminCopy(lang, 'Telefono', 'Phone')}</dt><dd>{item.recipient_phone || '-'}</dd></div>
                      <div><dt>{adminCopy(lang, 'Lingua destinatario', 'Recipient language')}</dt><dd>{item.recipient_preferred_language || '-'}</dd></div>
                      <div><dt>{adminCopy(lang, 'Riscattata il', 'Claimed at')}</dt><dd>{formatLocalDateTime(item.recipient_claimed_at, lang, '-') || '-'}</dd></div>
                    </dl>
                  </section>
                )}
                <NotificationStatusControl record={item} table="gift_card_requests" lang={lang} onUpdated={async (message) => { await refresh(); setFeedback(message); }} />
                {item.message && <p className="request-message">{item.message}</p>}
                <label className="admin-field full"><span>{adminCopy(lang, 'Nota interna', 'Internal note')}</span><textarea rows={3} defaultValue={item.admin_note || ''} onBlur={(event) => { if (event.target.value !== (item.admin_note || '')) updateItem(item, { admin_note: event.target.value }, adminCopy(lang, 'Nota interna aggiornata.', 'Internal note updated.')); }} /></label>
                <div className="request-actions-row">
                  <select value={item.status} onChange={(event) => { const nextStatus = event.target.value; if (nextStatus === 'paid' && item.status !== 'paid') setPaymentTarget(item); else updateItem(item, { status: nextStatus }); }}>{GIFT_CARD_STATUSES.map((status) => <option key={status} value={status}>{giftCardStatusLabel(status, lang)}</option>)}</select>
                  <button className="button secondary" type="button" onClick={() => copyReply(item, 'whatsapp')}>{adminCopy(lang, 'Copia risposta WhatsApp', 'Copy WhatsApp reply')}</button>
                  <button className="button secondary" type="button" onClick={() => copyReply(item, 'email')}>{adminCopy(lang, 'Copia risposta email', 'Copy email reply')}</button>
                  {item.status !== 'paid' && <button className="button secondary" type="button" onClick={() => setPaymentTarget(item)}>{adminCopy(lang, 'Registra pagamento', 'Record payment')}</button>}
                  <button className="button secondary" type="button" onClick={() => updateItem(item, { status: 'issued' })}>{adminCopy(lang, 'Segna come emesso', 'Mark as issued')}</button>
                  <button className="button secondary danger" type="button" onClick={() => updateItem(item, { status: 'cancelled' })}>{adminCopy(lang, 'Annulla richiesta', 'Cancel request')}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {paymentTarget && <GiftCardPaymentDialog item={paymentTarget} lang={lang} onClose={() => setPaymentTarget(null)} onSaved={(patch) => updateItem(paymentTarget, patch, adminCopy(lang, 'Pagamento Gift Card registrato.', 'Gift Card payment recorded.'))} />}
    </section>
  );
}

function PartnerSourceControl({ request, lang, session, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [partners, setPartners] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [partnerId, setPartnerId] = useState(request.partner_id || '');
  const [grossAmount, setGrossAmount] = useState(String(partnerCommissionGrossAmountForRequest(request) || ''));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setPartnerId(request.partner_id || '');
    setGrossAmount(String(partnerCommissionGrossAmountForRequest(request) || ''));
  }, [request.id, request.partner_id, request.expected_value, request.quoted_amount]);

  async function refresh() {
    if (!open || !session) return;
    setLoading(true);
    setError('');
    try {
      const [partnerRows, commissionRows] = await Promise.all([
        listPartnerships({ activeOnly: true }),
        listPartnerCommissions({ bookingRequestId: request.id, limit: 20 }).catch(() => [])
      ]);
      setPartners(partnerRows || []);
      setCommissions(commissionRows || []);
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Partner non caricati.', 'Partners not loaded.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [open, request.id]);

  const selectedPartner = partners.find((item) => item.id === partnerId) || null;
  const preview = selectedPartner?.commission_enabled ? calculatePartnerCommission({
    grossAmount,
    commissionType: selectedPartner.commission_type,
    commissionValue: selectedPartner.commission_value,
    currency: selectedPartner.commission_currency || 'EUR'
  }) : null;
  const eligible = selectedPartner ? partnerCommissionEligibleForRequest(request, selectedPartner) : false;
  const latestCommission = commissions[0] || null;

  async function save() {
    setSaving(true);
    setError('');
    try {
      const updatedRequest = await assignPartnerToBookingRequest(request.id, partnerId || null, session.user.id);
      trackEvent('partner_source_assigned', { partner_id: partnerId || '', source_type: 'booking_request', source_section: 'admin_requests', admin_action: 'assign_partner' }, { dedupe: false });
      let commissionResult = null;
      if (partnerId && selectedPartner?.commission_enabled) {
        commissionResult = await upsertPartnerCommissionForSource({
          sourceType: 'booking_request',
          source: { ...request, ...updatedRequest, partner_id: partnerId },
          partnerId,
          grossAmount,
          userId: session.user.id,
          statusNotes: notes
        });
        if (commissionResult?.created) trackEvent('partner_commission_created', { partner_id: partnerId, source_type: 'booking_request', commission_status: 'pending', currency: preview?.currency || 'EUR', has_commission_amount: Boolean(preview?.commissionAmount), commission_type: selectedPartner.commission_type, source_section: 'admin_requests', admin_action: 'upsert_commission' }, { dedupe: false });
      }
      await refresh();
      const skipped = commissionResult?.skipped ? ` · ${commissionResult.reason}` : '';
      onUpdated?.(adminCopy(lang, `Fonte partner salvata${skipped}.`, `Partner source saved${skipped}.`));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Fonte partner non salvata.', 'Partner source not saved.'));
    } finally {
      setSaving(false);
    }
  }

  if (!session) return null;

  return (
    <div className="partner-source-box admin-inline-workflow">
      <button className="request-crm-toggle" type="button" onClick={() => setOpen((value) => !value)}>
        <span>{adminCopy(lang, 'Fonte partner', 'Partner source')}</span>
        <strong>{request.partner_id ? (partners.find((item) => item.id === request.partner_id)?.name || adminCopy(lang, 'Partner assegnato', 'Partner assigned')) : adminCopy(lang, 'Nessun partner', 'No partner')}</strong>
        <small>{latestCommission ? `${partnerCommissionStatusLabel(latestCommission.status, lang)} · ${formatMoney(latestCommission.commission_amount, latestCommission.currency, lang)}` : adminCopy(lang, 'Commissioni interne non pubbliche', 'Internal commissions only')}</small>
      </button>
      {open && (
        <div className="admin-form-grid request-crm-grid partner-source-grid">
          {loading ? <p className="small-note full">{adminCopy(lang, 'Caricamento partner...', 'Loading partners...')}</p> : null}
          <label className="admin-field"><span>{adminCopy(lang, 'Partner', 'Partner')}</span><select value={partnerId} onChange={(event) => setPartnerId(event.target.value)}><option value="">{adminCopy(lang, 'Nessun partner', 'No partner')}</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></label>
          <label className="admin-field"><span>{adminCopy(lang, 'Importo lordo', 'Gross amount')}</span><input inputMode="decimal" value={grossAmount} onChange={(event) => setGrossAmount(event.target.value)} placeholder="125.00" /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Note commissione', 'Commission notes')}</span><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          {selectedPartner && <div className="admin-alert compact-alert full">
            <strong>{selectedPartner.name}</strong><br />
            {adminCopy(lang, 'Regola', 'Rule')}: {partnerCommissionRuleLabel(selectedPartner, lang)} · {partnerCommissionAppliesToLabel(selectedPartner.commission_applies_to, lang)}<br />
            {preview && <span>{adminCopy(lang, 'Commissione stimata', 'Estimated commission')}: {formatMoney(preview.commissionAmount, preview.currency, lang)} — {selectedPartner.commission_type === 'percentage' ? `${preview.commissionValue}% ${adminCopy(lang, 'su', 'of')} ${formatMoney(preview.grossAmount, preview.currency, lang)}` : partnerCommissionTypeLabel(selectedPartner.commission_type, lang)}</span>}
            {!eligible && <p className="small-note">{adminCopy(lang, 'La commissione verrà creata solo quando la richiesta raggiunge lo stato configurato e l’importo è noto.', 'The commission is created only when the request reaches the configured state and the amount is known.')}</p>}
          </div>}
          {commissions.length > 0 && <div className="full partner-source-commission-list"><strong>{adminCopy(lang, 'Commissioni esistenti', 'Existing commissions')}</strong>{commissions.map((item) => <p className="small-note" key={item.id}>{partnerCommissionStatusLabel(item.status, lang)} · {formatMoney(item.commission_amount, item.currency, lang)} · {item.created_at ? formatLocalDateTime(item.created_at, lang, '') : ''}</p>)}</div>}
          {error && <div className="admin-alert error full">{error}</div>}
          <div className="modal-actions full"><button className="button primary" type="button" onClick={save} disabled={saving || loading}>{saving ? adminCopy(lang, 'Salvataggio...', 'Saving...') : adminCopy(lang, 'Salva fonte partner', 'Save partner source')}</button></div>
        </div>
      )}
    </div>
  );
}

function openBookingCodeFromRequest(request, navigate) {
  const code = String(request?.booking_code || '').trim();
  if (!code || typeof navigate !== 'function') return;
  try {
    window.sessionStorage.setItem('vulcaniq.admin.bookingCodeSearch', code);
  } catch {
    // Navigation remains useful even when storage is unavailable.
  }
  navigate('/admin/booking-codes');
}

function RequestCard({ request, lang, session = null, navigate = null, onApprove, onDecline, onRemove, onUpdated, compact = false }) {
  return (
    <article className={`request-card ${compact ? 'compact' : ''}`}>
      <div className="request-card-head">
        <div>
          <h3>{request.customer_name || adminCopy(lang, 'Cliente senza nome', 'Unnamed customer')}</h3>
          <p>{request.customer_phone || '—'} · {request.customer_email || '—'}</p>
        </div>
        <span className={`status-pill ${request.status}`}>{requestStatusLabels[request.status]?.[lang] || request.status}</span>
      </div>
      <dl className="request-details-grid">
        <div><dt>{adminCopy(lang, 'Tipo', 'Type')}</dt><dd>{request.request_type === 'fixed' ? adminCopy(lang, 'Escursione fissa', 'Fixed excursion') : adminCopy(lang, 'Escursione privata', 'Private excursion')}</dd></div>
        <div><dt>{adminCopy(lang, 'Fonte', 'Source')}</dt><dd>{request.source || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Fonte conoscenza', 'Discovery source')}</dt><dd>{heardAboutUsDisplay(request.heard_about_us, request.heard_about_us_detail, lang, { fallback: adminCopy(lang, 'Non disponibile', 'Not available') })}</dd></div>
        <div><dt>{adminCopy(lang, 'Contatto', 'Contact')}</dt><dd>{request.preferred_contact || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Esperienza', 'Experience')}</dt><dd>{adminExperienceLabel(request.experience_id, lang)}</dd></div>
        <div><dt>{adminCopy(lang, 'Data richiesta', 'Requested date')}</dt><dd>{formatDateForMessage(request.requested_date, lang) || '-'}</dd></div>
        <div className="request-submitted-meta"><dt>{adminCopy(lang, 'Inviata il', 'Submitted')}</dt><dd>{formatLocalDateTime(request.created_at || request.submitted_at || request.inserted_at || request.createdAt, lang, adminCopy(lang, 'Non disponibile', 'Not available'))}</dd></div>
        <div><dt>{adminCopy(lang, 'Alternativa', 'Alternative')}</dt><dd>{formatDateForMessage(request.alternative_date, lang) || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Lingua', 'Language')}</dt><dd>{request.language || 'it'}</dd></div>
        <div><dt>{adminCopy(lang, 'Gruppo', 'Party')}</dt><dd>{[request.adults ? `${request.adults} adulti/adults` : '', request.children ? `${request.children} bambini/children` : ''].filter(Boolean).join(' · ') || request.party_type || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Totale', 'Total')}</dt><dd>{Number(request.adults || 0) + Number(request.children || 0) || '-'}</dd></div>
        {request.booking_code && <div><dt>{adminCopy(lang, 'Codice prenotazione', 'Booking code')}</dt><dd>{request.booking_code}</dd></div>}
        <div><dt>{adminCopy(lang, 'Privata', 'Private')}</dt><dd>{request.private_experience === true ? adminCopy(lang, 'Sì', 'Yes') : request.private_experience === false ? adminCopy(lang, 'No', 'No') : '-'}</dd></div>
        {request.fixed_excursion_id && <div><dt>{adminCopy(lang, 'Escursione fissa', 'Fixed excursion')}</dt><dd>{request.fixed_excursion_id}</dd></div>}
      </dl>
      <BookingPaymentSummary request={request} lang={lang} />
      <NotificationStatusControl record={request} table="booking_requests" lang={lang} onUpdated={onUpdated} />
      {request.children_under_3 && <div className="admin-alert warning compact-alert">{adminCopy(lang, 'Attenzione: bambini sotto i 3 anni. Percorso da valutare con particolare cura.', 'Warning: children under 3. Route must be assessed carefully.')}</div>}
      {request.message && <p className="request-message">{request.message}</p>}
      {request.admin_note && <p className="small-note"><strong>Note:</strong> {request.admin_note}</p>}
      {request.status !== 'pending' && (
        <p className="small-note decision-note"><strong>{adminCopy(lang, 'Decisione', 'Decision')}:</strong> {request.decision_note || '-'} · {request.decided_at ? formatDateForMessage(String(request.decided_at).slice(0, 10), lang) : '-'}{request.decided_by ? ` · ${request.decided_by}` : ''}</p>
      )}
      <PartnerSourceControl request={request} lang={lang} session={session} onUpdated={onUpdated} />
      <RequestCrmControls request={request} lang={lang} onUpdated={onUpdated} />
      <RequestIncomeConfirmAction request={request} lang={lang} session={session} onUpdated={onUpdated} />
      {session && request.source === 'booking_code' && request.booking_code && navigate && (
        <div className="request-actions request-income-actions">
          <button className="button primary" type="button" onClick={() => openBookingCodeFromRequest(request, navigate)}>{adminCopy(lang, 'Gestisci codice / registra pagamento', 'Manage code / record payment')}</button>
          <span className="small-note">{adminCopy(lang, 'Usa lo stesso flusso di pagamento con importo, data e metodo effettivi.', 'Use the same payment flow with the actual amount, date and method.')}</span>
        </div>
      )}
      {session && <ReviewRequestActions record={request} type="request" lang={lang} session={session} onUpdated={onUpdated} />}
      {session && <ReferralActions record={request} type="request" lang={lang} session={session} onUpdated={onUpdated} />}
      <ReplyTools request={request} lang={lang}>
        {request.status === 'pending' && (
          <>
            <button className="button primary request-action-primary" type="button" onClick={onApprove}>{adminCopy(lang, 'Approva', 'Approve')}</button>
            <button className="button secondary request-action-secondary" type="button" onClick={onDecline}>{adminCopy(lang, 'Rifiuta', 'Decline')}</button>
          </>
        )}
      </ReplyTools>
      {request.status === 'accepted' && onRemove && (
        <div className="request-actions">
          <button className="button secondary danger" type="button" onClick={onRemove}>{adminCopy(lang, 'Rimuovi / annulla', 'Remove / cancel')}</button>
        </div>
      )}
    </article>
  );
}

function ReplyTools({ request, lang, children = null }) {
  const [copied, setCopied] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const replyLang = requestLang(request, lang);
  const approval = buildApprovalReply(request, lang);
  const decline = buildDeclineReply(request, lang);
  const prepared = request.status === 'declined' ? decline : approval;
  const type = request.status === 'declined' ? 'decline' : 'approval';
  const customerEmail = request.customer_email || '';
  const phone = normalizePhoneForWhatsApp(request.customer_phone);
  const phoneNeedsCountry = request.customer_phone && !hasLikelyCountryCode(request.customer_phone);
  const subject = replySubject(type, replyLang);

  async function copy(kind, value) {
    await copyText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(''), 1400);
  }

  return (
    <div className="reply-tools">
      <div className="reply-tool-buttons request-actions-row">
        {phone ? <a href={`https://wa.me/${phone}?text=${encode(prepared)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a> : <button type="button" onClick={() => copy('reply', prepared)}>{adminCopy(lang, 'Copia risposta', 'Copy reply')}</button>}
        <button type="button" onClick={() => setEmailOpen((open) => !open)}>{adminCopy(lang, 'Email', 'Email')}</button>
        <button type="button" onClick={() => copy('reply', prepared)}>{adminCopy(lang, 'Copia messaggio', 'Copy message')} {copied === 'reply' ? '· ✓' : ''}</button>
        {children}
      </div>
      {phoneNeedsCountry && <p className="small-note">{adminCopy(lang, 'Il numero potrebbe richiedere il prefisso internazionale prima di aprire WhatsApp.', 'Phone number may need country code before opening WhatsApp.')}</p>}
      {emailOpen && (
        <div className="admin-email-panel">
          {customerEmail ? <button type="button" onClick={() => openDefaultEmailApp(customerEmail, subject, prepared)}>{adminCopy(lang, 'Apri app email predefinita', 'Open default email app')}</button> : <span>{adminCopy(lang, 'Email cliente non disponibile.', 'Customer email unavailable.')}</span>}
          {customerEmail && <a href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encode(customerEmail)}&su=${encode(subject)}&body=${encode(prepared)}`} target="_blank" rel="noopener noreferrer">Gmail</a>}
          {customerEmail && <button type="button" onClick={() => copy('email', customerEmail)}>{adminCopy(lang, 'Copia email cliente', 'Copy customer email')} {copied === 'email' ? '· ✓' : ''}</button>}
          <button type="button" onClick={() => copy('reply', prepared)}>{adminCopy(lang, 'Copia messaggio preparato', 'Copy prepared message')}</button>
        </div>
      )}
    </div>
  );
}

function DecisionModal({ lang, session, decision, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [mode, setMode] = useState('accept-only');
  const [limitedScope, setLimitedScope] = useState('experience');
  const [reason, setReason] = useState('unavailable');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useBodyScrollLock(true);

  async function confirm() {
    setLoading(true);
    setError('');
    try {
      if (decision.type === 'approve') {
        const result = await approveBookingRequest({ request: decision.request, userId: session.user.id, mode, decisionNote: note, limitedScope });
        if (result.availabilityError) {
          onDone(adminCopy(lang, 'Richiesta accettata, ma la disponibilità non è stata aggiornata. Blocca la data manualmente.', 'Request was accepted, but availability was not updated. Please block the date manually.'));
          return;
        }
        onDone(adminCopy(lang, 'Richiesta accettata.', 'Request accepted.'));
      } else if (decision.type === 'remove') {
        await cancelBookingRequest({ request: decision.request, userId: session.user.id, decisionNote: note });
        onDone(adminCopy(lang, 'Richiesta rimossa/annullata.', 'Request removed/cancelled.'));
      } else {
        await declineBookingRequest({ request: decision.request, userId: session.user.id, decisionNote: note, reasonCategory: reason });
        onDone(adminCopy(lang, 'Richiesta rifiutata.', 'Request declined.'));
      }
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Azione non completata.', 'Action failed.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="decisionTitle">
        <div className="admin-modal-header">
          <h2 id="decisionTitle">{decision.type === 'approve' ? adminCopy(lang, 'Approva richiesta', 'Approve request') : decision.type === 'remove' ? adminCopy(lang, 'Rimuovi richiesta accettata', 'Remove accepted request') : adminCopy(lang, 'Rifiuta richiesta', 'Decline request')}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={text(lang, 'close')}>×</button>
        </div>
        <p>{decision.request.customer_name || adminCopy(lang, 'Cliente senza nome', 'Unnamed customer')} · {adminExperienceLabel(decision.request.experience_id, lang)} · {formatDateForMessage(decision.request.requested_date, lang) || '-'}</p>
        {decision.type === 'approve' ? (
          <>
            <label className="field-label" htmlFor="approvalMode">{adminCopy(lang, 'Opzione approvazione', 'Approval option')}</label>
            <select id="approvalMode" value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="accept-only">{adminCopy(lang, 'Accetta soltanto', 'Accept request only')}</option>
              <option value="close-experience">{adminCopy(lang, 'Accetta e chiudi questa esperienza', 'Accept and close this experience')}</option>
              <option value="close-global">{adminCopy(lang, 'Accetta e chiudi tutte le esperienze', 'Accept and close all experiences')}</option>
              <option value="limited">{adminCopy(lang, 'Accetta e segna disponibilità limitata', 'Accept and mark limited availability')}</option>
            </select>
            {mode === 'limited' && (
              <>
                <label className="field-label" htmlFor="limitedScope">{adminCopy(lang, 'Ambito limitazione', 'Limited scope')}</label>
                <select id="limitedScope" value={limitedScope} onChange={(event) => setLimitedScope(event.target.value)}>
                  <option value="experience">{adminCopy(lang, 'Solo esperienza selezionata', 'Selected experience only')}</option>
                  <option value="global">{adminCopy(lang, 'Tutte le esperienze', 'All experiences')}</option>
                </select>
              </>
            )}
          </>
        ) : decision.type === 'remove' ? (
          <div className="admin-alert warning compact-alert">{adminCopy(lang, 'Questa azione annulla la richiesta accettata e libera i posti collegati.', 'This cancels the accepted request and frees its linked places.')}</div>
        ) : (
          <>
            <label className="field-label" htmlFor="declineReason">{adminCopy(lang, 'Motivo', 'Reason')}</label>
            <select id="declineReason" value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="unavailable">{adminCopy(lang, 'Non disponibile', 'Unavailable')}</option>
              <option value="unsafe conditions">{adminCopy(lang, 'Condizioni non sicure', 'Unsafe conditions')}</option>
              <option value="unsuitable route">{adminCopy(lang, 'Percorso non adatto', 'Unsuitable route')}</option>
              <option value="duplicate request">{adminCopy(lang, 'Richiesta duplicata', 'Duplicate request')}</option>
              <option value="customer cancelled">{adminCopy(lang, 'Cliente ha annullato', 'Customer cancelled')}</option>
              <option value="other">{adminCopy(lang, 'Altro', 'Other')}</option>
            </select>
          </>
        )}
        <label className="field-label" htmlFor="decisionNote">{adminCopy(lang, 'Nota decisione', 'Decision note')}</label>
        <textarea id="decisionNote" value={note} onChange={(event) => setNote(event.target.value)} rows={4} />
        {error && <div className="admin-alert error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button className="button primary" type="button" onClick={confirm} disabled={loading}>{loading ? adminCopy(lang, 'Salvataggio...', 'Saving...') : adminCopy(lang, 'Conferma', 'Confirm')}</button>
          <button className="button secondary" type="button" onClick={onClose}>{adminCopy(lang, 'Annulla', 'Cancel')}</button>
        </div>
      </section>
    </div>
  );
}

const emptyManualRequest = {
  customer_name: '', customer_phone: '', customer_email: '', preferred_contact: 'whatsapp', source: 'whatsapp', request_type: 'private', party_type: 'solo', experience_id: 'unsure', requested_date: '', alternative_date: '', language: 'it', adults: '', children: '', children_under_3: false, private_experience: false, main_interest: '', preferred_pace: '', message: '', heard_about_us: 'not_specified', heard_about_us_label: '', heard_about_us_detail: '', admin_note: ''
};

function ManualRequestModal({ lang, session, onClose, onSaved }) {
  const [form, setForm] = useState({ ...emptyManualRequest, language: lang });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useBodyScrollLock(true);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!form.customer_name.trim() && !form.customer_phone.trim() && !form.customer_email.trim()) {
      setError(adminCopy(lang, 'Inserisci almeno nome o contatto.', 'Enter at least a name or contact method.'));
      return;
    }
    setLoading(true);
    try {
      const cleanHeardAboutUs = normalizeHeardAboutUs(form.heard_about_us || 'not_specified', { allowAdmin: true }) || 'not_specified';
      await createManualBookingRequest({ ...form, heard_about_us: cleanHeardAboutUs, heard_about_us_label: heardAboutUsLabel(cleanHeardAboutUs, lang), heard_about_us_detail: needsHeardAboutUsDetail(cleanHeardAboutUs) ? cleanHeardAboutUsDetail(form.heard_about_us_detail) : null }, session.user.id);
      onSaved();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Richiesta non salvata.', 'Request not saved.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="admin-modal wide" role="dialog" aria-modal="true" aria-labelledby="manualRequestTitle">
        <div className="admin-modal-header">
          <h2 id="manualRequestTitle">{adminCopy(lang, 'Aggiungi richiesta manuale', 'Add manual request')}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={text(lang, 'close')}>×</button>
        </div>
        <form className="admin-form-grid" onSubmit={submit}>
          <AdminInput label={adminCopy(lang, 'Nome cliente', 'Customer name')} value={form.customer_name} onChange={(value) => update('customer_name', value)} />
          <AdminInput label="Phone / WhatsApp" type="tel" inputMode="tel" pattern="[0-9+\s().-]*" value={form.customer_phone} onChange={(value) => update('customer_phone', value.replace(/[^\d+\s().-]/g, ''))} />
          <AdminInput label="Email" type="email" value={form.customer_email} onChange={(value) => update('customer_email', value)} />
          <AdminSelect label={adminCopy(lang, 'Contatto preferito', 'Preferred contact')} value={form.preferred_contact} onChange={(value) => update('preferred_contact', value)} options={['whatsapp', 'phone', 'email', 'unknown']} />
          <AdminSelect label={adminCopy(lang, 'Fonte', 'Source')} value={form.source} onChange={(value) => update('source', value)} options={['whatsapp', 'phone', 'email', 'manual']} />
          <AdminSelect label={text(lang, 'heardAboutUsAdmin')} value={form.heard_about_us || 'not_specified'} onChange={(value) => { update('heard_about_us', value); update('heard_about_us_label', heardAboutUsLabel(value, lang)); if (!needsHeardAboutUsDetail(value)) update('heard_about_us_detail', ''); }} options={heardAboutUsOptions({ includeAdmin: true }).map((option) => option.value)} formatter={(value) => heardAboutUsLabel(value, lang)} />
          {needsHeardAboutUsDetail(form.heard_about_us) && <AdminInput label={text(lang, 'heardAboutUsOtherLabel')} value={form.heard_about_us_detail || ''} onChange={(value) => update('heard_about_us_detail', value)} />}
          <AdminSelect label={adminCopy(lang, 'Tipo richiesta', 'Request type')} value={form.request_type} onChange={(value) => update('request_type', value)} options={['private', 'fixed']} formatter={(value) => value === 'fixed' ? adminCopy(lang, 'Escursione fissa', 'Fixed excursion') : adminCopy(lang, 'Escursione privata', 'Private excursion')} />
          <AdminSelect label={adminCopy(lang, 'Tipo gruppo', 'Party type')} value={form.party_type} onChange={(value) => update('party_type', value)} options={['solo', 'couple', 'family', 'group', 'company', 'school', 'other']} formatter={(value) => ({ solo: adminCopy(lang, 'Singolo', 'Solo traveler'), couple: adminCopy(lang, 'Coppia', 'Couple'), family: adminCopy(lang, 'Famiglia', 'Family'), group: adminCopy(lang, 'Gruppo', 'Group'), company: adminCopy(lang, 'Azienda', 'Company'), school: adminCopy(lang, 'Scuola', 'School'), other: adminCopy(lang, 'Altro', 'Other') }[value] || value)} />
          <AdminSelect label={adminCopy(lang, 'Esperienza', 'Experience')} value={form.experience_id} onChange={(value) => update('experience_id', value)} options={ADMIN_EXPERIENCE_OPTIONS} formatter={(value) => adminExperienceLabel(value, lang)} />
          <AdminInput label={adminCopy(lang, 'Data richiesta', 'Requested date')} type="date" min={todayIso()} value={form.requested_date} onChange={(value) => update('requested_date', value)} />
          <AdminInput label={adminCopy(lang, 'Data alternativa', 'Alternative date')} type="date" min={todayIso()} value={form.alternative_date} onChange={(value) => update('alternative_date', value)} />
          <AdminSelect label={adminCopy(lang, 'Lingua', 'Language')} value={form.language} onChange={(value) => update('language', value)} options={['it', 'en']} />
          <AdminInput label="Adults" type="number" value={form.adults} onChange={(value) => update('adults', value)} />
          <AdminInput label="Children" type="number" value={form.children} onChange={(value) => update('children', value)} />
          <label className="check-field"><input type="checkbox" checked={form.children_under_3} onChange={(event) => update('children_under_3', event.target.checked)} /> {adminCopy(lang, 'Bambini sotto i 3 anni', 'Children under 3')}</label>
          <label className="check-field"><input type="checkbox" checked={form.private_experience} onChange={(event) => update('private_experience', event.target.checked)} /> {adminCopy(lang, 'Esperienza privata', 'Private experience')}</label>
          <AdminInput label={adminCopy(lang, 'Interesse principale', 'Main interest')} value={form.main_interest} onChange={(value) => update('main_interest', value)} />
          <AdminInput label={adminCopy(lang, 'Ritmo preferito', 'Preferred pace')} value={form.preferred_pace} onChange={(value) => update('preferred_pace', value)} />
          <label className="admin-field full"><span>{adminCopy(lang, 'Messaggio / note cliente', 'Message / customer notes')}</span><textarea value={form.message} onChange={(event) => update('message', event.target.value)} rows={4} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Nota interna', 'Internal admin note')}</span><textarea value={form.admin_note} onChange={(event) => update('admin_note', event.target.value)} rows={3} /></label>
          {error && <div className="admin-alert error full" role="alert">{error}</div>}
          <div className="modal-actions full">
            <button className="button primary" type="submit" disabled={loading}>{loading ? adminCopy(lang, 'Salvataggio...', 'Saving...') : adminCopy(lang, 'Salva richiesta', 'Save request')}</button>
            <button className="button secondary" type="button" onClick={onClose}>{adminCopy(lang, 'Annulla', 'Cancel')}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function cleanAdminAmount(value) {
  const parsed = Number.parseFloat(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function AdminBookingCodeModal({ lang, session, onClose, onSaved }) {
  const [fixedExcursions, setFixedExcursions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdCode, setCreatedCode] = useState(null);
  const [form, setForm] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    fixed_excursion_id: '',
    experience_id: 'etna-live',
    experience_name_it: '',
    experience_name_en: '',
    scheduled_date: '',
    scheduled_time: '',
    meeting_point_name: '',
    meeting_point_maps_url: '',
    expected_amount: '',
    currency: 'EUR',
    expiry_date: '',
    admin_note: ''
  });
  useBodyScrollLock(true);

  useEffect(() => {
    let alive = true;
    setLoadingOptions(true);
    listFixedExcursions({ activeOnly: true, fromDate: todayIso() })
      .then((items) => {
        if (!alive) return;
        setFixedExcursions((items || []).filter((item) => item.active !== false && (!item.date || item.date >= todayIso())));
      })
      .catch((err) => {
        if (alive) setError(err?.message || adminCopy(lang, 'Escursioni non caricate.', 'Excursions not loaded.'));
      })
      .finally(() => alive && setLoadingOptions(false));
    return () => { alive = false; };
  }, [lang]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applyFixedExcursion(id) {
    const item = fixedExcursions.find((candidate) => candidate.id === id);
    setForm((current) => ({
      ...current,
      fixed_excursion_id: id,
      experience_id: item?.experience_id || current.experience_id,
      experience_name_it: item ? fixedExcursionTitle(item, 'it') : current.experience_name_it,
      experience_name_en: item ? fixedExcursionTitle(item, 'en') : current.experience_name_en,
      scheduled_date: item?.date || current.scheduled_date,
      scheduled_time: item?.start_time ? String(item.start_time).slice(0, 5) : current.scheduled_time,
      meeting_point_name: item ? fixedExcursionField(item, 'meeting_point', lang) : current.meeting_point_name,
      meeting_point_maps_url: item?.meeting_point_maps_url || current.meeting_point_maps_url
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!form.customer_name.trim()) {
      setError(adminCopy(lang, 'Inserisci il nome cliente.', 'Enter the customer name.'));
      return;
    }
    if (!form.fixed_excursion_id && !form.experience_id) {
      setError(adminCopy(lang, 'Seleziona un’escursione o un’esperienza.', 'Select an excursion or an experience.'));
      return;
    }
    if (cleanAdminAmount(form.expected_amount) < 0) {
      setError(adminCopy(lang, 'Importo non valido.', 'Invalid amount.'));
      return;
    }
    if ((form.scheduled_date && form.scheduled_date < todayIso()) || (form.expiry_date && form.expiry_date < todayIso())) {
      setError(adminCopy(lang, 'Seleziona una data di oggi o futura.', 'Select today or a future date.'));
      return;
    }
    setSaving(true);
    try {
      const selectedFixed = fixedExcursions.find((item) => item.id === form.fixed_excursion_id);
      const payload = {
        ...form,
        fixed_excursion_id: selectedFixed?.id || null,
        experience_id: selectedFixed?.experience_id || form.experience_id,
        experience_name_it: form.experience_name_it || (selectedFixed ? fixedExcursionTitle(selectedFixed, 'it') : adminExperienceLabel(form.experience_id, 'it')),
        experience_name_en: form.experience_name_en || (selectedFixed ? fixedExcursionTitle(selectedFixed, 'en') : adminExperienceLabel(form.experience_id, 'en')),
        experience_type: selectedFixed ? 'fixed' : 'manual',
        scheduled_date: form.scheduled_date || selectedFixed?.date || null,
        scheduled_time: form.scheduled_time || (selectedFixed?.start_time ? String(selectedFixed.start_time).slice(0, 5) : null),
        meeting_point_name: form.meeting_point_name || (selectedFixed ? fixedExcursionField(selectedFixed, 'meeting_point', lang) : ''),
        meeting_point_maps_url: form.meeting_point_maps_url || selectedFixed?.meeting_point_maps_url || '',
        expected_amount: cleanAdminAmount(form.expected_amount),
        expires_at: form.expiry_date || null,
        source: 'manual'
      };
      const created = await createBookingCode(payload, session.user.id);
      setCreatedCode(created);
      trackEvent('admin_booking_code_created', { language: lang, experience_id: payload.experience_id, has_fixed_excursion: Boolean(payload.fixed_excursion_id) }, { dedupe: false });
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Codice non creato.', 'Code not created.'));
    } finally {
      setSaving(false);
    }
  }

  const fixedOptions = fixedExcursions.map((item) => item.id);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="admin-modal wide booking-code-admin-modal" role="dialog" aria-modal="true" aria-labelledby="adminBookingCodeTitle">
        <div className="admin-modal-header">
          <div>
            <h2 id="adminBookingCodeTitle">{adminCopy(lang, 'Genera codice prenotazione', 'Generate booking code')}</h2>
            <p>{adminCopy(lang, 'Crea un codice per prenotazioni arrivate da canali esterni.', 'Create a code for bookings that came from external channels.')}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={text(lang, 'close')}>×</button>
        </div>
        {createdCode ? (
          <div className="admin-code-result-card">
            <span className="kicker">{adminCopy(lang, 'Codice pronto', 'Code ready')}</span>
            <h3>{createdCode.code}</h3>
            <p>{createdCode.customer_name} · {(lang === 'en' ? createdCode.experience_name_en || createdCode.experience_name_it : createdCode.experience_name_it || createdCode.experience_name_en)}</p>
            <div className="modal-actions">
              <button className="button primary" type="button" onClick={() => onSaved(createdCode.code)}>{adminCopy(lang, 'Fine', 'Done')}</button>
              <button className="button secondary" type="button" onClick={() => navigator.clipboard?.writeText(createdCode.code)}>{adminCopy(lang, 'Copia codice', 'Copy code')}</button>
            </div>
          </div>
        ) : (
          <form className="admin-form-grid booking-code-generator-form" onSubmit={submit}>
            <AdminInput label={adminCopy(lang, 'Nome cliente', 'Customer name')} value={form.customer_name} onChange={(value) => update('customer_name', value)} />
            <AdminInput label="Email" type="email" value={form.customer_email} onChange={(value) => update('customer_email', value)} />
            <AdminInput label="Phone / WhatsApp" type="tel" inputMode="tel" pattern="[0-9+\s().-]*" value={form.customer_phone} onChange={(value) => update('customer_phone', value.replace(/[^\d+\s().-]/g, ''))} />
            <label className="admin-field"><span>{adminCopy(lang, 'Escursione disponibile', 'Available excursion')}</span><select value={form.fixed_excursion_id} onChange={(event) => applyFixedExcursion(event.target.value)} disabled={loadingOptions}><option value="">{loadingOptions ? adminCopy(lang, 'Caricamento...', 'Loading...') : adminCopy(lang, 'Nessuna / esperienza manuale', 'None / manual experience')}</option>{fixedOptions.map((id) => <option key={id} value={id}>{fixedExcursionLabel(fixedExcursions.find((item) => item.id === id), lang)}</option>)}</select></label>
            {!form.fixed_excursion_id && <AdminSelect label={adminCopy(lang, 'Esperienza', 'Experience')} value={form.experience_id} onChange={(value) => update('experience_id', value)} options={ADMIN_EXPERIENCE_OPTIONS.filter((item) => item !== 'unsure')} formatter={(value) => adminExperienceLabel(value, lang)} />}
            <AdminInput label={adminCopy(lang, 'Titolo esperienza IT', 'Experience title IT')} value={form.experience_name_it} onChange={(value) => update('experience_name_it', value)} />
            <AdminInput label={adminCopy(lang, 'Titolo esperienza EN', 'Experience title EN')} value={form.experience_name_en} onChange={(value) => update('experience_name_en', value)} />
            <AdminInput label={adminCopy(lang, 'Data prevista', 'Expected date')} type="date" min={todayIso()} value={form.scheduled_date} onChange={(value) => update('scheduled_date', value)} />
            <AdminInput label={adminCopy(lang, 'Ora prevista', 'Expected time')} type="time" value={form.scheduled_time} onChange={(value) => update('scheduled_time', value)} />
            <AdminInput label={adminCopy(lang, 'Punto d’incontro', 'Meeting point')} value={form.meeting_point_name} onChange={(value) => update('meeting_point_name', value)} />
            <AdminInput label="Google Maps URL" value={form.meeting_point_maps_url} onChange={(value) => update('meeting_point_maps_url', value)} />
            <AdminInput label={adminCopy(lang, 'Importo previsto', 'Expected amount')} type="number" value={form.expected_amount} onChange={(value) => update('expected_amount', value)} />
            <AdminInput label={adminCopy(lang, 'Valuta', 'Currency')} value={form.currency} onChange={(value) => update('currency', normalizeCurrency(value))} />
            <AdminInput label={adminCopy(lang, 'Scadenza opzionale', 'Optional expiry')} type="date" min={todayIso()} value={form.expiry_date} onChange={(value) => update('expiry_date', value)} />
            <label className="admin-field full"><span>{adminCopy(lang, 'Nota interna opzionale', 'Optional internal note')}</span><textarea value={form.admin_note} onChange={(event) => update('admin_note', event.target.value)} rows={4} /></label>
            {error && <div className="admin-alert error full" role="alert">{error}</div>}
            <div className="modal-actions full">
              <button className="button primary" type="submit" disabled={saving}>{saving ? adminCopy(lang, 'Generazione...', 'Generating...') : adminCopy(lang, 'Genera codice', 'Generate code')}</button>
              <button className="button secondary" type="button" onClick={onClose}>{adminCopy(lang, 'Annulla', 'Cancel')}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function AdminInput({ label, value, onChange, type = 'text', placeholder = '', min, inputMode, pattern }) {
  const id = useMemo(() => `field-${Math.random().toString(36).slice(2)}`, []);
  const resolvedMin = min !== undefined ? min : (type === 'number' ? '0' : undefined);
  return <label className="admin-field" htmlFor={id}><span>{label}</span><input id={id} type={type} value={value || ''} placeholder={placeholder} min={resolvedMin} inputMode={inputMode} pattern={pattern} onChange={(event) => onChange(event.target.value)} /></label>;
}

function AdminSelect({ label, value, onChange, options, formatter = (item) => item, disabled = false }) {
  const id = useMemo(() => `field-${Math.random().toString(36).slice(2)}`, []);
  return <label className="admin-field" htmlFor={id}><span>{label}</span><select id={id} value={value || ''} disabled={disabled} onChange={(event) => { if (!disabled) onChange?.(event.target.value); }}>{options.map((option) => <option key={option} value={option}>{formatter(option)}</option>)}</select></label>;
}

function RequestStatusAccordions({ requests, lang, session = null, navigate = null, onApprove, onDecline, onRemove, onUpdated }) {
  const groups = [
    { status: 'pending', label: adminCopy(lang, 'In attesa', 'Pending'), defaultOpen: true },
    { status: 'accepted', label: adminCopy(lang, 'Approvate / accettate', 'Approved / accepted'), defaultOpen: false },
    { status: 'declined', label: adminCopy(lang, 'Rifiutate', 'Declined'), defaultOpen: false },
    { status: 'cancelled', label: adminCopy(lang, 'Rimosse / annullate', 'Removed / cancelled'), defaultOpen: false },
    { status: 'archived', label: adminCopy(lang, 'Archiviate', 'Archived'), defaultOpen: false }
  ].map((group) => ({ ...group, items: requests.filter((request) => request.status === group.status) }))
    .filter((group) => group.items.length || group.status === 'pending');

  return (
    <div className="request-accordion-stack">
      {groups.map((group) => (
        <details className="request-accordion" key={group.status} open={group.defaultOpen}>
          <summary><span>{group.label}</span><strong>{group.items.length}</strong></summary>
          {group.items.length === 0 ? <p className="small-note">{adminCopy(lang, 'Nessuna richiesta in questa sezione.', 'No requests in this section.')}</p> : (
            <div className="request-card-list compact-list">
              {group.items.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  lang={lang}
                  session={session}
                  navigate={navigate}
                  compact
                  onApprove={() => onApprove(request)}
                  onDecline={() => onDecline(request)}
                  onRemove={() => onRemove(request)}
                  onUpdated={onUpdated}
                />
              ))}
            </div>
          )}
        </details>
      ))}
    </div>
  );
}

function AdminReviewsPanel({ lang, adminContent = {} }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [confirmReview, setConfirmReview] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [savingReplyId, setSavingReplyId] = useState('');
  const [editingReviewId, setEditingReviewId] = useState('');
  const [editDrafts, setEditDrafts] = useState({});
  const emptyManualReviewForm = { source: 'google', reviewer_name: '', rating: '5', review_text: '', language: lang, review_date: todayIso(), external_review_url: '', profile_photo_url: '', display_order: '0', active: true, approved: true };
  const [manualForm, setManualForm] = useState(emptyManualReviewForm);

  useBodyScrollLock(Boolean(confirmReview));

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      setReviews(await listReviews({ activeOnly: false }));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Recensioni non caricate.', 'Could not load reviews.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  function updateManual(field, value) {
    setManualForm((current) => ({ ...current, [field]: value }));
  }

  async function submitManualReview(event) {
    event.preventDefault();
    setError('');
    setFeedback('');
    if (!manualForm.review_text.trim()) {
      setError(adminCopy(lang, 'Inserisci il testo della recensione.', 'Enter the review text.'));
      return;
    }
    try {
      await createManualReview(manualForm);
      setManualForm({ ...emptyManualReviewForm, language: lang, review_date: todayIso() });
      setFeedback(adminCopy(lang, 'Recensione manuale salvata.', 'Manual review saved.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Recensione manuale non salvata.', 'Manual review not saved.'));
    }
  }

  async function setVisible(review, active) {
    setError('');
    setFeedback('');
    try {
      await updateReviewVisibility(review.id, { active, approved: active ? true : review.approved });
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Recensione non aggiornata.', 'Review not updated.'));
    }
  }

  async function confirmDeleteReview() {
    if (!confirmReview) return;
    setError('');
    setFeedback('');
    try {
      await deleteReview(confirmReview.id);
      setConfirmReview(null);
      setFeedback(adminCopy(lang, 'Recensione eliminata.', 'Review deleted.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Impossibile eliminare la recensione. Riprova.', 'Could not delete the review. Please try again.'));
    }
  }

  function replyDraft(review) {
    return replyDrafts[review.id] ?? review.admin_reply ?? '';
  }

  function updateReplyDraft(review, value) {
    setReplyDrafts((current) => ({ ...current, [review.id]: value }));
  }

  async function saveReply(review) {
    setError('');
    setFeedback('');
    setSavingReplyId(review.id);
    try {
      await updateReviewAdminReply(review.id, replyDraft(review));
      setFeedback(adminCopy(lang, 'Risposta salvata.', 'Response saved.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Risposta non salvata. Controlla Supabase e riprova.', 'Response not saved. Check Supabase and try again.'));
    } finally {
      setSavingReplyId('');
    }
  }

  async function clearReply(review) {
    setError('');
    setFeedback('');
    setSavingReplyId(review.id);
    try {
      await deleteReviewAdminReply(review.id);
      setReplyDrafts((current) => ({ ...current, [review.id]: '' }));
      setFeedback(adminCopy(lang, 'Risposta eliminata.', 'Response deleted.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Risposta non eliminata. Riprova.', 'Response not deleted. Please try again.'));
    } finally {
      setSavingReplyId('');
    }
  }

  function reviewEditDraft(review) {
    return editDrafts[review.id] || {
      source: review.source || 'website',
      reviewer_name: review.reviewer_name || '',
      rating: String(review.rating || '5'),
      review_text: review.review_text || '',
      language: review.language || lang,
      review_date: review.review_date || String(review.created_at || '').slice(0, 10) || todayIso(),
      external_review_url: review.external_review_url || '',
      profile_photo_url: review.profile_photo_url || '',
      display_order: String(review.display_order || 0),
      active: review.active !== false,
      approved: review.approved !== false
    };
  }

  function updateReviewDraft(review, field, value) {
    setEditDrafts((current) => ({ ...current, [review.id]: { ...reviewEditDraft(review), [field]: value } }));
  }

  function startEditingReview(review) {
    setEditingReviewId(review.id);
    setEditDrafts((current) => ({ ...current, [review.id]: reviewEditDraft(review) }));
  }

  async function saveReviewDetails(review) {
    setError('');
    setFeedback('');
    const draft = reviewEditDraft(review);
    try {
      await updateReviewDetails(review.id, draft);
      setEditingReviewId('');
      setFeedback(adminCopy(lang, 'Recensione aggiornata.', 'Review updated.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Recensione non aggiornata.', 'Review not updated.'));
    }
  }

  function renderReviewDetailsForm(review) {
    const draft = reviewEditDraft(review);
    return (
      <div className="admin-form-grid single-card-form admin-review-edit-form">
        <label className="admin-field"><span>{adminCopy(lang, 'Fonte', 'Source')}</span><select value={draft.source} onChange={(event) => updateReviewDraft(review, 'source', event.target.value)}><option value="website">Website</option><option value="google">Google</option></select></label>
        <AdminInput label={adminCopy(lang, 'Nome', 'Name')} value={draft.reviewer_name} onChange={(value) => updateReviewDraft(review, 'reviewer_name', value)} />
        <label className="admin-field"><span>{adminCopy(lang, 'Valutazione', 'Rating')}</span><select value={draft.rating} onChange={(event) => updateReviewDraft(review, 'rating', event.target.value)}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating}/5</option>)}</select></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Lingua', 'Language')}</span><select value={draft.language} onChange={(event) => updateReviewDraft(review, 'language', event.target.value)}><option value="it">Italiano</option><option value="en">English</option></select></label>
        <AdminInput label={adminCopy(lang, 'Data recensione', 'Review date')} type="date" value={draft.review_date} onChange={(value) => updateReviewDraft(review, 'review_date', value)} />
        <AdminInput label={adminCopy(lang, 'Ordine', 'Display order')} type="number" value={draft.display_order} onChange={(value) => updateReviewDraft(review, 'display_order', value)} />
        <label className="admin-field full"><span>{adminCopy(lang, 'Testo recensione', 'Review text')}</span><textarea value={draft.review_text} onChange={(event) => updateReviewDraft(review, 'review_text', event.target.value)} rows={4} /></label>
        <AdminInput label={adminCopy(lang, 'URL recensione Google opzionale', 'Optional Google review URL')} value={draft.external_review_url} onChange={(value) => updateReviewDraft(review, 'external_review_url', value)} />
        <AdminInput label={adminCopy(lang, 'URL foto profilo opzionale', 'Optional profile photo URL')} value={draft.profile_photo_url} onChange={(value) => updateReviewDraft(review, 'profile_photo_url', value)} />
        <label className="check-field"><input type="checkbox" checked={draft.active} onChange={(event) => updateReviewDraft(review, 'active', event.target.checked)} /> {adminCopy(lang, 'Attiva', 'Active')}</label>
        <label className="check-field"><input type="checkbox" checked={draft.approved} onChange={(event) => updateReviewDraft(review, 'approved', event.target.checked)} /> {adminCopy(lang, 'Approvata', 'Approved')}</label>
        <div className="modal-actions full"><button className="button primary" type="button" onClick={() => saveReviewDetails(review)}>{adminCopy(lang, 'Salva dettagli', 'Save details')}</button><button className="button secondary" type="button" onClick={() => setEditingReviewId('')}>{adminCopy(lang, 'Annulla', 'Cancel')}</button></div>
      </div>
    );
  }

  return (
    <section className="admin-panel admin-reviews-panel">
      <div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.reviews.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Gestione recensioni', 'Review management')} /><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}

      <GoogleReviewsAdminStatus lang={lang} />

      <details className="admin-archive-details manual-review-editor">
        <summary><span>{adminCopy(lang, 'Recensione manuale / Google', 'Manual / Google review')}</span><strong>{adminCopy(lang, 'Fonte gratuita gestita da admin', 'Free admin-managed source')}</strong></summary>
        <form className="admin-form-grid" onSubmit={submitManualReview}>
          <label className="admin-field"><span>{adminCopy(lang, 'Fonte', 'Source')}</span><select value={manualForm.source} onChange={(event) => updateManual('source', event.target.value)}><option value="google">Google</option><option value="website">Website</option></select></label>
          <AdminInput label={adminCopy(lang, 'Nome autore', 'Author name')} value={manualForm.reviewer_name} onChange={(value) => updateManual('reviewer_name', value)} />
          <label className="admin-field"><span>{adminCopy(lang, 'Valutazione', 'Rating')}</span><select value={manualForm.rating} onChange={(event) => updateManual('rating', event.target.value)}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating}/5</option>)}</select></label>
          <label className="admin-field"><span>{adminCopy(lang, 'Lingua', 'Language')}</span><select value={manualForm.language} onChange={(event) => updateManual('language', event.target.value)}><option value="it">Italiano</option><option value="en">English</option></select></label>
          <AdminInput label={adminCopy(lang, 'Data recensione', 'Review date')} type="date" value={manualForm.review_date} onChange={(value) => updateManual('review_date', value)} />
          <AdminInput label={adminCopy(lang, 'Ordine', 'Display order')} type="number" value={manualForm.display_order} onChange={(value) => updateManual('display_order', value)} />
          <label className="admin-field full"><span>{adminCopy(lang, 'Testo recensione', 'Review text')}</span><textarea value={manualForm.review_text} onChange={(event) => updateManual('review_text', event.target.value)} rows={4} required /></label>
          <AdminInput label={adminCopy(lang, 'URL recensione Google opzionale', 'Optional Google review URL')} value={manualForm.external_review_url} onChange={(value) => updateManual('external_review_url', value)} />
          <AdminInput label={adminCopy(lang, 'URL foto profilo opzionale', 'Optional profile photo URL')} value={manualForm.profile_photo_url} onChange={(value) => updateManual('profile_photo_url', value)} />
          <label className="check-field"><input type="checkbox" checked={manualForm.active} onChange={(event) => updateManual('active', event.target.checked)} /> {adminCopy(lang, 'Attiva', 'Active')}</label>
          <div className="modal-actions full"><button className="button primary" type="submit">{adminCopy(lang, 'Salva recensione manuale', 'Save manual review')}</button></div>
        </form>
        <p className="small-note">{adminCopy(lang, 'Usa l’inserimento manuale solo come fallback se il provider Google Business Profile non è ancora autorizzato. Quando la cache provider è disponibile, le recensioni Google sincronizzate hanno priorità sul sito pubblico.', 'Use manual entry only as a fallback while the Google Business Profile provider is not authorized. When the provider cache is available, synchronized Google reviews take priority on the public site.')}</p>
      </details>

      {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : reviews.length === 0 ? <p>{adminCopy(lang, 'Nessuna recensione ricevuta.', 'No reviews received.')}</p> : (
        <>
          <p className="small-note admin-review-delete-note">{adminCopy(lang, 'Per eliminare una recensione pubblica, usa il pulsante rosso “Elimina definitivamente” sulla card della recensione.', 'To delete a public review, use the red “Delete permanently” button on that review card.')}</p>
          <div className="admin-review-list">
            {reviews.map((review) => (
              <article className={`admin-review-card ${review.active ? '' : 'inactive'}`} key={review.id}>
                <div>
                  <div className="admin-review-title-row">
                    <strong>{review.reviewer_name || 'Guest'} · {review.rating || '-'}/5</strong>
                    <span className={`status-pill ${review.active && review.approved ? 'accepted' : 'cancelled'}`}>{review.active && review.approved ? adminCopy(lang, 'Pubblica sul sito', 'Public on website') : adminCopy(lang, 'Non pubblica', 'Not public')}</span>
                  </div>
                  <p className="small-note">{adminCopy(lang, 'Fonte', 'Source')}: {reviewSourceLabel(review, lang)} · {review.booking_code || '-'} · {review.language || '-'} · {review.review_date || String(review.created_at || '').slice(0, 10)}</p>
                  {editingReviewId === review.id ? renderReviewDetailsForm(review) : (
                    <>
                      <div className="admin-review-body">{normalizeReviewText(review.review_text).map((paragraph, index) => <p key={`${review.id}-body-${index}`}>{paragraph}</p>)}</div>
                      {review.admin_reply && (
                        <div className="admin-review-existing-reply">
                          <strong>{adminCopy(lang, 'Risposta vulcanIQ', 'vulcanIQ response')}</strong>
                          {normalizeReviewText(review.admin_reply).map((paragraph, index) => <p key={`${review.id}-reply-${index}`}>{paragraph}</p>)}
                        </div>
                      )}
                      <label className="field-label" htmlFor={`reviewReply-${review.id}`}>{review.admin_reply ? adminCopy(lang, 'Modifica risposta', 'Edit response') : adminCopy(lang, 'Rispondi alla recensione', 'Reply to review')}</label>
                      <textarea id={`reviewReply-${review.id}`} className="admin-review-reply-input" value={replyDraft(review)} onChange={(event) => updateReplyDraft(review, event.target.value)} placeholder={adminCopy(lang, 'Scrivi una risposta pubblica da mostrare sotto la recensione.', 'Write a public response to show below the review.')} />
                    </>
                  )}
                </div>
                <div className="admin-review-actions">
                  <button className="button secondary" type="button" onClick={() => startEditingReview(review)}>{adminCopy(lang, 'Modifica dettagli', 'Edit details')}</button>
                  <button className="button secondary" type="button" onClick={() => setVisible(review, !review.active)}>{review.active ? adminCopy(lang, 'Nascondi', 'Hide') : adminCopy(lang, 'Ripubblica', 'Republish')}</button>
                  <button className="button primary" type="button" onClick={() => saveReply(review)} disabled={savingReplyId === review.id}>{savingReplyId === review.id ? adminCopy(lang, 'Salvataggio...', 'Saving...') : adminCopy(lang, 'Salva risposta', 'Save response')}</button>
                  <button className="button secondary" type="button" onClick={() => clearReply(review)} disabled={savingReplyId === review.id || !replyDraft(review)}>{adminCopy(lang, 'Elimina risposta', 'Delete response')}</button>
                  <button className="button primary danger" type="button" onClick={() => setConfirmReview(review)}>{adminCopy(lang, 'Elimina definitivamente', 'Delete permanently')}</button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {confirmReview && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={adminCopy(lang, 'Conferma eliminazione', 'Confirm deletion')}>
          <article className="admin-modal review-delete-modal">
            <div className="admin-modal-header">
              <h2>{adminCopy(lang, 'Conferma eliminazione', 'Confirm deletion')}</h2>
              <button className="modal-close-button" type="button" onClick={() => setConfirmReview(null)}>{adminCopy(lang, 'Annulla', 'Cancel')}</button>
            </div>
            <p>{adminCopy(lang, 'Sei sicuro di voler eliminare questa recensione? Questa azione non può essere annullata.', 'Are you sure you want to delete this review? This action cannot be undone.')}</p>
            <blockquote className="review-delete-preview">{confirmReview.review_text}</blockquote>
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={() => setConfirmReview(null)}>{adminCopy(lang, 'Annulla', 'Cancel')}</button>
              <button className="button primary danger" type="button" onClick={confirmDeleteReview}>{adminCopy(lang, 'Conferma eliminazione', 'Confirm deletion')}</button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}

function useAdminBookingCodes(filters = {}) {
  const { data, ...state } = useLatestQuery(() => listBookingCodes(filters), filters);
  return { codes: data, ...state };
}

function bookingCodeStatusLabel(status, lang) {
  const labels = {
    unused: { it: 'Non usato', en: 'Unused' },
    not_completed: { it: 'Non completato', en: 'Not completed' },
    redeemed: { it: 'Usato', en: 'Redeemed' },
    expired: { it: 'Scaduto', en: 'Expired' },
    cancelled: { it: 'Annullato', en: 'Cancelled' },
    completed: { it: 'Completato', en: 'Completed' },
    no_show: { it: 'No-show', en: 'No-show' }
  };
  return labels[status]?.[lang] || status || '-';
}

function bookingCodeIncomeStatusLabel(status, lang) {
  const labels = {
    expected: { it: 'Entrata attesa', en: 'Expected income' },
    pending: { it: 'In attesa', en: 'Pending' },
    confirmed: { it: 'Entrata confermata', en: 'Confirmed income' },
    cancelled: { it: 'Entrata annullata', en: 'Income cancelled' },
    reversed: { it: 'Entrata stornata', en: 'Income reversed' },
    none: { it: 'Nessuna entrata', en: 'No income' }
  };
  return labels[status]?.[lang] || status || '-';
}

function bookingCodeTitleForAdmin(code, lang) {
  return lang === 'en'
    ? (code.experience_name_en || code.experience_name_it || adminExperienceLabel(code.experience_id, lang))
    : (code.experience_name_it || code.experience_name_en || adminExperienceLabel(code.experience_id, lang));
}

function adminMoney(value, currency = 'EUR', lang = 'it') {
  return formatMoney(value, currency, lang);
}

function consumeBookingCodeRequestSearch() {
  try {
    const code = String(window.sessionStorage.getItem('vulcaniq.admin.bookingCodeSearch') || '').trim();
    window.sessionStorage.removeItem('vulcaniq.admin.bookingCodeSearch');
    return code;
  } catch {
    return '';
  }
}

function BookingCodePaymentDialog({ item, lang, session, onClose, onSaved }) {
  const panelRef = useRef(null);
  const inFlight = useRef(false);
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => createPaymentIdempotencyKey(`booking-code:${item.id}`));
  const [form, setForm] = useState({ entry_date: todayIso(), amount: String(item.expected_amount || ''), currency: item.currency || 'EUR', payment_method: '' });
  useBodyScrollLock(true);
  useDialogFocusTrap(true, panelRef, () => { if (!inFlight.current) onClose(); });

  async function load() {
    setLoading(true); setError('');
    try {
      const next = await getBookingCodePaymentState(item.id);
      setState(next);
      setForm((current) => ({ ...current, amount: next.balance > 0 ? String(next.balance) : '', currency: next.code.currency || current.currency }));
    } catch (err) { setError(err?.message || adminCopy(lang, 'Pagamenti non disponibili.', 'Payments unavailable.')); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [item.id]);

  async function save() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true); setError('');
    try {
      const result = await recordBookingCodePayment({ id: item.id, amount: form.amount, currency: form.currency, entryDate: form.entry_date, paymentMethod: form.payment_method, idempotencyKey, userId: session?.user?.id || null });
      trackEvent('booking_code_payment_recorded', { booking_code_id: item.id, code: item.code, payment_status: result.code?.payment_status || '' }, { dedupe: false });
      setIdempotencyKey(createPaymentIdempotencyKey(`booking-code:${item.id}`));
      await onSaved?.(adminCopy(lang, 'Pagamento registrato.', 'Payment recorded.'));
      onClose();
    } catch (err) { setError(err?.message || adminCopy(lang, 'Pagamento non registrato.', 'Payment not recorded.')); }
    finally { inFlight.current = false; setSaving(false); }
  }

  const agreed = state?.agreed ?? Number(item.expected_amount || 0);
  const paid = state?.paid ?? 0;
  const balance = state?.balance ?? Math.max(0, agreed - paid);
  return <div className="modal-backdrop" role="presentation"><section ref={panelRef} tabIndex={-1} className="admin-modal" role="dialog" aria-modal="true" aria-labelledby={`bookingCodePayment-${item.id}`}>
    <div className="admin-modal-header"><div><h2 id={`bookingCodePayment-${item.id}`}>{adminCopy(lang, 'Registra pagamento', 'Record payment')}</h2><p>{item.code} · {item.customer_name || '-'}</p></div><button className="icon-button" type="button" onClick={onClose} aria-label={text(lang, 'close')}>×</button></div>
    {loading ? <p>{adminCopy(lang, 'Caricamento pagamenti...', 'Loading payments...')}</p> : <>
      <div className="booking-payment-summary-grid modal-payment-summary"><span><small>{adminCopy(lang, 'Concordato', 'Agreed')}</small><strong>{formatMoney(agreed, form.currency, lang)}</strong></span><span><small>{adminCopy(lang, 'Incassato', 'Paid')}</small><strong>{formatMoney(paid, form.currency, lang)}</strong></span><span><small>{adminCopy(lang, 'Saldo', 'Balance')}</small><strong>{formatMoney(balance, form.currency, lang)}</strong></span><span><small>{adminCopy(lang, 'Stato', 'Status')}</small><strong>{state?.paymentStatus?.toUpperCase() || 'UNPAID'}</strong></span></div>
      {state?.recognized?.length > 0 && <div className="payment-history-list"><strong>{adminCopy(lang, 'Storico pagamenti', 'Payment history')}</strong>{state.recognized.map((entry) => <p className="small-note" key={entry.id}>{formatDateForMessage(entry.entry_date, lang) || '-'} · {entry.status === 'reversal' ? adminCopy(lang, 'Storno', 'Reversal') : adminCopy(lang, 'Pagamento', 'Payment')} · {formatMoney(entry.amount, entry.currency || form.currency, lang)} · {entry.payment_method || '-'}</p>)}</div>}
      {state?.expected?.length > 1 && <div className="admin-alert warning" role="alert">{adminCopy(lang, 'Più entrate attese sono collegate. Riconciliale in Finanze.', 'Multiple expected entries are linked. Reconcile them in Finance.')}</div>}
      {state?.expected?.length <= 1 && <div className="admin-form-grid request-income-confirm-grid"><AdminInput label={adminCopy(lang, 'Data pagamento', 'Payment date')} type="date" value={form.entry_date} onChange={(value) => setForm((current) => ({ ...current, entry_date: value }))} /><AdminInput label={adminCopy(lang, 'Importo effettivo', 'Actual amount')} type="number" inputMode="decimal" value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} /><AdminInput label={adminCopy(lang, 'Valuta', 'Currency')} value={form.currency} onChange={(value) => setForm((current) => ({ ...current, currency: normalizeCurrency(value) }))} /><AdminInput label={adminCopy(lang, 'Metodo di pagamento', 'Payment method')} value={form.payment_method} placeholder={adminCopy(lang, 'Contanti, bonifico, carta...', 'Cash, bank transfer, card...')} onChange={(value) => setForm((current) => ({ ...current, payment_method: value }))} /></div>}
      {balance === 0 && <p className="small-note">{adminCopy(lang, 'Saldo zero: un ulteriore pagamento verrà registrato come sovrappagamento esplicito.', 'Zero balance: an additional payment will be recorded as an explicit overpayment.')}</p>}
    </>}
    {error && <div className="admin-alert error" role="alert">{error}</div>}
    <div className="modal-actions">{!loading && state?.expected?.length <= 1 && <button className="button primary" type="button" onClick={save} disabled={saving}>{saving ? adminCopy(lang, 'Registrazione...', 'Recording...') : adminCopy(lang, 'Registra pagamento', 'Record payment')}</button>}<button className="button secondary" type="button" onClick={onClose} disabled={saving}>{adminCopy(lang, 'Chiudi', 'Close')}</button></div>
  </section></div>;
}

function BookingCodesPage({ lang, session, adminContent = {} }) {
  const [filters, setFilters] = useState(() => ({ status: 'all', search: consumeBookingCodeRequestSearch(), limit: 250 }));
  const { codes, loading, error, refresh } = useAdminBookingCodes(filters);
  const [bookingCodeOpen, setBookingCodeOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [actionError, setActionError] = useState('');

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  async function refreshWithFeedback(message = '') {
    await refresh();
    if (message) setFeedback(message);
  }

  async function copyCode(code) {
    await copyText(code);
    setFeedback(adminCopy(lang, 'Codice copiato.', 'Code copied.'));
  }

  async function cancelCode(item) {
    if (!window.confirm(adminCopy(lang, `Annullare il codice ${item.code}?`, `Cancel code ${item.code}?`))) return;
    setActionError('');
    setFeedback('');
    try {
      await cancelBookingCode(item.id, session.user.id);
      trackEvent('booking_code_cancelled', { booking_code_id: item.id, code: item.code }, { dedupe: false });
      await refreshWithFeedback(adminCopy(lang, 'Codice annullato.', 'Code cancelled.'));
    } catch (err) {
      setActionError(err?.message || adminCopy(lang, 'Codice non annullato.', 'Code not cancelled.'));
    }
  }

  async function runCodeAction(item, action) {
    setActionError('');
    setFeedback('');
    try {
      if (action === 'completed') {
        await markBookingCodeCompleted(item.id, session.user.id);
        trackEvent('booking_code_completed', { booking_code_id: item.id, code: item.code }, { dedupe: false });
        await refreshWithFeedback(adminCopy(lang, 'Esperienza segnata come completata.', 'Experience marked completed.'));
      }
      if (action === 'no-show') {
        if (!window.confirm(adminCopy(lang, `Segnare ${item.code} come no-show?`, `Mark ${item.code} as no-show?`))) return;
        await markBookingCodeNoShow(item.id, session.user.id);
        trackEvent('booking_code_no_show', { booking_code_id: item.id, code: item.code }, { dedupe: false });
        await refreshWithFeedback(adminCopy(lang, 'Codice segnato come no-show.', 'Code marked as no-show.'));
      }
    } catch (err) {
      setActionError(err?.message || adminCopy(lang, 'Azione non completata.', 'Action failed.'));
    }
  }

  const unusedCount = codes.filter((item) => item.status === 'unused').length;
  const redeemedCount = codes.filter((item) => item.status === 'redeemed').length;
  const codePaymentSummaries = codes.map((item) => paymentSummary(item.finance_entries || [], item.expected_amount, item.currency));
  const totalExpected = codePaymentSummaries.reduce((sum, item) => sum + Math.max(0, item.balance), 0);
  const confirmedIncome = codePaymentSummaries.reduce((sum, item) => sum + item.paid, 0);

  return (
    <section className="admin-page booking-codes-admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Codici prenotazione', 'Booking codes')}</span>
          <AdminEditableText as="h1" itemKey="admin.bookingCodes.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Codici prenotazione', 'Booking codes')} />
          <AdminEditableText as="p" itemKey="admin.bookingCodes.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Vedi i codici generati, controlla stato, cliente, esperienza, importo e collegamenti creati al momento dell’uso.', 'View generated codes, status, customer, experience, amount, and linked records created on redemption.')} />
        </div>
        <div className="admin-header-actions">
          <button className="button secondary" type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
          <button className="button primary" type="button" onClick={() => setBookingCodeOpen(true)}>{adminCopy(lang, 'Genera codice', 'Generate code')}</button>
        </div>
      </div>

      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {(error || actionError) && <div className="admin-alert error" role="alert">{error || actionError}</div>}

      <div className="admin-summary-grid booking-code-summary-grid">
        <SummaryCard label={adminCopy(lang, 'Totali caricati', 'Loaded total')} value={codes.length} />
        <SummaryCard label={adminCopy(lang, 'Non usati', 'Unused')} value={unusedCount} />
        <SummaryCard label={adminCopy(lang, 'Usati', 'Redeemed')} value={redeemedCount} />
        <SummaryCard label={adminCopy(lang, 'Importo previsto', 'Expected amount')} value={adminMoney(totalExpected, 'EUR', lang)} />
        <SummaryCard label={adminCopy(lang, 'Pagamenti registrati', 'Recorded payments')} value={adminMoney(confirmedIncome, 'EUR', lang)} helper={adminCopy(lang, 'Movimenti Finance registrati', 'Recorded Finance transactions')} />
      </div>

      <div className="admin-filter-bar booking-code-filter-bar">
        <input aria-label="Search booking codes" placeholder={adminCopy(lang, 'Cerca codice, cliente, email, telefono', 'Search code, customer, email, phone')} value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} />
        <select aria-label="Status" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
          <option value="all">{adminCopy(lang, 'Tutti gli stati', 'All statuses')}</option>
          {['unused', 'redeemed', 'expired', 'cancelled'].map((status) => <option key={status} value={status}>{bookingCodeStatusLabel(status, lang)}</option>)}
        </select>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>{adminCopy(lang, 'Codici generati', 'Generated codes')} · {codes.length}</h2>
          <button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
        </div>
        {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : codes.length === 0 ? <p>{adminCopy(lang, 'Nessun codice trovato.', 'No booking codes found.')}</p> : (
          <div className="booking-code-admin-list">
            {codes.map((item) => {
              const title = bookingCodeTitleForAdmin(item, lang);
              const mapsUrl = normalizeGoogleMapsUrl(item.meeting_point_maps_url);
              const codePayment = paymentSummary(item.finance_entries || [], item.expected_amount, item.currency);
              const paymentHistory = (item.finance_entries || []).filter((entry) => financeEntryIsRecognized(entry) && entry.type === 'income').sort((a,b) => String(b.entry_date || b.created_at || '').localeCompare(String(a.entry_date || a.created_at || '')));
              return (
                <article className={`booking-code-admin-card status-${item.status || 'unused'}`} key={item.id}>
                  <div className="booking-code-admin-card-head">
                    <div>
                      <button className="booking-code-copy-button" type="button" onClick={() => copyCode(item.code)} title={adminCopy(lang, 'Copia codice', 'Copy code')}>{item.code}</button>
                      <p className="small-note">{item.customer_name || '-'} · {item.customer_email || item.customer_phone || '-'}</p>
                    </div>
                    <span className={`status-pill ${item.status === 'redeemed' ? 'accepted' : item.status === 'cancelled' || item.status === 'expired' ? 'cancelled' : 'pending'}`}>{bookingCodeStatusLabel(item.status, lang)}</span>
                  </div>
                  <dl className="request-details-grid booking-code-details-grid">
                    <div><dt>{adminCopy(lang, 'Esperienza', 'Experience')}</dt><dd>{title}</dd></div>
                    <div><dt>{adminCopy(lang, 'Data', 'Date')}</dt><dd>{item.scheduled_date || '-'}{item.scheduled_time ? ` · ${item.scheduled_time}` : ''}</dd></div>
                    <div><dt>{adminCopy(lang, 'Importo', 'Amount')}</dt><dd>{adminMoney(item.expected_amount, item.currency, lang)}</dd></div>
                    <div><dt>{adminCopy(lang, 'Creato', 'Created')}</dt><dd>{formatLocalDateTime(item.created_at, lang, '-')}</dd></div>
                    <div><dt>{adminCopy(lang, 'Scadenza', 'Expiry')}</dt><dd>{formatLocalDateTime(item.expires_at, lang, item.expires_at || '-')}</dd></div>
                    <div><dt>{adminCopy(lang, 'Usato il', 'Redeemed at')}</dt><dd>{formatLocalDateTime(item.redeemed_at, lang, '-')}</dd></div>
                    <div><dt>{adminCopy(lang, 'Punto d’incontro', 'Meeting point')}</dt><dd>{mapsUrl ? <a className="inline-link" href={mapsUrl} target="_blank" rel="noopener noreferrer">{item.meeting_point_name || adminCopy(lang, 'Apri Maps', 'Open Maps')}</a> : (item.meeting_point_name || '-')}</dd></div>
                    <div><dt>{adminCopy(lang, 'Collegamenti', 'Links')}</dt><dd>{item.redeemed_booking_request_id ? adminCopy(lang, 'Richiesta creata', 'Request created') : '-'}{item.redeemed_finance_entry_id ? ` · ${adminCopy(lang, 'Finanza attesa', 'Expected finance')}` : ''}</dd></div>
                    <div><dt>{adminCopy(lang, 'Completamento', 'Completion')}</dt><dd>{bookingCodeStatusLabel(item.completion_status || 'not_completed', lang)}</dd></div>
                    <div><dt>{adminCopy(lang, 'Pagamento', 'Payment')}</dt><dd>{codePayment.status}</dd></div>
                  </dl>
                  <div className="booking-payment-summary compact"><div><span>{adminCopy(lang, 'Preventivo', 'Quoted')}</span><strong>{adminMoney(codePayment.agreed, codePayment.currency, lang)}</strong></div><div><span>{adminCopy(lang, 'Incassato', 'Paid')}</span><strong>{adminMoney(codePayment.paid, codePayment.currency, lang)}</strong></div><div><span>{adminCopy(lang, 'Saldo', 'Balance')}</span><strong>{adminMoney(codePayment.balance, codePayment.currency, lang)}</strong></div><span className={`status-pill ${codePayment.status.toLowerCase()}`}>{codePayment.status}</span></div>
                  {paymentHistory.length > 0 && <div className="payment-history-list"><strong>{adminCopy(lang, 'Pagamenti', 'Payments')}</strong>{paymentHistory.slice(0,4).map((entry) => <p className="small-note" key={entry.id}>{formatDateForMessage(entry.entry_date, lang) || '-'} · {adminMoney(entry.amount, entry.currency || item.currency, lang)} · {entry.payment_method || '-'}</p>)}</div>}
                  {item.status === 'redeemed' && codePayment.balance > 0 && <div className="admin-alert warning compact-alert">{adminCopy(lang, 'Codice usato: registra solo pagamenti realmente ricevuti, con data e metodo effettivi.', 'Code redeemed: record only payments actually received, with the actual date and method.')}</div>}
                  {item.admin_note && <p className="request-message"><strong>{adminCopy(lang, 'Nota interna', 'Internal note')}:</strong> {item.admin_note}</p>}
                  <ReviewRequestActions record={item} type="booking_code" lang={lang} session={session} onUpdated={(message) => refreshWithFeedback(message)} />
                  <ReferralActions record={item} type="booking_code" lang={lang} session={session} onUpdated={(message) => refreshWithFeedback(message)} />
                  <div className="admin-quick-actions">
                    <button type="button" onClick={() => copyCode(item.code)}>{adminCopy(lang, 'Copia codice', 'Copy code')}</button>
                    {item.status === 'unused' && <button type="button" onClick={() => cancelCode(item)}>{adminCopy(lang, 'Annulla codice', 'Cancel code')}</button>}
                    {item.status === 'redeemed' && item.completion_status !== 'completed' && <button type="button" onClick={() => runCodeAction(item, 'completed')}>{adminCopy(lang, 'Segna completato', 'Mark completed')}</button>}
                    {item.status === 'redeemed' && <button type="button" onClick={() => setPaymentTarget(item)}>{adminCopy(lang, 'Registra pagamento', 'Record payment')}</button>}
                    {item.status === 'redeemed' && item.income_status !== 'confirmed' && <button type="button" onClick={() => runCodeAction(item, 'no-show')}>{adminCopy(lang, 'No-show', 'No-show')}</button>}
                    {item.status === 'redeemed' && <button type="button" onClick={() => cancelCode(item)}>{adminCopy(lang, 'Annulla', 'Cancel')}</button>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <ReferralCodesPanel lang={lang} session={session} />

      {paymentTarget && <BookingCodePaymentDialog item={paymentTarget} lang={lang} session={session} onClose={() => setPaymentTarget(null)} onSaved={refreshWithFeedback} />}
      {bookingCodeOpen && <AdminBookingCodeModal lang={lang} session={session} onClose={() => setBookingCodeOpen(false)} onSaved={(code) => { setBookingCodeOpen(false); refreshWithFeedback(adminCopy(lang, `Codice creato: ${code}`, `Code created: ${code}`)); }} />}
    </section>
  );
}

function RequestsPage({ lang, session, navigate, adminContent = {} }) {
  const [filters, setFilters] = useState({ status: 'pending', experience_id: 'all', source: 'all', search: '', fromDate: '', toDate: '', limit: 250 });
  const { requests, counts, loading, error, refresh } = useAdminRequests(filters);
  const [manualOpen, setManualOpen] = useState(false);
  const [bookingCodeOpen, setBookingCodeOpen] = useState(false);
  const [decision, setDecision] = useState(null);
  const [feedback, setFeedback] = useState('');

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  async function refreshWithFeedback(message = '') {
    await refresh();
    if (message) setFeedback(message);
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Gestione richieste', 'Request management')}</span>
          <AdminEditableText as="h1" itemKey="admin.requests.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Richieste', 'Requests')} />
          <AdminEditableText as="p" itemKey="admin.requests.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Cerca e filtra richieste da sito, WhatsApp, telefono o email.', 'Search and filter requests from the website, WhatsApp, phone, or email.')} />
        </div>
        <div className="admin-header-actions">
          <button className="button secondary" type="button" onClick={() => setBookingCodeOpen(true)}>{adminCopy(lang, 'Genera codice', 'Generate code')}</button>
          <button className="button primary" type="button" onClick={() => setManualOpen(true)}>{adminCopy(lang, 'Aggiungi manuale', 'Add manual')}</button>
        </div>
      </div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      <div className="admin-filter-bar">
        <input aria-label="Search" placeholder={adminCopy(lang, 'Cerca nome, telefono, email', 'Search name, phone, email')} value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} />
        <select aria-label="Status" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="all">{adminCopy(lang, 'Tutti gli stati', 'All statuses')}</option>{REQUEST_STATUSES.map((status) => <option key={status} value={status}>{requestStatusLabels[status][lang]}</option>)}</select>
        <select aria-label="Experience" value={filters.experience_id} onChange={(event) => updateFilter('experience_id', event.target.value)}><option value="all">{adminCopy(lang, 'Tutte le esperienze', 'All experiences')}</option>{ADMIN_EXPERIENCE_OPTIONS.map((id) => <option key={id} value={id}>{adminExperienceLabel(id, lang)}</option>)}</select>
        <select aria-label="Source" value={filters.source} onChange={(event) => updateFilter('source', event.target.value)}><option value="all">{adminCopy(lang, 'Tutte le fonti', 'All sources')}</option>{REQUEST_SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}</select>
        <input aria-label="From date" type="date" value={filters.fromDate} onChange={(event) => updateFilter('fromDate', event.target.value)} />
        <input aria-label="To date" type="date" value={filters.toDate} onChange={(event) => updateFilter('toDate', event.target.value)} />
      </div>
      <RequestsCrmDashboard requests={requests} lang={lang} />
      <section className="admin-panel">
        <div className="admin-panel-header"><h2><AdminEditableText itemKey="admin.requests.results.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Risultati', 'Results')} /> · {counts?.total ?? '—'}</h2><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
        {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : requests.length === 0 ? <p>{adminCopy(lang, 'Nessuna richiesta trovata.', 'No requests found.')}</p> : (
          <RequestStatusAccordions
            requests={requests}
            lang={lang}
            onApprove={(request) => setDecision({ type: 'approve', request })}
            onDecline={(request) => setDecision({ type: 'decline', request })}
            onRemove={(request) => setDecision({ type: 'remove', request })}
            onUpdated={(message) => refreshWithFeedback(message)}
            session={session}
            navigate={navigate}
          />
        )}
      </section>
      {decision && <DecisionModal lang={lang} session={session} decision={decision} onClose={() => setDecision(null)} onDone={(message) => { setDecision(null); refreshWithFeedback(message); }} />}
      {manualOpen && <ManualRequestModal lang={lang} session={session} onClose={() => setManualOpen(false)} onSaved={() => { setManualOpen(false); refreshWithFeedback(adminCopy(lang, 'Richiesta manuale creata.', 'Manual request created.')); }} />}
      {bookingCodeOpen && <AdminBookingCodeModal lang={lang} session={session} onClose={() => setBookingCodeOpen(false)} onSaved={(code) => { setBookingCodeOpen(false); refreshWithFeedback(adminCopy(lang, `Codice creato: ${code}`, `Code created: ${code}`)); }} />}
    </section>
  );
}

function isValidOptionalUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function PartnershipsAdminPage({ lang, session, adminContent = {} }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const emptyForm = { name: '', category_key: 'other', category_it: 'Altro', category_en: 'Other', description_it: '', description_en: '', website_url: '', google_maps_url: '', social_url: '', image_url: '', image_path: '', image_name: '', image_type: '', imageFile: null, display_order: '0', active: true, commission_enabled: false, commission_type: 'none', commission_value: '', commission_currency: 'EUR', commission_applies_to: 'revenue_confirmed', commission_notes: '', commission_status: 'inactive' };
  const [form, setForm] = useState(emptyForm);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const data = await listPartnerships({ activeOnly: false });
      setItems(data);
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Collaborazioni non caricate.', 'Could not load partnerships.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setFeedback('');
    if (!form.name.trim()) {
      setError(adminCopy(lang, 'Il nome è obbligatorio.', 'Name is required.'));
      return;
    }
    if (!isValidOptionalUrl(form.website_url) || !isValidOptionalUrl(form.google_maps_url) || !isValidOptionalUrl(form.social_url) || (!form.imageFile && !isValidOptionalUrl(form.image_url))) {
      setError(adminCopy(lang, 'Inserisci URL validi che iniziano con http o https.', 'Enter valid URLs starting with http or https.'));
      return;
    }
    if (form.commission_enabled && (form.commission_type === 'none' || parseMoneyAmount(form.commission_value) <= 0 || (form.commission_type === 'percentage' && parseMoneyAmount(form.commission_value) > 100))) {
      setError(adminCopy(lang, 'Configura una commissione valida: tipo, valore positivo e percentuale massimo 100%.', 'Configure a valid commission: type, positive value, and percentage max 100%.'));
      return;
    }
    try {
      const imagePayload = form.imageFile ? await uploadPartnershipImage(form.imageFile, session.user.id) : {};
      const { imageFile, ...payload } = form;
      await createPartnership({ ...payload, ...partnershipCategoryLabelsForKey(form.category_key), ...imagePayload, created_by: session.user.id, updated_by: session.user.id });
      setForm(emptyForm);
      setFeedback(adminCopy(lang, 'Collaborazione creata.', 'Partnership created.'));
      refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Collaborazione non salvata.', 'Partnership not saved.'));
    }
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Partnership pubbliche', 'Public partnerships')}</span>
          <AdminEditableText as="h1" itemKey="admin.partnerships.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Collaborazioni', 'Partnerships')} />
          <AdminEditableText as="p" itemKey="admin.partnerships.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Crea, modifica e disattiva le collaborazioni visibili sul sito pubblico.', 'Create, edit, and deactivate collaborations visible on the public website.')} />
        </div>
      </div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      <div className="admin-two-column availability-columns">
        <section className="admin-panel">
          <AdminEditableText as="h2" itemKey="admin.partnerships.create.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Crea collaborazione', 'Create partnership')} />
          <form className="admin-form-grid" onSubmit={submit}>
            <AdminInput label={adminCopy(lang, 'Nome', 'Name')} value={form.name} onChange={(value) => update('name', value)} />
            <label className="admin-field"><span>{adminCopy(lang, 'Categoria', 'Category')}</span><select value={form.category_key} onChange={(event) => update('category_key', event.target.value)}>{PARTNERSHIP_CATEGORIES.map((category) => <option value={category.key} key={category.key}>{partnershipCategoryLabel(category.key, lang)}</option>)}</select></label>
            <label className="admin-field full"><span>Description IT</span><textarea value={form.description_it} onChange={(event) => update('description_it', event.target.value)} rows={3} /></label>
            <label className="admin-field full"><span>Description EN</span><textarea value={form.description_en} onChange={(event) => update('description_en', event.target.value)} rows={3} /></label>
            <AdminInput label="Website URL" value={form.website_url} onChange={(value) => update('website_url', value)} />
            <AdminInput label={adminCopy(lang, 'Google Maps URL opzionale', 'Optional Google Maps URL')} value={form.google_maps_url} onChange={(value) => update('google_maps_url', value)} />
            <AdminInput label={adminCopy(lang, 'Instagram/social URL opzionale', 'Optional Instagram/social URL')} value={form.social_url} onChange={(value) => update('social_url', value)} />
            <AdminInput label={adminCopy(lang, 'URL immagine opzionale', 'Optional image URL')} value={form.image_url} onChange={(value) => update('image_url', value)} />
            <label className="admin-field full"><span>{adminCopy(lang, 'Immagine collaborazione', 'Partnership image')}</span><input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => update('imageFile', event.target.files?.[0] || null)} /></label>
            {form.imageFile && <p className="small-note full">{adminCopy(lang, 'File selezionato', 'Selected file')}: {form.imageFile.name}</p>}
            <AdminInput label={adminCopy(lang, 'Ordine', 'Display order')} type="number" value={form.display_order} onChange={(value) => update('display_order', value)} />
            <label className="check-field"><input type="checkbox" checked={form.active} onChange={(event) => update('active', event.target.checked)} /> {adminCopy(lang, 'Attiva', 'Active')}</label>
            <label className="check-field full"><input type="checkbox" checked={form.commission_enabled} onChange={(event) => { update('commission_enabled', event.target.checked); update('commission_status', event.target.checked ? 'active' : 'inactive'); update('commission_type', event.target.checked && form.commission_type === 'none' ? 'percentage' : form.commission_type); }} /> {adminCopy(lang, 'Abilita commissioni partner', 'Enable partner commissions')}</label>
            {form.commission_enabled && <>
              <AdminSelect label={adminCopy(lang, 'Tipo commissione', 'Commission type')} value={form.commission_type} onChange={(value) => update('commission_type', value)} options={['fixed_amount', 'percentage']} formatter={(value) => partnerCommissionTypeLabel(value, lang)} />
              <AdminInput label={adminCopy(lang, 'Valore commissione', 'Commission value')} type="number" value={form.commission_value} onChange={(value) => update('commission_value', value)} />
              <AdminInput label={adminCopy(lang, 'Valuta', 'Currency')} value={form.commission_currency} onChange={(value) => update('commission_currency', normalizeCurrency(value))} />
              <AdminSelect label={adminCopy(lang, 'Si applica a', 'Applies to')} value={form.commission_applies_to} onChange={(value) => update('commission_applies_to', value)} options={['request_created', 'booking_confirmed', 'revenue_confirmed']} formatter={(value) => partnerCommissionAppliesToLabel(value, lang)} />
              <label className="admin-field full"><span>{adminCopy(lang, 'Note interne commissione', 'Internal commission notes')}</span><textarea rows={2} value={form.commission_notes} onChange={(event) => update('commission_notes', event.target.value)} /></label>
              <p className="small-note full">{adminCopy(lang, 'Le commissioni sono interne e non vengono mostrate sul sito pubblico.', 'Commissions are internal and are not shown on the public website.')}</p>
            </>}
            <div className="modal-actions full"><button className="button primary" type="submit">{adminCopy(lang, 'Salva collaborazione', 'Save partnership')}</button></div>
          </form>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.partnerships.saved.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Collaborazioni salvate', 'Saved partnerships')} /><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
          {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : items.length === 0 ? <p>{adminCopy(lang, 'Nessuna collaborazione salvata.', 'No partnerships saved.')}</p> : (
            <div className="availability-block-list">
              {items.map((item) => <PartnershipAdminCard key={item.id} item={item} lang={lang} userId={session.user.id} onChanged={(message) => { setFeedback(message); refresh(); }} />)}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function PartnershipAdminCard({ item, lang, userId, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: item.name || '',
    category_key: partnershipCategoryKey(item),
    category_it: item.category_it || partnershipCategoryLabel(partnershipCategoryKey(item), 'it'),
    category_en: item.category_en || partnershipCategoryLabel(partnershipCategoryKey(item), 'en'),
    description_it: item.description_it || '',
    description_en: item.description_en || '',
    website_url: item.website_url || '',
    google_maps_url: item.google_maps_url || '',
    social_url: item.social_url || '',
    image_url: item.image_url || '',
    image_path: item.image_path || '',
    image_name: item.image_name || '',
    image_type: item.image_type || '',
    imageFile: null,
    removeImage: false,
    display_order: String(item.display_order || 0),
    active: item.active !== false,
    commission_enabled: item.commission_enabled === true,
    commission_type: item.commission_type || 'none',
    commission_value: item.commission_value ?? '',
    commission_currency: item.commission_currency || 'EUR',
    commission_applies_to: item.commission_applies_to || 'revenue_confirmed',
    commission_notes: item.commission_notes || '',
    commission_status: item.commission_status || (item.commission_enabled ? 'active' : 'inactive')
  });
  const [error, setError] = useState('');

  async function save() {
    setError('');
    if (!form.name.trim()) {
      setError(adminCopy(lang, 'Il nome è obbligatorio.', 'Name is required.'));
      return;
    }
    if (!isValidOptionalUrl(form.website_url) || !isValidOptionalUrl(form.google_maps_url) || !isValidOptionalUrl(form.social_url) || (!form.imageFile && !form.removeImage && !isValidOptionalUrl(form.image_url))) {
      setError(adminCopy(lang, 'URL non valido.', 'Invalid URL.'));
      return;
    }
    if (form.commission_enabled && (form.commission_type === 'none' || parseMoneyAmount(form.commission_value) <= 0 || (form.commission_type === 'percentage' && parseMoneyAmount(form.commission_value) > 100))) {
      setError(adminCopy(lang, 'Configura una commissione valida: tipo, valore positivo e percentuale massimo 100%.', 'Configure a valid commission: type, positive value, and percentage max 100%.'));
      return;
    }
    try {
      let imagePayload = {};
      if (form.imageFile) {
        imagePayload = await uploadPartnershipImage(form.imageFile, userId);
        if (item.image_path) await removePartnershipImage(item.image_path);
      } else if (form.removeImage) {
        if (item.image_path) await removePartnershipImage(item.image_path);
        imagePayload = { image_url: null, image_path: null, image_name: null, image_type: null };
      }
      const { imageFile, removeImage, ...payload } = form;
      await updatePartnership(item.id, { ...payload, ...partnershipCategoryLabelsForKey(form.category_key), ...imagePayload, updated_by: userId });
      setEditing(false);
      onChanged(adminCopy(lang, 'Collaborazione aggiornata.', 'Partnership updated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Aggiornamento non riuscito.', 'Update failed.'));
    }
  }

  async function deactivate() {
    setError('');
    try {
      await deactivatePartnership(item.id, userId);
      onChanged(adminCopy(lang, 'Collaborazione disattivata.', 'Partnership deactivated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Disattivazione non riuscita.', 'Deactivate failed.'));
    }
  }

  return (
    <article className={`availability-block-card ${item.active ? '' : 'inactive'}`}>
      <div className="request-card-head">
        <div><h3>{item.name}</h3><p>{lang === 'it' ? item.category_it || item.category_en : item.category_en || item.category_it}</p></div>
        <span className={`status-pill ${item.active ? 'accepted' : 'cancelled'}`}>{item.active ? adminCopy(lang, 'Attiva', 'Active') : adminCopy(lang, 'Inattiva', 'Inactive')}</span>
      </div>
      {editing ? (
        <div className="admin-form-grid single-card-form">
          <AdminInput label={adminCopy(lang, 'Nome', 'Name')} value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
          <label className="admin-field"><span>{adminCopy(lang, 'Categoria', 'Category')}</span><select value={form.category_key} onChange={(event) => setForm((current) => ({ ...current, category_key: event.target.value }))}>{PARTNERSHIP_CATEGORIES.map((category) => <option value={category.key} key={category.key}>{partnershipCategoryLabel(category.key, lang)}</option>)}</select></label>
          <label className="admin-field full"><span>Description IT</span><textarea value={form.description_it} onChange={(event) => setForm((current) => ({ ...current, description_it: event.target.value }))} rows={3} /></label>
          <label className="admin-field full"><span>Description EN</span><textarea value={form.description_en} onChange={(event) => setForm((current) => ({ ...current, description_en: event.target.value }))} rows={3} /></label>
          <AdminInput label="Website URL" value={form.website_url} onChange={(value) => setForm((current) => ({ ...current, website_url: value }))} />
          <AdminInput label={adminCopy(lang, 'Google Maps URL opzionale', 'Optional Google Maps URL')} value={form.google_maps_url} onChange={(value) => setForm((current) => ({ ...current, google_maps_url: value }))} />
          <AdminInput label={adminCopy(lang, 'Instagram/social URL opzionale', 'Optional Instagram/social URL')} value={form.social_url} onChange={(value) => setForm((current) => ({ ...current, social_url: value }))} />
          <AdminInput label={adminCopy(lang, 'URL immagine', 'Image URL')} value={form.image_url} onChange={(value) => setForm((current) => ({ ...current, image_url: value }))} />
          <label className="admin-field full"><span>{adminCopy(lang, 'Sostituisci immagine', 'Replace image')}</span><input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => setForm((current) => ({ ...current, imageFile: event.target.files?.[0] || null, removeImage: false }))} /></label>
          {form.image_url && !form.removeImage && <p className="small-note full"><a href={form.image_url} target="_blank" rel="noopener noreferrer">{form.image_name || adminCopy(lang, 'Immagine esistente', 'Existing image')}</a> <button type="button" className="inline-danger-button" onClick={() => setForm((current) => ({ ...current, removeImage: true, imageFile: null }))}>{adminCopy(lang, 'Rimuovi immagine', 'Remove image')}</button></p>}
          {form.imageFile && <p className="small-note full">{adminCopy(lang, 'Nuovo file', 'New file')}: {form.imageFile.name}</p>}
          <AdminInput label={adminCopy(lang, 'Ordine', 'Display order')} type="number" value={form.display_order} onChange={(value) => setForm((current) => ({ ...current, display_order: value }))} />
          <label className="check-field"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> {adminCopy(lang, 'Attiva', 'Active')}</label>
          <label className="check-field full"><input type="checkbox" checked={form.commission_enabled} onChange={(event) => setForm((current) => ({ ...current, commission_enabled: event.target.checked, commission_status: event.target.checked ? 'active' : 'inactive', commission_type: event.target.checked && current.commission_type === 'none' ? 'percentage' : current.commission_type }))} /> {adminCopy(lang, 'Abilita commissioni partner', 'Enable partner commissions')}</label>
          {form.commission_enabled && <>
            <AdminSelect label={adminCopy(lang, 'Tipo commissione', 'Commission type')} value={form.commission_type} onChange={(value) => setForm((current) => ({ ...current, commission_type: value }))} options={['fixed_amount', 'percentage']} formatter={(value) => partnerCommissionTypeLabel(value, lang)} />
            <AdminInput label={adminCopy(lang, 'Valore commissione', 'Commission value')} type="number" value={form.commission_value} onChange={(value) => setForm((current) => ({ ...current, commission_value: value }))} />
            <AdminInput label={adminCopy(lang, 'Valuta', 'Currency')} value={form.commission_currency} onChange={(value) => setForm((current) => ({ ...current, commission_currency: normalizeCurrency(value) }))} />
            <AdminSelect label={adminCopy(lang, 'Si applica a', 'Applies to')} value={form.commission_applies_to} onChange={(value) => setForm((current) => ({ ...current, commission_applies_to: value }))} options={['request_created', 'booking_confirmed', 'revenue_confirmed']} formatter={(value) => partnerCommissionAppliesToLabel(value, lang)} />
            <label className="admin-field full"><span>{adminCopy(lang, 'Note interne commissione', 'Internal commission notes')}</span><textarea rows={2} value={form.commission_notes} onChange={(event) => setForm((current) => ({ ...current, commission_notes: event.target.value }))} /></label>
            <p className="small-note full">{adminCopy(lang, 'Le commissioni sono interne e non vengono mostrate sul sito pubblico.', 'Commissions are internal and are not shown on the public website.')}</p>
          </>}
          {error && <div className="admin-alert error full">{error}</div>}
          <div className="modal-actions full"><button className="button primary" type="button" onClick={save}>{adminCopy(lang, 'Salva', 'Save')}</button><button className="button secondary" type="button" onClick={() => setEditing(false)}>{adminCopy(lang, 'Annulla', 'Cancel')}</button></div>
        </div>
      ) : (
        <>
          {item.image_url && <img className="admin-card-preview-image" src={item.image_url} alt={item.name} />}
          {(item.description_it || item.description_en) && <FormattedText textValue={lang === 'it' ? item.description_it || item.description_en : item.description_en || item.description_it} className="formatted-text admin-partnership-preview-text" />}
          <p className="small-note">{item.website_url || '-'} · {item.google_maps_url ? 'Google Maps' : adminCopy(lang, 'Nessuna mappa', 'No map')} · {item.social_url ? 'Social' : adminCopy(lang, 'Nessun social', 'No social')} · {item.image_name || adminCopy(lang, 'Nessuna immagine', 'No image')} · {adminCopy(lang, 'Ordine', 'Order')} {item.display_order}</p>
          <p className="small-note"><strong>{adminCopy(lang, 'Commissioni', 'Commissions')}:</strong> {item.commission_enabled ? `${partnerCommissionRuleLabel(item, lang)} · ${partnerCommissionAppliesToLabel(item.commission_applies_to, lang)}` : adminCopy(lang, 'Disabilitate', 'Disabled')}</p>
          {error && <div className="admin-alert error">{error}</div>}
          <div className="request-actions"><button className="button secondary" type="button" onClick={() => setEditing(true)}>{adminCopy(lang, 'Modifica', 'Edit')}</button>{item.active && <button className="button secondary" type="button" onClick={deactivate}>{adminCopy(lang, 'Disattiva', 'Deactivate')}</button>}</div>
        </>
      )}
    </article>
  );
}

function AvailabilityPage({ lang, session, adminContent = {} }) {
  const [tab, setTab] = useState('blocks');
  const [blocks, setBlocks] = useState([]);
  const [fixedExcursions, setFixedExcursions] = useState([]);
  const [leaflets, setLeaflets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [form, setForm] = useState({ date: '', experience_id: '', status: 'closed', reason_it: '', reason_en: '', internal_note: '' });
  const emptyFixedForm = { date: '', start_time: '', end_time: '', experience_id: 'etna-live', leaflet_id: '', title_it: '', title_en: '', description_it: '', description_en: '', program_it: '', program_en: '', meeting_point_it: '', meeting_point_en: '', meeting_point_maps_url: '', difficulty_it: '', difficulty_en: '', price_note_it: '', price_note_en: '', leafletFileIt: null, leafletFileEn: null, capacity: '12', active: true };
  const emptyLeafletForm = { month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()), title_it: '', title_en: '', description_it: '', description_en: '', notes_it: '', notes_en: '', file_it: null, file_en: null, active: true };
  const [fixedForm, setFixedForm] = useState(emptyFixedForm);
  const [leafletForm, setLeafletForm] = useState(emptyLeafletForm);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [blockData, fixedData, leafletData] = await Promise.all([
        listAvailabilityBlocks({ activeOnly: false }),
        listFixedExcursions({ activeOnly: false }),
        listMonthlyLeaflets({ activeOnly: false })
      ]);
      setBlocks(blockData);
      setFixedExcursions(fixedData);
      setLeaflets(leafletData);
    } catch (err) {
      setError(err?.message || 'Could not load calendar data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateFixed(field, value) {
    setFixedForm((current) => ({ ...current, [field]: value }));
  }

  function updateLeaflet(field, value) {
    setLeafletForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setFeedback('');
    if (!form.date || !form.status) {
      setError(adminCopy(lang, 'Data e stato sono obbligatori.', 'Date and status are required.'));
      return;
    }
    try {
      await createAvailabilityBlock({ ...form, created_by: session.user.id, updated_by: session.user.id });
      setForm({ date: '', experience_id: '', status: 'closed', reason_it: '', reason_en: '', internal_note: '' });
      setFeedback(adminCopy(lang, 'Disponibilità aggiornata.', 'Availability updated.'));
      refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Blocco non salvato.', 'Block not saved.'));
    }
  }

  async function submitFixed(event) {
    event.preventDefault();
    setError('');
    setFeedback('');
    if (!fixedForm.date || !fixedForm.experience_id) {
      setError(adminCopy(lang, 'Data ed esperienza sono obbligatorie.', 'Date and experience are required.'));
      return;
    }
    if (Number.parseInt(fixedForm.capacity || '0', 10) < 1) {
      setError(adminCopy(lang, 'La capienza deve essere almeno 1.', 'Capacity must be at least 1.'));
      return;
    }
    if (!fixedForm.title_it.trim() && !fixedForm.title_en.trim()) {
      setError(adminCopy(lang, 'Inserisci almeno un titolo in italiano o inglese.', 'Enter at least one Italian or English title.'));
      return;
    }
    if (!fixedForm.leafletFileIt || !fixedForm.leafletFileEn) {
      setError(adminCopy(lang, 'Carica il volantino italiano e il volantino inglese per questa escursione fissa.', 'Upload both the Italian and English leaflet for this fixed excursion.'));
      return;
    }
    try {
      const filePayloadIt = await uploadFixedExcursionLeafletFile(fixedForm.leafletFileIt, session.user.id, 'it');
      const filePayloadEn = await uploadFixedExcursionLeafletFile(fixedForm.leafletFileEn, session.user.id, 'en');
      const legacyItalianPayload = {
        blocked_dates_file_url: filePayloadIt.leaflet_file_url_it,
        blocked_dates_file_path: filePayloadIt.leaflet_file_path_it,
        blocked_dates_file_name: filePayloadIt.leaflet_file_name_it,
        blocked_dates_file_type: filePayloadIt.leaflet_file_type_it
      };
      const { leafletFileIt, leafletFileEn, ...fixedPayload } = fixedForm;
      await createFixedExcursion({ ...fixedPayload, ...legacyItalianPayload, ...filePayloadIt, ...filePayloadEn, created_by: session.user.id, updated_by: session.user.id });
      setFixedForm({ ...emptyFixedForm });
      setFeedback(adminCopy(lang, 'Escursione fissa creata.', 'Fixed excursion created.'));
      refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Escursione fissa non salvata.', 'Fixed excursion not saved.'));
    }
  }


  async function submitLeaflet(event) {
    event.preventDefault();
    setError('');
    setFeedback('');
    if (!leafletForm.month || !leafletForm.year) {
      setError(adminCopy(lang, 'Mese e anno sono obbligatori.', 'Month and year are required.'));
      return;
    }
    if (!leafletForm.file_it || !leafletForm.file_en) {
      setError(adminCopy(lang, 'Carica il volantino italiano e il volantino inglese.', 'Upload both the Italian leaflet and the English leaflet.'));
      return;
    }
    try {
      const monthlyStorageKey = `${leafletForm.year}-${String(leafletForm.month).padStart(2, '0')}`;
      const filePayloadIt = await uploadMonthlyLeafletFile(leafletForm.file_it, session.user.id, 'it', monthlyStorageKey);
      const filePayloadEn = await uploadMonthlyLeafletFile(leafletForm.file_en, session.user.id, 'en', monthlyStorageKey);
      const legacyItalianPayload = {
        file_url: filePayloadIt.leaflet_file_url_it,
        file_path: filePayloadIt.leaflet_file_path_it,
        file_name: filePayloadIt.leaflet_file_name_it,
        file_type: filePayloadIt.leaflet_file_type_it
      };
      const { file_it, file_en, ...leafletPayload } = leafletForm;
      await createMonthlyLeaflet({ ...leafletPayload, ...legacyItalianPayload, ...filePayloadIt, ...filePayloadEn, created_by: session.user.id, updated_by: session.user.id });
      setLeafletForm({ ...emptyLeafletForm, month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()) });
      setFeedback(adminCopy(lang, 'Calendario mensile caricato.', 'Monthly leaflet uploaded.'));
      refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Calendario mensile non salvato.', 'Monthly leaflet not saved.'));
    }
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Calendario pubblico', 'Public calendar')}</span>
          <AdminEditableText as="h1" itemKey="admin.availability.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Disponibilità', 'Availability')} />
          <AdminEditableText as="p" itemKey="admin.availability.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Gestisci disponibilità privata e date fisse prenotabili fino a 12 persone.', 'Manage private availability and fixed excursion dates bookable up to 12 people.')} />
        </div>
      </div>
      <div className="mode-toggle admin-tabs" role="tablist" aria-label="Calendar admin tabs">
        <button type="button" className={tab === 'blocks' ? 'active' : ''} onClick={() => setTab('blocks')}>{adminCopy(lang, 'Blocchi disponibilità', 'Availability blocks')}</button>
        <button type="button" className={tab === 'fixed' ? 'active' : ''} onClick={() => setTab('fixed')}>{adminCopy(lang, 'Escursioni fisse', 'Fixed excursions')}</button>
        <button type="button" className={tab === 'leaflets' ? 'active' : ''} onClick={() => setTab('leaflets')}>{adminCopy(lang, 'Calendari mensili', 'Monthly leaflets')}</button>
      </div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}

      {tab === 'blocks' ? (
        <div className="admin-two-column availability-columns">
          <section className="admin-panel">
            <AdminEditableText as="h2" itemKey="admin.availability.addBlock.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Aggiungi blocco disponibilità', 'Add availability block')} />
            <form className="admin-form-grid" onSubmit={submit}>
              <AdminInput label={adminCopy(lang, 'Data', 'Date')} type="date" min={todayIso()} value={form.date} onChange={(value) => update('date', value)} />
              <AdminSelect label={adminCopy(lang, 'Ambito', 'Scope')} value={form.experience_id} onChange={(value) => update('experience_id', value)} options={['', 'etna-premium', 'etna-learning', 'etna-live', 'etna-stories']} formatter={(value) => value ? adminExperienceLabel(value, lang) : adminCopy(lang, 'Tutte le esperienze', 'All experiences')} />
              <AdminSelect label={adminCopy(lang, 'Stato', 'Status')} value={form.status} onChange={(value) => update('status', value)} options={AVAILABILITY_STATUSES} formatter={(value) => adminAvailabilityStatusLabels[value][lang]} />
              <AdminInput label="Reason IT" value={form.reason_it || defaultReason(form.status, 'it')} onChange={(value) => update('reason_it', value)} />
              <AdminInput label="Reason EN" value={form.reason_en || defaultReason(form.status, 'en')} onChange={(value) => update('reason_en', value)} />
              <label className="admin-field full"><span>{adminCopy(lang, 'Nota interna', 'Internal note')}</span><textarea value={form.internal_note} onChange={(event) => update('internal_note', event.target.value)} rows={3} /></label>
              <div className="modal-actions full"><button className="button primary" type="submit">{adminCopy(lang, 'Salva blocco', 'Save block')}</button></div>
            </form>
          </section>
          <section className="admin-panel">
            <div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.availability.existingBlocks.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Blocchi esistenti', 'Existing blocks')} /><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
            {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : blocks.length === 0 ? <p>{adminCopy(lang, 'Nessun blocco salvato.', 'No saved blocks.')}</p> : (
              <div className="availability-block-list">
                {blocks.filter((block) => block.active !== false).map((block) => <AvailabilityBlockCard key={block.id} block={block} lang={lang} userId={session.user.id} onChanged={(message) => { setFeedback(message); refresh(); }} />)}
                <details className="admin-archive-details">
                  <summary><span>{adminCopy(lang, 'Archivio', 'Archive')}</span><strong>{blocks.filter((block) => block.active === false).length}</strong></summary>
                  {blocks.filter((block) => block.active === false).length === 0 ? <p className="small-note">{adminCopy(lang, 'Nessun blocco archiviato.', 'No archived blocks.')}</p> : blocks.filter((block) => block.active === false).map((block) => <AvailabilityBlockCard key={block.id} block={block} lang={lang} userId={session.user.id} onChanged={(message) => { setFeedback(message); refresh(); }} />)}
                </details>
              </div>
            )}
          </section>
        </div>
      ) : tab === 'leaflets' ? (
        <div className="admin-two-column availability-columns">
          <section className="admin-panel">
            <h2>{adminCopy(lang, 'Aggiungi calendario mensile', 'Add monthly leaflet')}</h2>
            <p className="small-note">{adminCopy(lang, 'Carica un PDF o immagine mensile e poi collega le date fisse dal tab Escursioni fisse.', 'Upload a monthly PDF or image, then link fixed dates from the Fixed excursions tab.')}</p>
            <form className="admin-form-grid" onSubmit={submitLeaflet}>
              <AdminInput label={adminCopy(lang, 'Mese', 'Month')} type="number" value={leafletForm.month} onChange={(value) => updateLeaflet('month', value)} />
              <AdminInput label={adminCopy(lang, 'Anno', 'Year')} type="number" value={leafletForm.year} onChange={(value) => updateLeaflet('year', value)} />
              <AdminInput label="Title IT" value={leafletForm.title_it} onChange={(value) => updateLeaflet('title_it', value)} />
              <AdminInput label="Title EN" value={leafletForm.title_en} onChange={(value) => updateLeaflet('title_en', value)} />
              <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione programma IT', 'Programme description IT')}</span><textarea value={leafletForm.description_it} onChange={(event) => updateLeaflet('description_it', event.target.value)} rows={4} /></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione programma EN', 'Programme description EN')}</span><textarea value={leafletForm.description_en} onChange={(event) => updateLeaflet('description_en', event.target.value)} rows={4} /></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'Note programma IT', 'Programme notes IT')}</span><textarea value={leafletForm.notes_it} onChange={(event) => updateLeaflet('notes_it', event.target.value)} rows={2} /></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'Note programma EN', 'Programme notes EN')}</span><textarea value={leafletForm.notes_en} onChange={(event) => updateLeaflet('notes_en', event.target.value)} rows={2} /></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'Volantino italiano obbligatorio', 'Required Italian leaflet')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => updateLeaflet('file_it', event.target.files?.[0] || null)} required /></label>
              {leafletForm.file_it && <p className="small-note full">{adminCopy(lang, 'File italiano selezionato', 'Selected Italian file')}: {leafletForm.file_it.name}</p>}
              <label className="admin-field full"><span>{adminCopy(lang, 'Volantino inglese obbligatorio', 'Required English leaflet')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => updateLeaflet('file_en', event.target.files?.[0] || null)} required /></label>
              {leafletForm.file_en && <p className="small-note full">{adminCopy(lang, 'File inglese selezionato', 'Selected English file')}: {leafletForm.file_en.name}</p>}
              <label className="check-field"><input type="checkbox" checked={leafletForm.active} onChange={(event) => updateLeaflet('active', event.target.checked)} /> {adminCopy(lang, 'Attivo', 'Active')}</label>
              <div className="modal-actions full"><button className="button primary" type="submit">{adminCopy(lang, 'Salva calendario mensile', 'Save monthly leaflet')}</button></div>
            </form>
          </section>
          <section className="admin-panel">
            <div className="admin-panel-header"><h2>{adminCopy(lang, 'Calendari caricati', 'Uploaded leaflets')}</h2><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
            {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : leaflets.length === 0 ? <p>{adminCopy(lang, 'Nessun calendario mensile salvato.', 'No monthly leaflet saved.')}</p> : (
              <div className="availability-block-list">
                {leaflets.filter((leaflet) => leaflet.active !== false).map((leaflet) => <MonthlyLeafletCard key={leaflet.id} item={leaflet} lang={lang} userId={session.user.id} onChanged={(message) => { setFeedback(message); refresh(); }} />)}
                <details className="admin-archive-details">
                  <summary><span>{adminCopy(lang, 'Archivio', 'Archive')}</span><strong>{leaflets.filter((leaflet) => leaflet.active === false).length}</strong></summary>
                  {leaflets.filter((leaflet) => leaflet.active === false).length === 0 ? <p className="small-note">{adminCopy(lang, 'Nessun calendario archiviato.', 'No archived leaflet.')}</p> : leaflets.filter((leaflet) => leaflet.active === false).map((leaflet) => <MonthlyLeafletCard key={leaflet.id} item={leaflet} lang={lang} userId={session.user.id} onChanged={(message) => { setFeedback(message); refresh(); }} />)}
                </details>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="admin-two-column availability-columns">
          <section className="admin-panel">
            <h2>{adminCopy(lang, 'Crea escursione fissa', 'Create fixed excursion')}</h2>
            <p className="small-note">{adminCopy(lang, 'Capienza predefinita 12. Per gruppi oltre 12 persone: contatto diretto con la guida.', 'Default capacity is 12. Groups over 12 should contact the guide directly.')}</p>
            <form className="admin-form-grid" onSubmit={submitFixed}>
              <AdminInput label={adminCopy(lang, 'Data', 'Date')} type="date" min={todayIso()} value={fixedForm.date} onChange={(value) => updateFixed('date', value)} />
              <AdminInput label={adminCopy(lang, 'Ora inizio', 'Start time')} type="time" value={fixedForm.start_time} onChange={(value) => updateFixed('start_time', value)} />
              <AdminInput label={adminCopy(lang, 'Ora fine opzionale', 'Optional end time')} type="time" value={fixedForm.end_time} onChange={(value) => updateFixed('end_time', value)} />
              <AdminSelect label={adminCopy(lang, 'Esperienza', 'Experience')} value={fixedForm.experience_id} onChange={(value) => updateFixed('experience_id', value)} options={['etna-premium', 'etna-learning', 'etna-live', 'etna-stories']} formatter={(value) => adminExperienceLabel(value, lang)} />
              {leaflets.length > 0 && <AdminSelect label={adminCopy(lang, 'Calendario mensile collegato', 'Linked monthly leaflet')} value={fixedForm.leaflet_id} onChange={(value) => updateFixed('leaflet_id', value)} options={['', ...leaflets.map((leaflet) => leaflet.id)]} formatter={(value) => value ? leafletLabel(leaflets.find((leaflet) => leaflet.id === value), lang) : adminCopy(lang, 'Nessuno', 'None')} />}
              <AdminInput label={adminCopy(lang, 'Capienza', 'Capacity')} type="number" value={fixedForm.capacity} onChange={(value) => updateFixed('capacity', value)} />
              <AdminInput label="Title IT" value={fixedForm.title_it} onChange={(value) => updateFixed('title_it', value)} />
              <AdminInput label="Title EN" value={fixedForm.title_en} onChange={(value) => updateFixed('title_en', value)} />
              <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione breve IT', 'Short description IT')}</span><textarea value={fixedForm.description_it} onChange={(event) => updateFixed('description_it', event.target.value)} rows={3} /></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione breve EN', 'Short description EN')}</span><textarea value={fixedForm.description_en} onChange={(event) => updateFixed('description_en', event.target.value)} rows={3} /></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'Programma dettagliato IT', 'Detailed programme IT')}</span><textarea value={fixedForm.program_it} onChange={(event) => updateFixed('program_it', event.target.value)} rows={5} /></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'Programma dettagliato EN', 'Detailed programme EN')}</span><textarea value={fixedForm.program_en} onChange={(event) => updateFixed('program_en', event.target.value)} rows={5} /></label>
              <AdminInput label="Meeting point IT" value={fixedForm.meeting_point_it} onChange={(value) => updateFixed('meeting_point_it', value)} />
              <AdminInput label="Meeting point EN" value={fixedForm.meeting_point_en} onChange={(value) => updateFixed('meeting_point_en', value)} />
              <AdminInput label={adminCopy(lang, 'Link Google Maps del punto d’incontro', 'Google Maps meeting point link')} value={fixedForm.meeting_point_maps_url} placeholder="https://maps.google.com/..." onChange={(value) => updateFixed('meeting_point_maps_url', value)} />
              <AdminInput label="Difficulty IT" value={fixedForm.difficulty_it} onChange={(value) => updateFixed('difficulty_it', value)} />
              <AdminInput label="Difficulty EN" value={fixedForm.difficulty_en} onChange={(value) => updateFixed('difficulty_en', value)} />
              <AdminInput label="Price note IT" value={fixedForm.price_note_it} onChange={(value) => updateFixed('price_note_it', value)} />
              <AdminInput label="Price note EN" value={fixedForm.price_note_en} onChange={(value) => updateFixed('price_note_en', value)} />
              <label className="admin-field full"><span>{adminCopy(lang, 'Volantino italiano obbligatorio', 'Required Italian leaflet')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => updateFixed('leafletFileIt', event.target.files?.[0] || null)} required /></label>
              {fixedForm.leafletFileIt && <p className="small-note full">{adminCopy(lang, 'File italiano selezionato', 'Selected Italian file')}: {fixedForm.leafletFileIt.name}</p>}
              <label className="admin-field full"><span>{adminCopy(lang, 'Volantino inglese obbligatorio', 'Required English leaflet')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => updateFixed('leafletFileEn', event.target.files?.[0] || null)} required /></label>
              {fixedForm.leafletFileEn && <p className="small-note full">{adminCopy(lang, 'File inglese selezionato', 'Selected English file')}: {fixedForm.leafletFileEn.name}</p>}
              <label className="check-field"><input type="checkbox" checked={fixedForm.active} onChange={(event) => updateFixed('active', event.target.checked)} /> {adminCopy(lang, 'Attiva', 'Active')}</label>
              <div className="modal-actions full"><button className="button primary" type="submit">{adminCopy(lang, 'Salva escursione fissa', 'Save fixed excursion')}</button></div>
            </form>
          </section>
          <section className="admin-panel">
            <div className="admin-panel-header"><h2>{adminCopy(lang, 'Escursioni fisse', 'Fixed excursions')}</h2><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
            {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : fixedExcursions.length === 0 ? <p>{adminCopy(lang, 'Nessuna escursione fissa salvata.', 'No fixed excursions saved.')}</p> : (
              <div className="availability-block-list">
                {fixedExcursions.filter((item) => item.active !== false && (!item.date || item.date >= todayIso())).map((item) => <FixedExcursionCard key={item.id} item={item} lang={lang} userId={session.user.id} onChanged={(message) => { setFeedback(message); refresh(); }} />)}
                <details className="admin-archive-details">
                  <summary><span>{adminCopy(lang, 'Esperienze passate / Archivio', 'Past experiences / Archive')}</span><strong>{fixedExcursions.filter((item) => item.active === false || (item.date && item.date < todayIso())).length}</strong></summary>
                  {fixedExcursions.filter((item) => item.active === false || (item.date && item.date < todayIso())).length === 0 ? <p className="small-note">{adminCopy(lang, 'Nessuna escursione passata o archiviata.', 'No past or archived excursions.')}</p> : fixedExcursions.filter((item) => item.active === false || (item.date && item.date < todayIso())).map((item) => <FixedExcursionCard key={item.id} item={item} lang={lang} userId={session.user.id} onChanged={(message) => { setFeedback(message); refresh(); }} />)}
                </details>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function leafletLabel(item, lang) {
  if (!item) return '-';
  const title = monthlyLeafletField(item, 'title', lang);
  const base = `${String(item.month).padStart(2, '0')}/${item.year}`;
  return title ? `${base} · ${title}` : base;
}

function MonthlyLeafletCard({ item, lang, userId, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    month: String(item.month || new Date().getMonth() + 1),
    year: String(item.year || new Date().getFullYear()),
    title_it: item.title_it || '',
    title_en: item.title_en || '',
    description_it: item.description_it || '',
    description_en: item.description_en || '',
    notes_it: item.notes_it || '',
    notes_en: item.notes_en || '',
    file_it: null,
    file_en: null,
    leaflet_file_url_it: item.leaflet_file_url_it || item.file_url || '',
    leaflet_file_path_it: item.leaflet_file_path_it || item.file_path || '',
    leaflet_file_name_it: item.leaflet_file_name_it || item.file_name || '',
    leaflet_file_type_it: item.leaflet_file_type_it || item.file_type || '',
    leaflet_file_url_en: item.leaflet_file_url_en || '',
    leaflet_file_path_en: item.leaflet_file_path_en || '',
    leaflet_file_name_en: item.leaflet_file_name_en || '',
    leaflet_file_type_en: item.leaflet_file_type_en || '',
    active: item.active !== false
  });
  const [error, setError] = useState('');
  const italianFile = monthlyLeafletFile(item, 'it');
  const englishFile = monthlyLeafletFile(item, 'en');
  const activeFile = monthlyLeafletFile(item, lang);
  const description = monthlyLeafletField(item, 'description', lang);
  const notes = monthlyLeafletField(item, 'notes', lang);

  async function save() {
    setError('');
    if (!form.month || !form.year) {
      setError(adminCopy(lang, 'Mese e anno sono obbligatori.', 'Month and year are required.'));
      return;
    }
    const hasItalian = Boolean(form.file_it || form.leaflet_file_url_it);
    const hasEnglish = Boolean(form.file_en || form.leaflet_file_url_en);
    if (!hasItalian || !hasEnglish) {
      setError(adminCopy(lang, 'Carica il volantino italiano e il volantino inglese.', 'Upload both the Italian leaflet and the English leaflet.'));
      return;
    }
    try {
      await replaceBilingualAssets({
        uploadIt: form.file_it ? () => uploadMonthlyLeafletFile(form.file_it, userId, 'it', `${form.year}-${String(form.month).padStart(2, '0')}`) : null,
        uploadEn: form.file_en ? () => uploadMonthlyLeafletFile(form.file_en, userId, 'en', `${form.year}-${String(form.month).padStart(2, '0')}`) : null,
        removeNew: (asset) => removeMonthlyLeafletFile(asset.leaflet_file_path_it || asset.leaflet_file_path_en),
        commit: async (filePayloadIt, filePayloadEn) => {
      const { file_it, file_en, ...payload } = form;
      const nextItUrl = filePayloadIt.leaflet_file_url_it || payload.leaflet_file_url_it;
      const nextItPath = filePayloadIt.leaflet_file_path_it || payload.leaflet_file_path_it;
      const nextItName = filePayloadIt.leaflet_file_name_it || payload.leaflet_file_name_it;
      const nextItType = filePayloadIt.leaflet_file_type_it || payload.leaflet_file_type_it;
      return updateMonthlyLeaflet(item.id, {
        ...payload,
        ...filePayloadIt,
        ...filePayloadEn,
        file_url: nextItUrl,
        file_path: nextItPath,
        file_name: nextItName,
        file_type: nextItType,
        updated_by: userId
      }, item.updated_at);
        }
      });
      setEditing(false);
      onChanged(adminCopy(lang, 'Programma mensile aggiornato.', 'Monthly programme updated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Aggiornamento non riuscito.', 'Update failed.'));
    }
  }

  async function deactivate() {
    setError('');
    try {
      await deactivateMonthlyLeaflet(item.id, userId);
      onChanged(adminCopy(lang, 'Calendario mensile disattivato.', 'Monthly leaflet deactivated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Disattivazione non riuscita.', 'Deactivate failed.'));
    }
  }

  return (
    <article className={`availability-block-card ${item.active ? '' : 'inactive'}`}>
      <div className="request-card-head">
        <div><h3>{leafletLabel(item, lang)}</h3><p>{activeFile?.file_name || adminCopy(lang, 'Programma mensile bilingue', 'Bilingual monthly programme')}</p></div>
        <span className={`status-pill ${item.active ? 'accepted' : 'cancelled'}`}>{item.active ? adminCopy(lang, 'Attivo', 'Active') : adminCopy(lang, 'Inattivo', 'Inactive')}</span>
      </div>
      {editing ? (
        <div className="admin-form-grid single-card-form">
          <AdminInput label={adminCopy(lang, 'Mese', 'Month')} type="number" value={form.month} onChange={(value) => setForm((current) => ({ ...current, month: value }))} />
          <AdminInput label={adminCopy(lang, 'Anno', 'Year')} type="number" value={form.year} onChange={(value) => setForm((current) => ({ ...current, year: value }))} />
          <AdminInput label="Title IT" value={form.title_it} onChange={(value) => setForm((current) => ({ ...current, title_it: value }))} />
          <AdminInput label="Title EN" value={form.title_en} onChange={(value) => setForm((current) => ({ ...current, title_en: value }))} />
          <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione programma IT', 'Programme description IT')}</span><textarea value={form.description_it} onChange={(event) => setForm((current) => ({ ...current, description_it: event.target.value }))} rows={4} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione programma EN', 'Programme description EN')}</span><textarea value={form.description_en} onChange={(event) => setForm((current) => ({ ...current, description_en: event.target.value }))} rows={4} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Note programma IT', 'Programme notes IT')}</span><textarea value={form.notes_it} onChange={(event) => setForm((current) => ({ ...current, notes_it: event.target.value }))} rows={2} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Note programma EN', 'Programme notes EN')}</span><textarea value={form.notes_en} onChange={(event) => setForm((current) => ({ ...current, notes_en: event.target.value }))} rows={2} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Sostituisci volantino italiano', 'Replace Italian leaflet')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => setForm((current) => ({ ...current, file_it: event.target.files?.[0] || null }))} /></label>
          {form.leaflet_file_url_it && <p className="small-note full"><a href={form.leaflet_file_url_it} target="_blank" rel="noopener noreferrer">{form.leaflet_file_name_it || adminCopy(lang, 'Volantino italiano esistente', 'Existing Italian leaflet')}</a></p>}
          {form.file_it && <p className="small-note full">{adminCopy(lang, 'Nuovo file italiano', 'New Italian file')}: {form.file_it.name}</p>}
          <label className="admin-field full"><span>{adminCopy(lang, 'Sostituisci volantino inglese', 'Replace English leaflet')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => setForm((current) => ({ ...current, file_en: event.target.files?.[0] || null }))} /></label>
          {form.leaflet_file_url_en && <p className="small-note full"><a href={form.leaflet_file_url_en} target="_blank" rel="noopener noreferrer">{form.leaflet_file_name_en || adminCopy(lang, 'Volantino inglese esistente', 'Existing English leaflet')}</a></p>}
          {form.file_en && <p className="small-note full">{adminCopy(lang, 'Nuovo file inglese', 'New English file')}: {form.file_en.name}</p>}
          <label className="check-field"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> {adminCopy(lang, 'Attivo', 'Active')}</label>
          {error && <div className="admin-alert error full">{error}</div>}
          <div className="modal-actions full"><button className="button primary" type="button" onClick={save}>{adminCopy(lang, 'Salva programma mensile', 'Save monthly programme')}</button><button className="button secondary" type="button" onClick={() => setEditing(false)}>{adminCopy(lang, 'Annulla', 'Cancel')}</button></div>
        </div>
      ) : (
        <>
          {(description || notes) && <div className="monthly-program-admin-preview">{description && <p>{description}</p>}{notes && <p className="small-note">{notes}</p>}</div>}
          <div className="bilingual-leaflet-admin-list">
            {italianFile?.file_url && <a className="button secondary" href={italianFile.file_url} target="_blank" rel="noopener noreferrer">{adminCopy(lang, 'Apri volantino IT', 'Open IT leaflet')}</a>}
            {englishFile?.file_url && <a className="button secondary" href={englishFile.file_url} target="_blank" rel="noopener noreferrer">{adminCopy(lang, 'Apri volantino EN', 'Open EN leaflet')}</a>}
          </div>
          <p className="small-note">{adminCopy(lang, 'Collega le singole date usando il campo calendario mensile nel form escursione fissa.', 'Link individual dates through the monthly leaflet field in the fixed excursion form.')}</p>
          {error && <div className="admin-alert error">{error}</div>}
          <div className="request-actions">
            <button className="button secondary" type="button" onClick={() => setEditing(true)}>{adminCopy(lang, 'Modifica', 'Edit')}</button>
            {item.active && <button className="button secondary" type="button" onClick={deactivate}>{adminCopy(lang, 'Disattiva', 'Deactivate')}</button>}
          </div>
        </>
      )}
    </article>
  );
}

function FixedExcursionCard({ item, lang, userId, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    date: item.date,
    start_time: item.start_time || '',
    end_time: item.end_time || '',
    experience_id: item.experience_id,
    title_it: item.title_it || '',
    title_en: item.title_en || '',
    description_it: item.description_it || item.note_it || '',
    description_en: item.description_en || item.note_en || '',
    program_it: item.program_it || item.description_it || item.note_it || '',
    program_en: item.program_en || item.description_en || item.note_en || '',
    meeting_point_it: item.meeting_point_it || '',
    meeting_point_en: item.meeting_point_en || '',
    meeting_point_maps_url: item.meeting_point_maps_url || '',
    difficulty_it: item.difficulty_it || '',
    difficulty_en: item.difficulty_en || '',
    price_note_it: item.price_note_it || '',
    price_note_en: item.price_note_en || '',
    leafletFileIt: null,
    leafletFileEn: null,
    leaflet_file_url_it: item.leaflet_file_url_it || item.blocked_dates_file_url || '',
    leaflet_file_path_it: item.leaflet_file_path_it || item.blocked_dates_file_path || '',
    leaflet_file_name_it: item.leaflet_file_name_it || item.blocked_dates_file_name || '',
    leaflet_file_type_it: item.leaflet_file_type_it || item.blocked_dates_file_type || '',
    leaflet_file_url_en: item.leaflet_file_url_en || '',
    leaflet_file_path_en: item.leaflet_file_path_en || '',
    leaflet_file_name_en: item.leaflet_file_name_en || '',
    leaflet_file_type_en: item.leaflet_file_type_en || '',
    capacity: String(item.capacity || 12),
    active: item.active !== false
  });
  const [error, setError] = useState('');
  const italianFile = fixedExcursionLeafletFile(item, 'it');
  const englishFile = fixedExcursionLeafletFile(item, 'en');

  async function save() {
    setError('');
    if (Number.parseInt(form.capacity || '0', 10) < 1) {
      setError(adminCopy(lang, 'La capienza deve essere almeno 1.', 'Capacity must be at least 1.'));
      return;
    }
    if (!form.title_it.trim() && !form.title_en.trim()) {
      setError(adminCopy(lang, 'Inserisci almeno un titolo in italiano o inglese.', 'Enter at least one Italian or English title.'));
      return;
    }
    const hasItalian = Boolean(form.leafletFileIt || form.leaflet_file_url_it);
    const hasEnglish = Boolean(form.leafletFileEn || form.leaflet_file_url_en);
    if (!hasItalian || !hasEnglish) {
      setError(adminCopy(lang, 'Carica il volantino italiano e il volantino inglese per questa escursione fissa.', 'Upload both the Italian and English leaflet for this fixed excursion.'));
      return;
    }
    try {
      await replaceBilingualAssets({
        uploadIt: form.leafletFileIt ? () => uploadFixedExcursionLeafletFile(form.leafletFileIt, userId, 'it') : null,
        uploadEn: form.leafletFileEn ? () => uploadFixedExcursionLeafletFile(form.leafletFileEn, userId, 'en') : null,
        removeNew: (asset) => removeBlockedDatesFile(asset.leaflet_file_path_it || asset.leaflet_file_path_en),
        commit: async (filePayloadIt, filePayloadEn) => {
      const { leafletFileIt, leafletFileEn, ...fixedPayload } = form;
      const nextItUrl = filePayloadIt.leaflet_file_url_it || fixedPayload.leaflet_file_url_it;
      const nextItPath = filePayloadIt.leaflet_file_path_it || fixedPayload.leaflet_file_path_it;
      const nextItName = filePayloadIt.leaflet_file_name_it || fixedPayload.leaflet_file_name_it;
      const nextItType = filePayloadIt.leaflet_file_type_it || fixedPayload.leaflet_file_type_it;
      return updateFixedExcursion(item.id, {
        ...fixedPayload,
        ...filePayloadIt,
        ...filePayloadEn,
        blocked_dates_file_url: nextItUrl,
        blocked_dates_file_path: nextItPath,
        blocked_dates_file_name: nextItName,
        blocked_dates_file_type: nextItType,
        updated_by: userId
      }, item.updated_at);
        }
      });
      await publishCustomerNotificationEvent().catch(() => null);
      setEditing(false);
      onChanged(adminCopy(lang, 'Escursione fissa aggiornata.', 'Fixed excursion updated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Aggiornamento non riuscito.', 'Update failed.'));
    }
  }

  async function deactivate() {
    setError('');
    try {
      await deactivateFixedExcursion(item.id, userId);
      await publishCustomerNotificationEvent().catch(() => null);
      onChanged(adminCopy(lang, 'Escursione fissa disattivata.', 'Fixed excursion deactivated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Disattivazione non riuscita.', 'Deactivate failed.'));
    }
  }

  return (
    <article className={`availability-block-card ${item.active ? '' : 'inactive'}`}>
      <div className="request-card-head">
        <div><h3>{fixedExcursionLabel(item, lang)}</h3><p>{adminExperienceLabel(item.experience_id, lang)}</p></div>
        <span className={`status-pill ${item.active ? 'accepted' : 'cancelled'}`}>{item.active ? adminCopy(lang, 'Attiva', 'Active') : adminCopy(lang, 'Inattiva', 'Inactive')}</span>
      </div>
      {editing ? (
        <div className="admin-form-grid single-card-form">
          <AdminInput label={adminCopy(lang, 'Data', 'Date')} type="date" min={todayIso()} value={form.date} onChange={(value) => setForm((current) => ({ ...current, date: value }))} />
          <AdminInput label={adminCopy(lang, 'Ora inizio', 'Start time')} type="time" value={form.start_time} onChange={(value) => setForm((current) => ({ ...current, start_time: value }))} />
          <AdminInput label={adminCopy(lang, 'Ora fine opzionale', 'Optional end time')} type="time" value={form.end_time} onChange={(value) => setForm((current) => ({ ...current, end_time: value }))} />
          <AdminSelect label={adminCopy(lang, 'Esperienza', 'Experience')} value={form.experience_id} onChange={(value) => setForm((current) => ({ ...current, experience_id: value }))} options={['etna-premium', 'etna-learning', 'etna-live', 'etna-stories']} formatter={(value) => adminExperienceLabel(value, lang)} />
          <AdminInput label={adminCopy(lang, 'Capienza', 'Capacity')} type="number" value={form.capacity} onChange={(value) => setForm((current) => ({ ...current, capacity: value }))} />
          <AdminInput label="Title IT" value={form.title_it} onChange={(value) => setForm((current) => ({ ...current, title_it: value }))} />
          <AdminInput label="Title EN" value={form.title_en} onChange={(value) => setForm((current) => ({ ...current, title_en: value }))} />
          <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione breve IT', 'Short description IT')}</span><textarea value={form.description_it} onChange={(event) => setForm((current) => ({ ...current, description_it: event.target.value }))} rows={3} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione breve EN', 'Short description EN')}</span><textarea value={form.description_en} onChange={(event) => setForm((current) => ({ ...current, description_en: event.target.value }))} rows={3} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Programma dettagliato IT', 'Detailed programme IT')}</span><textarea value={form.program_it} onChange={(event) => setForm((current) => ({ ...current, program_it: event.target.value }))} rows={5} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Programma dettagliato EN', 'Detailed programme EN')}</span><textarea value={form.program_en} onChange={(event) => setForm((current) => ({ ...current, program_en: event.target.value }))} rows={5} /></label>
          <AdminInput label="Meeting point IT" value={form.meeting_point_it} onChange={(value) => setForm((current) => ({ ...current, meeting_point_it: value }))} />
          <AdminInput label="Meeting point EN" value={form.meeting_point_en} onChange={(value) => setForm((current) => ({ ...current, meeting_point_en: value }))} />
          <AdminInput label={adminCopy(lang, 'Link Google Maps del punto d’incontro', 'Google Maps meeting point link')} value={form.meeting_point_maps_url} placeholder="https://maps.google.com/..." onChange={(value) => setForm((current) => ({ ...current, meeting_point_maps_url: value }))} />
          <AdminInput label="Difficulty IT" value={form.difficulty_it} onChange={(value) => setForm((current) => ({ ...current, difficulty_it: value }))} />
          <AdminInput label="Difficulty EN" value={form.difficulty_en} onChange={(value) => setForm((current) => ({ ...current, difficulty_en: value }))} />
          <AdminInput label="Price note IT" value={form.price_note_it} onChange={(value) => setForm((current) => ({ ...current, price_note_it: value }))} />
          <AdminInput label="Price note EN" value={form.price_note_en} onChange={(value) => setForm((current) => ({ ...current, price_note_en: value }))} />
          <label className="admin-field full"><span>{adminCopy(lang, 'Sostituisci volantino italiano', 'Replace Italian leaflet')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => setForm((current) => ({ ...current, leafletFileIt: event.target.files?.[0] || null }))} /></label>
          {form.leaflet_file_url_it && <p className="small-note full"><a href={form.leaflet_file_url_it} target="_blank" rel="noopener noreferrer">{form.leaflet_file_name_it || adminCopy(lang, 'Volantino italiano esistente', 'Existing Italian leaflet')}</a></p>}
          {form.leafletFileIt && <p className="small-note full">{adminCopy(lang, 'Nuovo file italiano', 'New Italian file')}: {form.leafletFileIt.name}</p>}
          <label className="admin-field full"><span>{adminCopy(lang, 'Sostituisci volantino inglese', 'Replace English leaflet')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => setForm((current) => ({ ...current, leafletFileEn: event.target.files?.[0] || null }))} /></label>
          {form.leaflet_file_url_en && <p className="small-note full"><a href={form.leaflet_file_url_en} target="_blank" rel="noopener noreferrer">{form.leaflet_file_name_en || adminCopy(lang, 'Volantino inglese esistente', 'Existing English leaflet')}</a></p>}
          {form.leafletFileEn && <p className="small-note full">{adminCopy(lang, 'Nuovo file inglese', 'New English file')}: {form.leafletFileEn.name}</p>}
          <label className="check-field"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> {adminCopy(lang, 'Attiva', 'Active')}</label>
          {error && <div className="admin-alert error full">{error}</div>}
          <div className="modal-actions full"><button className="button primary" type="button" onClick={save}>{adminCopy(lang, 'Salva', 'Save')}</button><button className="button secondary" type="button" onClick={() => setEditing(false)}>{adminCopy(lang, 'Annulla', 'Cancel')}</button></div>
        </div>
      ) : (
        <>
          <dl className="request-details-grid">
            <div><dt>{adminCopy(lang, 'Capienza', 'Capacity')}</dt><dd>{item.capacity}</dd></div>
            <div><dt>{adminCopy(lang, 'Accettati', 'Accepted')}</dt><dd>{item.accepted_count || 0}</dd></div>
            <div><dt>{adminCopy(lang, 'Posti residui', 'Remaining')}</dt><dd>{item.places_remaining}</dd></div>
            <div><dt>{adminCopy(lang, 'Aggiornata', 'Updated')}</dt><dd>{formatDateForMessage(String(item.updated_at || item.created_at || '').slice(0, 10), lang) || '-'}</dd></div>
          </dl>
          <div className="bilingual-leaflet-admin-list">
            {italianFile?.file_url && <a className="button secondary" href={italianFile.file_url} target="_blank" rel="noopener noreferrer">{adminCopy(lang, 'Apri volantino IT', 'Open IT leaflet')}</a>}
            {englishFile?.file_url && <a className="button secondary" href={englishFile.file_url} target="_blank" rel="noopener noreferrer">{adminCopy(lang, 'Apri volantino EN', 'Open EN leaflet')}</a>}
          </div>
          <BlockedDatesAttachment item={item} lang={lang} publicView={false} />
          {(item.program_it || item.program_en || item.description_it || item.description_en || item.note_it || item.note_en) && <p>{fixedExcursionProgram(item, lang) || fixedExcursionField(item, 'description', lang) || (lang === 'it' ? item.note_it || item.note_en : item.note_en || item.note_it)}</p>}
          {error && <div className="admin-alert error">{error}</div>}
          <div className="request-actions"><button className="button secondary" type="button" onClick={() => setEditing(true)}>{adminCopy(lang, 'Modifica', 'Edit')}</button>{item.active && <button className="button secondary" type="button" onClick={deactivate}>{adminCopy(lang, 'Disattiva', 'Deactivate')}</button>}</div>
        </>
      )}
    </article>
  );
}

function AvailabilityBlockCard({ block, lang, userId, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ status: block.status, reason_it: block.reason_it || '', reason_en: block.reason_en || '', internal_note: block.internal_note || '' });
  const [error, setError] = useState('');

  async function save() {
    setError('');
    try {
      await updateAvailabilityBlock(block.id, { ...form, updated_by: userId });
      setEditing(false);
      onChanged(adminCopy(lang, 'Blocco aggiornato.', 'Block updated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Aggiornamento non riuscito.', 'Update failed.'));
    }
  }

  async function deactivate() {
    setError('');
    try {
      await deactivateAvailabilityBlock(block.id, userId);
      onChanged(adminCopy(lang, 'Blocco disattivato.', 'Block deactivated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Disattivazione non riuscita.', 'Deactivate failed.'));
    }
  }

  return (
    <article className={`availability-block-card ${block.active ? '' : 'inactive'}`}>
      <div className="request-card-head">
        <div><h3>{formatDateForMessage(block.date, lang)}</h3><p>{block.experience_id ? adminExperienceLabel(block.experience_id, lang) : adminCopy(lang, 'Tutte le esperienze', 'All experiences')}</p></div>
        <span className={`status-pill ${block.status}`}>{adminAvailabilityStatusLabels[block.status]?.[lang] || block.status}</span>
      </div>
      {editing ? (
        <div className="admin-form-grid single-card-form">
          <AdminSelect label={adminCopy(lang, 'Stato', 'Status')} value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value }))} options={AVAILABILITY_STATUSES} formatter={(value) => adminAvailabilityStatusLabels[value][lang]} />
          <AdminInput label="Reason IT" value={form.reason_it} onChange={(value) => setForm((current) => ({ ...current, reason_it: value }))} />
          <AdminInput label="Reason EN" value={form.reason_en} onChange={(value) => setForm((current) => ({ ...current, reason_en: value }))} />
          <label className="admin-field full"><span>{adminCopy(lang, 'Nota interna', 'Internal note')}</span><textarea value={form.internal_note} onChange={(event) => setForm((current) => ({ ...current, internal_note: event.target.value }))} rows={3} /></label>
          {error && <div className="admin-alert error full">{error}</div>}
          <div className="modal-actions full"><button className="button primary" type="button" onClick={save}>{adminCopy(lang, 'Salva', 'Save')}</button><button className="button secondary" type="button" onClick={() => setEditing(false)}>{adminCopy(lang, 'Annulla', 'Cancel')}</button></div>
        </div>
      ) : (
        <>
          <p>{block.reason_it || block.reason_en || '-'}</p>
          {block.internal_note && <p className="small-note"><strong>Internal:</strong> {block.internal_note}</p>}
          <p className="small-note">{block.active ? adminCopy(lang, 'Attivo', 'Active') : adminCopy(lang, 'Inattivo', 'Inactive')} · {adminCopy(lang, 'Creato', 'Created')} {formatDateForMessage(String(block.created_at || '').slice(0, 10), lang)}</p>
          {error && <div className="admin-alert error">{error}</div>}
          <div className="request-actions"><button className="button secondary" type="button" onClick={() => setEditing(true)}>{adminCopy(lang, 'Modifica', 'Edit')}</button>{block.active && <button className="button secondary" type="button" onClick={deactivate}>{adminCopy(lang, 'Disattiva / sblocca', 'Deactivate / unblock')}</button>}</div>
        </>
      )}
    </article>
  );
}

export default AdminRouter;
