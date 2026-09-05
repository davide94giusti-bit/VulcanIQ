const termsCache = new Map();

export async function getApplicableTerms(purpose, locale) {
  const safePurpose = ['booking_request', 'excursion_booking'].includes(purpose) ? purpose : '';
  const safeLocale = locale === 'en' ? 'en' : 'it';
  if (!safePurpose) throw new Error('terms_request_invalid');
  const cacheKey = `${safePurpose}:${safeLocale}`;
  if (termsCache.has(cacheKey)) return termsCache.get(cacheKey);
  const response = await fetch(`/api/public/terms?purpose=${encodeURIComponent(safePurpose)}&locale=${safeLocale}`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.ok || !result?.terms?.id) {
    const error = new Error(result?.code || 'terms_unavailable');
    error.code = result?.code || 'terms_unavailable';
    error.status = response.status;
    throw error;
  }
  termsCache.set(cacheKey, result.terms);
  return result.terms;
}
