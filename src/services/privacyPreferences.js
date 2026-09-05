export const PRIVACY_PREFERENCES_KEY = 'vulcaniq.privacy.preferences.v1';
export const PRIVACY_PREFERENCES_EVENT = 'vulcaniq-privacy-preferences-changed';

function storage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readPrivacyPreferences() {
  const localStorage = storage();
  if (!localStorage) return { analytics: null, decidedAt: '' };
  try {
    const parsed = JSON.parse(localStorage.getItem(PRIVACY_PREFERENCES_KEY) || '{}');
    return {
      analytics: typeof parsed.analytics === 'boolean' ? parsed.analytics : null,
      decidedAt: typeof parsed.decidedAt === 'string' ? parsed.decidedAt : ''
    };
  } catch {
    return { analytics: null, decidedAt: '' };
  }
}

export function analyticsConsentGranted() {
  return readPrivacyPreferences().analytics === true;
}

export function writePrivacyPreferences({ analytics }) {
  if (typeof analytics !== 'boolean') throw new Error('privacy_preference_required');
  const next = { version: 1, analytics, decidedAt: new Date().toISOString() };
  const localStorage = storage();
  if (!localStorage) return next;
  try { localStorage.setItem(PRIVACY_PREFERENCES_KEY, JSON.stringify(next)); } catch {}
  window.dispatchEvent(new CustomEvent(PRIVACY_PREFERENCES_EVENT, { detail: next }));
  return next;
}
