const OPTIONAL_ANALYTICS = /^(?:analytics_|utm_|visitor_id$|session_id$|booking_journey_|traffic_source$|detected_source$|referrer$|landing_path$|device_type$|browser$|operating_system$)/;
// Operational fields, explicit declared source and idempotency stay available without tracking.
export function withoutOptionalAnalytics(input = {}, allowed = false) {
  return allowed ? { ...input } : Object.fromEntries(Object.entries(input).filter(([key]) => key === 'booking_journey_version' || !OPTIONAL_ANALYTICS.test(key)));
}
