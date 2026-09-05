import { supabase } from '../lib/supabaseClient.js';

let deferredInstallPrompt = null;
let installPromptDismissed = false;
const PUBLIC_ONBOARDING_KEY = 'vulcaniq.notifications.public.onboarding.v1';
const PUBLIC_ONBOARDING_DEFER_MS = 30 * 24 * 60 * 60 * 1000;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installPromptDismissed = false;
    window.dispatchEvent(new CustomEvent('vulcaniq-install-state-changed'));
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installPromptDismissed = false;
    window.dispatchEvent(new CustomEvent('vulcaniq-install-state-changed'));
  });
}

function randomSecret(bytes = 32) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return [...buffer].map((value) => value.toString(16).padStart(2, '0')).join('');
}
function keyFor(variant, part) { return `vulcaniq.notifications.${variant}.${part}`; }
function identity(variant) {
  const storage = window.localStorage;
  let deviceId = storage.getItem(keyFor(variant, 'device_id'));
  let deviceToken = storage.getItem(keyFor(variant, 'device_token'));
  if (!deviceId) { deviceId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : randomSecret(16); storage.setItem(keyFor(variant, 'device_id'), deviceId); }
  if (!deviceToken) { deviceToken = randomSecret(32); storage.setItem(keyFor(variant, 'device_token'), deviceToken); }
  return { deviceId, deviceToken };
}
function isIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function isSafari() { return /safari/i.test(navigator.userAgent) && !/chrome|crios|android/i.test(navigator.userAgent); }
export function isStandalone() { return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true; }
export function installState() {
  if (isStandalone()) return 'already_installed';
  if (!('serviceWorker' in navigator)) return 'unsupported';
  if (deferredInstallPrompt) return 'install_available';
  if (isIos()) return 'needs_ios_home_screen';
  if (installPromptDismissed) return 'install_dismissed';
  return 'unsupported';
}
export async function promptInstall() {
  if (!deferredInstallPrompt) return { outcome: 'unavailable' };
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  let choice;
  try {
    await prompt.prompt();
    choice = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
  } catch {
    choice = { outcome: 'dismissed' };
  }
  installPromptDismissed = choice?.outcome !== 'accepted';
  window.dispatchEvent(new CustomEvent('vulcaniq-install-state-changed'));
  return choice || { outcome: 'dismissed' };
}
export function readPublicNotificationOnboarding() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PUBLIC_ONBOARDING_KEY) || '{}');
    return {
      status: ['not_now', 'enabled'].includes(parsed.status) ? parsed.status : 'never_asked',
      nextPromptAt: Number(parsed.nextPromptAt || 0)
    };
  } catch {
    return { status: 'never_asked', nextPromptAt: 0 };
  }
}
export function deferPublicNotificationOnboarding(now = Date.now()) {
  const next = { status: 'not_now', nextPromptAt: Number(now) + PUBLIC_ONBOARDING_DEFER_MS };
  try { window.localStorage.setItem(PUBLIC_ONBOARDING_KEY, JSON.stringify(next)); } catch {}
  return next;
}
export function completePublicNotificationOnboarding() {
  const next = { status: 'enabled', nextPromptAt: 0 };
  try { window.localStorage.setItem(PUBLIC_ONBOARDING_KEY, JSON.stringify(next)); } catch {}
  return next;
}
export async function publicNotificationOnboardingState(now = Date.now()) {
  if (!isStandalone()) return 'installation_required';
  const capability = capabilityState();
  if (capability === 'unsupported') return 'unsupported';
  if (capability === 'permission_denied') return 'permission_denied';
  if (capability === 'permission_granted') {
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      if (await registration?.pushManager?.getSubscription?.()) return 'subscription_active';
    } catch { /* an explicit Enable action can retry registration safely */ }
  }
  const onboarding = readPublicNotificationOnboarding();
  if (onboarding.status === 'not_now' && onboarding.nextPromptAt > Number(now)) return 'deferred';
  return capability === 'permission_granted' ? 'permission_granted' : 'never_asked';
}
export async function syncPublicAppBadge(unreadCount) {
  if (!isStandalone()) return false;
  const count = Math.max(0, Number(unreadCount || 0));
  try {
    if (count > 0 && typeof navigator.setAppBadge === 'function') {
      await navigator.setAppBadge(count);
      return true;
    }
    if (count === 0 && typeof navigator.clearAppBadge === 'function') {
      await navigator.clearAppBadge();
      return true;
    }
  } catch { /* browser-level badging failure is non-fatal */ }
  return false;
}
function base64UrlToBytes(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}
async function authToken(variant) {
  if (variant !== 'admin' || !supabase) return '';
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || '';
}
async function api(variant, path, options = {}) {
  const { deviceId, deviceToken } = identity(variant);
  const token = await authToken(variant);
  const response = await fetch(`/api/notifications/${path}?audience=${variant}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Notification-Device': deviceId,
      'X-Notification-Token': deviceToken,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(payload?.error || `Notification API ${response.status}`); error.status = response.status; error.code = payload?.error; throw error; }
  return payload;
}
function registrationOptions(variant) { return variant === 'admin' ? { script: '/admin-sw.js', scope: '/admin' } : { script: '/sw.js', scope: '/' }; }
function waitForActiveWorker(registration) {
  if (registration.active) return Promise.resolve(registration.active);
  const candidate = registration.installing || registration.waiting;
  if (!candidate) return Promise.reject(new Error('service_worker_not_active'));
  return new Promise((resolve, reject) => {
    const onStateChange = () => {
      if (candidate.state === 'activated') { candidate.removeEventListener('statechange', onStateChange); resolve(candidate); }
      if (candidate.state === 'redundant') { candidate.removeEventListener('statechange', onStateChange); reject(new Error('service_worker_registration_failed')); }
    };
    candidate.addEventListener('statechange', onStateChange);
    onStateChange();
  });
}
export async function registerNotificationServiceWorker(variant) {
  if (!('serviceWorker' in navigator)) throw new Error('service_worker_unsupported');
  const { script, scope } = registrationOptions(variant);
  const registration = await navigator.serviceWorker.register(script, { scope });
  await waitForActiveWorker(registration);
  return registration;
}
export function resolveNotificationLocale(languagePreference, currentLanguage = 'it') {
  if (languagePreference === 'it' || languagePreference === 'en') return languagePreference;
  if (currentLanguage === 'it' || currentLanguage === 'en') return currentLanguage;
  return String(navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'it';
}
export function capabilityState() {
  if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  if (Notification.permission === 'denied') return 'permission_denied';
  if (Notification.permission === 'granted') return 'permission_granted';
  return 'permission_default';
}
export async function getNotificationStatus(variant) { return api(variant, 'status', { method: 'GET' }); }
export async function ensureNotificationDevice(variant, currentLanguage = 'it') {
  const locale = resolveNotificationLocale('auto', currentLanguage);
  return api(variant, 'device', { method: 'POST', body: JSON.stringify({ audience: variant, appVariant: variant, languagePreference: 'auto', resolvedLocale: locale, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome', platform: isIos() ? (isSafari() ? 'ios_safari' : 'ios') : navigator.platform || 'web' }) });
}
export async function enableNotifications({ variant, currentLanguage, languagePreference = 'auto', categories, quietHoursEnabled = false, quietStart = '', quietEnd = '' }) {
  const state = capabilityState();
  if (state === 'unsupported') throw new Error('notifications_unsupported');
  if (state === 'permission_denied') { const error = new Error('notification_permission_denied'); error.code = error.message; throw error; }
  const permission = state === 'permission_granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') { const error = new Error(permission === 'denied' ? 'notification_permission_denied' : 'notification_permission_not_granted'); error.code = error.message; throw error; }
  const registration = await registerNotificationServiceWorker(variant);
  const status = await getNotificationStatus(variant);
  if (!status.vapidPublicKey) throw new Error('vapid_public_key_missing');
  let pushSubscription = await registration.pushManager.getSubscription();
  if (!pushSubscription) pushSubscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(status.vapidPublicKey) });
  const locale = resolveNotificationLocale(languagePreference, currentLanguage);
  registration.active?.postMessage({ type: 'notification-config', variant, locale });
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome';
  const payload = await api(variant, 'subscribe', { method: 'POST', body: JSON.stringify({ audience: variant, appVariant: variant, subscription: pushSubscription.toJSON(), platform: isIos() ? (isSafari() ? 'ios_safari' : 'ios') : navigator.platform || 'web', languagePreference, resolvedLocale: locale, categories, quietHoursEnabled, quietStart, quietEnd, timezone: timeZone }) });
  return { ...payload, permission, locale };
}
export async function disableNotifications(variant) {
  const result = await api(variant, 'unsubscribe', { method: 'POST', body: '{}' });
  try { const registration = await navigator.serviceWorker.getRegistration(variant === 'admin' ? '/admin/' : '/'); const subscription = await registration?.pushManager?.getSubscription(); await subscription?.unsubscribe?.(); } catch { /* backend disable remains authoritative */ }
  return result;
}
export async function getNotificationPreferences(variant) { return api(variant, 'preferences', { method: 'GET' }); }
export async function updateNotificationPreferences(variant, preferences, currentLanguage) {
  const next = { ...preferences, resolvedLocale: resolveNotificationLocale(preferences.languagePreference, currentLanguage), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome' };
  const result = await api(variant, 'preferences', { method: 'PATCH', body: JSON.stringify(next) });
  const registration = await navigator.serviceWorker.getRegistration(variant === 'admin' ? '/admin/' : '/'); registration?.active?.postMessage({ type: 'notification-config', variant, locale: next.resolvedLocale });
  return result;
}
export async function listNotificationInbox(variant) { return api(variant, 'inbox', { method: 'GET' }); }
export async function markNotificationRead(variant, id) { return api(variant, `inbox/${encodeURIComponent(id)}/read`, { method: 'PATCH', body: '{}' }); }
export async function dismissNotification(variant, id) { return api(variant, `inbox/${encodeURIComponent(id)}/dismiss`, { method: 'PATCH', body: '{}' }); }
export async function sendTestNotification(variant) { return api(variant, 'test', { method: 'POST', body: '{}' }); }
export async function claimNotificationOwnership(claimToken) { return api('public', 'ownership/claim', { method: 'POST', body: JSON.stringify({ claimToken }) }); }
export async function claimRequestedNotificationOwnership(createdRequest, requested, currentLanguage = 'it') {
  const claimToken = createdRequest?.notification_ownership_claim?.token;
  if (!requested || typeof claimToken !== 'string' || !claimToken) return false;
  try {
    await ensureNotificationDevice('public', currentLanguage);
    await claimNotificationOwnership(claimToken);
    return true;
  } catch {
    // Booking creation remains authoritative. One-time claim material is never
    // persisted, logged, placed in analytics, or retried from a URL.
    return false;
  }
}
export async function listNotificationOwnerships() { return api('public', 'ownership', { method: 'GET' }); }
export async function revokeNotificationOwnership(id) { return api('public', `ownership/${encodeURIComponent(id)}/revoke`, { method: 'PATCH', body: '{}' }); }
export async function updateNotificationOwnershipPreferences(id, preferences) {
  return api('public', `ownership/${encodeURIComponent(id)}/preferences`, { method: 'PATCH', body: JSON.stringify(preferences) });
}
export async function getOwnedBookingParticipants(ownershipId) {
  return api('public', `ownership/${encodeURIComponent(ownershipId)}/participants`, { method: 'GET' });
}
export async function addOwnedBookingParticipant(ownershipId, participant) {
  return api('public', `ownership/${encodeURIComponent(ownershipId)}/participants`, { method: 'POST', body: JSON.stringify(participant) });
}
export async function updateOwnedBookingParticipant(ownershipId, participantId, changes) {
  return api('public', `ownership/${encodeURIComponent(ownershipId)}/participants/${encodeURIComponent(participantId)}`, { method: 'PATCH', body: JSON.stringify(changes) });
}
export async function getOwnedBookingTerms(ownershipId, locale = 'it') {
  return api('public', `ownership/${encodeURIComponent(ownershipId)}/terms?locale=${encodeURIComponent(locale === 'en' ? 'en' : 'it')}`, { method: 'GET' });
}
export async function acceptOwnedOrganizerTerms(ownershipId, termsVersionId, locale = 'it') {
  return api('public', `ownership/${encodeURIComponent(ownershipId)}/terms`, {
    method: 'POST',
    body: JSON.stringify({ termsVersionId, locale: locale === 'en' ? 'en' : 'it' })
  });
}
export async function issueOwnedParticipantTermsInvitation(ownershipId, participantId, recipientEmail, locale = 'it') {
  return api('public', `ownership/${encodeURIComponent(ownershipId)}/participants/${encodeURIComponent(participantId)}/terms-invitation`, {
    method: 'POST',
    body: JSON.stringify({ locale: locale === 'en' ? 'en' : 'it', recipientEmail })
  });
}
export async function revokeOwnedParticipantTermsInvitation(ownershipId, participantId) {
  return api('public', `ownership/${encodeURIComponent(ownershipId)}/participants/${encodeURIComponent(participantId)}/terms-invitation/revoke`, {
    method: 'PATCH',
    body: '{}'
  });
}
export async function acceptOwnedGuardianTerms(ownershipId, participantId, termsVersionId, locale = 'it') {
  return api('public', `ownership/${encodeURIComponent(ownershipId)}/participants/${encodeURIComponent(participantId)}/terms-acceptance`, {
    method: 'POST',
    body: JSON.stringify({ termsVersionId, locale: locale === 'en' ? 'en' : 'it' })
  });
}
export async function publishCustomerNotificationEvent() {
  return api('admin', 'personalized-events/reconcile', { method: 'POST', body: '{}' });
}
export async function retryCustomerNotificationOutbox(outboxId) {
  return api('admin', 'personalized-events/reconcile', { method: 'POST', body: JSON.stringify({ outboxId }) });
}
export async function getNotificationHealth() { return api('admin', 'health', { method: 'GET' }); }
export async function listNotificationCampaigns() { return api('admin', 'campaigns', { method: 'GET' }); }
export async function createNotificationCampaign(input) { return api('admin', 'campaigns', { method: 'POST', body: JSON.stringify(input) }); }
export async function cancelNotificationCampaign(id) { return api('admin', `campaigns/${encodeURIComponent(id)}/cancel`, { method: 'PATCH', body: '{}' }); }
export async function listNotificationAutomationRules() { return api('admin', 'automations/rules', { method: 'GET' }); }
export async function listPersonalizedNotificationEvents() { return api('admin', 'automations/personalized', { method: 'GET' }); }
export async function listCustomerNotificationOutbox() { return api('admin', 'automations/outbox', { method: 'GET' }); }
export async function updateNotificationAutomationRule(ruleKey, enabled) { return api('admin', `automations/rules/${encodeURIComponent(ruleKey)}`, { method: 'PATCH', body: JSON.stringify({ enabled: Boolean(enabled) }) }); }
export async function listNotificationAutomationJobs() { return api('admin', 'automations/jobs', { method: 'GET' }); }
export async function cancelNotificationAutomationJob(id) { return api('admin', `automations/jobs/${encodeURIComponent(id)}/cancel`, { method: 'PATCH', body: '{}' }); }
