export const FIRST_RUN_COMPLETION_KEY = 'vulcaniq.first_run.completed.v1';

function storage() {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

export function readFirstRunCompletion() {
  const localStorage = storage();
  if (!localStorage) return false;
  try { return JSON.parse(localStorage.getItem(FIRST_RUN_COMPLETION_KEY) || '{}').completed === true; } catch { return false; }
}

export function completeFirstRunOnboarding() {
  const value = { version: 1, completed: true, completedAt: new Date().toISOString() };
  try { storage()?.setItem(FIRST_RUN_COMPLETION_KEY, JSON.stringify(value)); } catch {}
  return value;
}

export function firstRunStep({ languageExplicit, privacyResolved, notificationDue }) {
  if (!languageExplicit) return 'language';
  if (!privacyResolved) return 'privacy';
  if (notificationDue) return 'notifications';
  return '';
}
