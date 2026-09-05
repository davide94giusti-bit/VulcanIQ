export const PUBLIC_LANGUAGE_KEY = 'vulcaniq_public_language';

export function suggestedPublicLanguage(navigatorLanguage = typeof navigator === 'undefined' ? '' : navigator.language) {
  return String(navigatorLanguage || '').toLowerCase().startsWith('it') ? 'it' : 'en';
}

export function readStoredPublicLanguage() {
  if (typeof window === 'undefined') return '';
  try {
    const stored = window.localStorage.getItem(PUBLIC_LANGUAGE_KEY);
    return stored === 'it' || stored === 'en' ? stored : '';
  } catch {
    return '';
  }
}

export function queryPublicLanguage() {
  if (typeof window === 'undefined') return '';
  try {
    const value = new URLSearchParams(window.location.search).get('lang');
    return value === 'it' || value === 'en' ? value : '';
  } catch {
    return '';
  }
}

export function hasExplicitPublicLanguage() {
  return Boolean(queryPublicLanguage() || readStoredPublicLanguage());
}

export function readInitialPublicLanguage() {
  return queryPublicLanguage() || readStoredPublicLanguage() || suggestedPublicLanguage();
}

export function storePublicLanguage(lang) {
  if (typeof window === 'undefined' || !['it', 'en'].includes(lang)) return;
  try { window.localStorage.setItem(PUBLIC_LANGUAGE_KEY, lang); } catch {}
}
