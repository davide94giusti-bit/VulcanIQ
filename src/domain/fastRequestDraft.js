const KEY = 'vulcaniq_fast_request';
const DAY = 24 * 60 * 60 * 1000;

// Explicit allowlist: never persist contact details or free-form attribution text.
export function safeFastRequestDraft(form, now = Date.now()) {
  return Object.fromEntries([
    ...['experienceId', 'dateMode', 'customDate', 'adults', 'children', 'heardAboutUs']
      .map((key) => [key, String(form[key] || '').slice(0, 80)]),
    ['expires_at', now + DAY]
  ]);
}

export function createFastRequestDraft(storage) {
  let latest;
  let submitted = false;
  return {
    update(form) { latest = safeFastRequestDraft(form); },
    save() {
      try { if (submitted) storage.removeItem(KEY); else if (latest) storage.setItem(KEY, JSON.stringify(latest)); } catch { /* optional persistence */ }
    },
    submitted() { submitted = true; try { storage.removeItem(KEY); } catch { /* optional persistence */ } }
  };
}
