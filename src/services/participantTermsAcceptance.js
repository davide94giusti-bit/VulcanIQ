const ACCEPTANCE_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

export function consumeParticipantTermsToken() {
  if (typeof window === 'undefined') return '';
  const hash = String(window.location.hash || '').replace(/^#/, '');
  const token = new URLSearchParams(hash).get('token') || '';
  if (window.location.hash) {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  }
  return ACCEPTANCE_TOKEN_PATTERN.test(token) ? token.toLowerCase() : '';
}

async function postAcceptanceAction(action, payload) {
  const response = await fetch(`/api/public/terms-acceptance/${action}`, {
    method: 'POST',
    cache: 'no-store',
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok !== true) {
    const error = new Error('terms_acceptance_unavailable');
    error.code = String(result?.code || result?.error || 'terms_acceptance_unavailable');
    error.status = response.status;
    throw error;
  }
  return result;
}

export function resolveParticipantTermsInvitation(token) {
  if (!ACCEPTANCE_TOKEN_PATTERN.test(String(token || ''))) return Promise.reject(new Error('terms_acceptance_unavailable'));
  return postAcceptanceAction('resolve', { token });
}

export function confirmParticipantTermsAcceptance(token) {
  if (!ACCEPTANCE_TOKEN_PATTERN.test(String(token || ''))) return Promise.reject(new Error('terms_acceptance_unavailable'));
  return postAcceptanceAction('confirm', { token, accepted: true });
}
