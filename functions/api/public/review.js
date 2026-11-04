import { bearerCode, publicMutation } from './_mutation.js';
export { onRequestOptions } from './_mutation.js';
export const onRequestPost = publicMutation('submit_public_review', (input) => {
  const code = bearerCode(input.p_booking_code);
  const text = String(input.p_review_text || '').trim();
  const name = String(input.p_reviewer_name || '').trim();
  if (!code || !text || text.length > 5000 || name.length > 120 || (input.p_rating != null && ![1, 2, 3, 4, 5].includes(input.p_rating))) return null;
  return { p_booking_code: code, p_review_text: text, p_reviewer_name: name || null, p_rating: input.p_rating || null, p_language: input.p_language === 'en' ? 'en' : 'it' };
}, () => ({ ok: true }));
