import { supabase } from '../lib/supabaseClient.js';

let deferredInstallPrompt = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    window.dispatchEvent(new CustomEvent('vulcaniq-install-state-changed'));
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
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
  if (!('serviceWorker' in navigator)) return 'unsupported';
  if (isStandalone()) return 'already_installed';
  if (deferredInstallPrompt) return 'install_available';
  if (isIos()) return 'needs_ios_home_screen';
  return 'unsupported';
}
export async function promptInstall() {
  if (!deferredInstallPrompt) return { outcome: 'unavailable' };
  await deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
  if (choice?.outcome === 'accepted') deferredInstallPrompt = null;
  return choice || { outcome: 'dismissed' };
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
function registrationOptions(variant) { return variant === 'admin' ? { script: '/admin-sw.js', scope: '/admin/' } : { script: '/sw.js', scope: '/' }; }
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
  if (capabilityState() === 'unsupported') throw new Error('notifications_unsupported');
  const permission = await Notification.requestPermission();
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
export async function getNotificationHealth() { return api('admin', 'health', { method: 'GET' }); }
export async function listNotificationCampaigns() { return api('admin', 'campaigns', { method: 'GET' }); }
export async function createNotificationCampaign(input) { return api('admin', 'campaigns', { method: 'POST', body: JSON.stringify(input) }); }
