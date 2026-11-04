import { createPublicBookingRequest } from './bookingRequests.js';
import { trackBookingSubmitAttempt, trackBookingSubmitSuccess, trackBookingSubmitError, canTrack } from '../analytics.js';
import { withoutOptionalAnalytics } from '../domain/analyticsPrivacy.js';

function safeErrorMetadata(error) {
  return {
    error_message: String(error?.message || 'booking_request_insert_failed').slice(0, 180),
    error_code: String(error?.code || error?.status || '').slice(0, 80),
    trace_id: String(error?.traceId || '').slice(0, 80) || undefined
  };
}

async function safeTrack(run, label) {
  try {
    await run();
  } catch (error) {
    // Analytics is diagnostic-only and must never block request creation.
    console.warn(`[analytics] ${label} failed`, { code: 'analytics_nonblocking_failure' });
  }
}

export async function submitPublicBookingRequestWithTracking({ payload, experience, adults, children, metadata = {}, attemptAlreadyTracked = false }) {
  const totalParticipants = Number(adults || 0) + Number(children || 0);
  const baseMetadata = { ...metadata, participants: totalParticipants };

  if (!attemptAlreadyTracked) {
    await safeTrack(
      () => trackBookingSubmitAttempt(experience, adults, children, baseMetadata),
      'booking submit attempt'
    );
  }

  try {
    const createdRequest = await createPublicBookingRequest(withoutOptionalAnalytics(payload, canTrack()));
    const bookingRequestId = createdRequest?.id || createdRequest?.booking_request_id || '';
    const successMetadata = {
      ...baseMetadata,
      ...(bookingRequestId ? { booking_request_id: bookingRequestId, request_id: bookingRequestId } : {})
    };

    await safeTrack(
      () => trackBookingSubmitSuccess(experience, adults, children, successMetadata),
      'booking submit success'
    );

    return createdRequest;
  } catch (error) {
    await safeTrack(
      () => trackBookingSubmitError(experience, 'supabase_insert_error', { ...baseMetadata, ...safeErrorMetadata(error) }),
      'booking submit error'
    );
    throw error;
  }
}
