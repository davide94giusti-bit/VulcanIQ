// Public input is interaction evidence only. Business outcomes come from trusted mutations.
import { routeDefinitionFromPathname } from '../src/app/publicRoutes.js';
export const TRUSTED_ANALYTICS_EVENTS = new Set([
  'booking_form_submit_success', 'booking_submit_success', 'booking_submit', 'booking_request_created',
  'booking_code_redeem_success', 'booking_code_redeemed', 'booking_code_submitted', 'fast_request_submit_success',
  'booking_code_review_submit_success', 'form_submit_success', 'gift_card_request_created', 'referral_booking_request_created',
  'lead_status_changed', 'lead_follow_up_set', 'review_request_sent', 'gift_card_status_changed', 'gift_card_paid',
  'gift_card_issued', 'gift_card_cancelled', 'review_requested_marked', 'review_received_marked', 'referral_code_created',
  'referral_code_disabled', 'partner_source_assigned', 'partner_commission_created', 'partner_commission_status_changed', 'partner_commission_marked_paid'
]);
const COMMON = ['source_section', 'source_cta', 'cta_location'];
const FORM = ['request_type', 'experience_id', 'experience_slug', 'step', 'step_id', 'step_index', 'field', 'field_name', 'validation_code', 'journey_id', 'booking_journey_id', 'journey_version', 'booking_journey_version', 'selected_date', 'selected_month', 'has_fixed_excursion'];
const SLUG = /^[a-zA-Z0-9][a-zA-Z0-9_:-]{0,99}$/;
export function publicEventMetadata(eventName, metadata) {
  const keys = [...COMMON];
  if (/booking|form|fast_request|gift_card/.test(eventName)) keys.push(...FORM);
  if (/experience|excursion|pricing/.test(eventName)) keys.push('experience_id', 'experience_slug', 'request_type', 'pricing_type');
  if (/review/.test(eventName)) keys.push('source', 'review_source');
  if (eventName === 'language_switch') keys.push('from', 'to');
  const safe = {};
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === 'boolean') safe[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000) safe[key] = value;
    else if (typeof value === 'string' && SLUG.test(value)) safe[key] = value;
  }
  return safe;
}
export function canonicalPublicPath(value) {
  const raw = String(value || '/').split(/[?#]/)[0];
  return routeDefinitionFromPathname(raw)?.path || '/';
}
export function validAnalyticsIdentity(value) { return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{11,139}$/.test(value); }
export function boundedEventTime(value, now = Date.now()) {
  const time = Date.parse(value || '');
  if (!Number.isFinite(time) || time > now + 300000 || time < now - 86400000) return null;
  return new Date(time).toISOString();
}
