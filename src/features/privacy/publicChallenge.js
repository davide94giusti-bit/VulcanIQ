const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const pendingLoads = new WeakMap();

// One bounded load per document, including concurrent forms. Failed loads may be retried.
export function loadPublicChallenge({ document = globalThis.document, window = globalThis.window, timeoutMs = 12000 } = {}) {
  if (typeof window?.turnstile?.render === 'function') return Promise.resolve(window.turnstile);
  if (!document || !window) return Promise.reject(new Error('challenge_unavailable'));
  if (pendingLoads.has(document)) return pendingLoads.get(document);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error) { script.remove(); reject(new Error('challenge_unavailable')); }
      else resolve(window.turnstile);
    };
    const timer = setTimeout(() => finish(true), timeoutMs);
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => finish(typeof window.turnstile?.render !== 'function');
    script.onerror = () => finish(true);
    document.head.appendChild(script);
  });
  pendingLoads.set(document, promise);
  promise.catch(() => { if (pendingLoads.get(document) === promise) pendingLoads.delete(document); });
  return promise;
}

// No token storage: callbacks invalidate expired/failed tokens and remove the iframe on cleanup.
export function mountPublicChallenge(api, container, { siteKey, language = 'it', action = 'public_submission', onChange }) {
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(action)) throw new Error('challenge_action_invalid');
  let alive = true;
  const change = (token, status) => { if (alive) onChange(token, status); };
  const widget = api.render(container, {
    sitekey: siteKey, language: language === 'it' ? 'it' : 'en', action,
    size: 'compact', theme: 'auto', tabindex: 0, retry: 'never',
    'refresh-expired': 'manual', 'response-field': false,
    callback: (token) => change(typeof token === 'string' ? token : '', token ? 'complete' : 'error'),
    'expired-callback': () => change('', 'expired'),
    'timeout-callback': () => change('', 'expired'),
    'error-callback': () => { change('', 'error'); return true; },
    'unsupported-callback': () => change('', 'error')
  });
  return () => { alive = false; api.remove(widget); };
}
