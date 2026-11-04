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
  let identityScope=variant;
  if(variant==='admin'){
    const {data}=await supabase.auth.getSession();const userId=data?.session?.user?.id;
    if(!userId)throw new Error('admin_auth_required');
    const previous=localStorage.getItem(keyFor('admin','user_id'));
    if(previous!==userId){const registration=await navigator.serviceWorker?.getRegistration('/admin/');await (await registration?.pushManager?.getSubscription())?.unsubscribe();}
    localStorage.setItem(keyFor('admin','user_id'),userId);identityScope='admin.'+userId;
  }
  const { deviceId, deviceToken } = identity(identityScope);
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
  if (pushSubscription) {
    const expected = base64UrlToBytes(status.vapidPublicKey), actual = new Uint8Array(pushSubscription.options?.applicationServerKey || []);
    if (expected.length !== actual.length || expected.some((value,index)=>value!==actual[index])) {
      await pushSubscription.unsubscribe(); pushSubscription = null;
    }
  }
  if (!pushSubscription) pushSubscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(status.vapidPublicKey) });
  const locale = resolveNotificationLocale(languagePreference, currentLanguage);
  registration.active?.postMessage({ type: 'notification-config', variant, locale });
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome';
  const payload = await api(variant, 'subscribe', { method: 'POST', body: JSON.stringify({ audience: variant, appVariant: variant, subscription: pushSubscription.toJSON(), platform: isIos() ? (isSafari() ? 'ios_safari' : 'ios') : navigator.platform || 'web', languagePreference, resolvedLocale: locale, categories, quietHoursEnabled, quietStart, quietEnd, timezone: timeZone }) });
  return { ...payload, permission, locale };
}
export async function forgetNotificationDevice(variant){
  const result=await api(variant,'forget-device',{method:'POST',body:'{}'});
  const registration=await navigator.serviceWorker?.getRegistration(variant==='admin'?'/admin/':'/');await (await registration?.pushManager?.getSubscription())?.unsubscribe();
  const scope=variant==='admin'?'admin.'+localStorage.getItem(keyFor('admin','user_id')):variant;
  for(const part of ['device_id','device_token'])localStorage.removeItem(keyFor(scope,part));return result;
}
export async function disableNotifications(variant) {
  const result = await api(variant, 'unsubscribe', { method: 'POST', body: '{}' });
  try { const registration = await navigator.serviceWorker.getRegistration(variant === 'admin' ? '/admin/' : '/'); const subscription = await registration?.pushManager?.getSubscription(); await subscription?.unsubscribe?.(); } catch { /* backend disable remains authoritative */ }
  return result;
}
export async function updateNotificationLocale(variant, currentLanguage) {
  return api(variant,'preferences',{method:'PATCH',body:JSON.stringify({resolvedLocale:resolveNotificationLocale('auto',currentLanguage)})});
}
export async function reconcileNotificationSubscription(variant) {
  const registration=await navigator.serviceWorker?.getRegistration(variant==='admin'?'/admin/':'/');
  const subscription=await registration?.pushManager?.getSubscription();
  const stored=await getNotificationPreferences(variant);
  if(typeof Notification==='undefined'||Notification.permission!=='granted'||!subscription){if(stored.pushEnabled)await api(variant,'unsubscribe',{method:'POST',body:'{}'});return false;}
  const status=await getNotificationStatus(variant),expected=base64UrlToBytes(status.vapidPublicKey||''),actual=new Uint8Array(subscription.options?.applicationServerKey||[]);
  if(!expected.length||expected.length!==actual.length||!expected.every((value,index)=>value===actual[index]))return false;
  if(!stored.pushEnabled)return false;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(subscription.endpoint));const fingerprint=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
  if(fingerprint!==stored.endpointFingerprint)await api(variant,'subscribe',{method:'POST',body:JSON.stringify({audience:variant,subscription:subscription.toJSON(),...stored.preferences})});
  return true;
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
export async function publishCustomerNotificationEvent() {
  return api('admin', 'personalized-events/reconcile', { method: 'POST', body: '{}' });
}
export async function retryCustomerNotificationOutbox(outboxId) {
  return api('admin', 'personalized-events/reconcile', { method: 'POST', body: JSON.stringify({ outboxId }) });
}
export async function getNotificationHealth() { return api('admin', 'health', { method: 'GET' }); }
export async function listNotificationCampaigns() { return api('admin', 'campaigns', { method: 'GET' }); }
export async function createNotificationCampaign(input) { return api('admin', 'campaigns', { method: 'POST', body: JSON.stringify(input) }); }
export async function updateNotificationCampaign(id,input){return api('admin',`campaigns/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(input)});}
export async function cancelNotificationCampaign(id) { return api('admin', `campaigns/${encodeURIComponent(id)}/cancel`, { method: 'PATCH', body: '{}' }); }
export async function listNotificationAutomationRules() { return api('admin', 'automations/rules', { method: 'GET' }); }
export async function listPersonalizedNotificationEvents() { return api('admin', 'automations/personalized', { method: 'GET' }); }
export async function listCustomerNotificationOutbox() { return api('admin', 'automations/outbox', { method: 'GET' }); }
export async function updateNotificationAutomationRule(ruleKey, enabled) { return api('admin', `automations/rules/${encodeURIComponent(ruleKey)}`, { method: 'PATCH', body: JSON.stringify({ enabled: Boolean(enabled) }) }); }
export async function listNotificationAutomationJobs() { return api('admin', 'automations/jobs', { method: 'GET' }); }
export async function cancelNotificationAutomationJob(id) { return api('admin', `automations/jobs/${encodeURIComponent(id)}/cancel`, { method: 'PATCH', body: '{}' }); }
