import { buildParticipantTermsInvitationEmail } from '../_shared/participantTermsInvitationEmail.ts';
import { dbJson, env, readJson, resendEmail } from '../_shared/vulcaniq.ts';

const encoder = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const INPUT_KEYS = new Set(['bookingRequestId', 'participantId', 'organizerParticipantId', 'locale', 'recipientEmail']);

function response(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

function equalSecret(actual: string, expected: string): boolean {
  const left = encoder.encode(actual);
  const right = encoder.encode(expected);
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) mismatch |= (left[index] || 0) ^ (right[index] || 0);
  return mismatch === 0;
}

function normalizeEmail(value: unknown): string {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw || raw.length > 254 || /[\u0000-\u001f\u007f]/.test(raw) || !EMAIL.test(raw)) throw new Error('recipient_email_invalid');
  return raw;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(3, Math.min(8, local.length - visible.length)))}@${domain}`;
}

function acceptanceBaseUrl(): URL {
  const configured = env('PARTICIPANT_TERMS_ACCEPTANCE_BASE_URL');
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('acceptance_base_url_invalid');
  url.pathname = '/terms-acceptance';
  return url;
}

function createRawToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return response(405, { ok: false, code: 'method_not_allowed' });

  try {
    const expectedSecret = env('PARTICIPANT_TERMS_DELIVERY_SECRET');
    const suppliedSecret = request.headers.get('x-vulcaniq-participant-terms-delivery-secret') || '';
    if (expectedSecret.length < 32) return response(503, { ok: false, code: 'delivery_not_configured' });
    if (!suppliedSecret || !equalSecret(suppliedSecret, expectedSecret)) return response(401, { ok: false, code: 'unauthorized' });

    const input = await readJson(request, 4096);
    if (Object.keys(input).some((key) => !INPUT_KEYS.has(key))) return response(400, { ok: false, code: 'invalid_request' });

    const bookingRequestId = String(input.bookingRequestId || '');
    const participantId = String(input.participantId || '');
    const organizerParticipantId = String(input.organizerParticipantId || '');
    const locale = input.locale === 'en' ? 'en' : input.locale === 'it' ? 'it' : '';
    if (!UUID.test(bookingRequestId) || !UUID.test(participantId) || !UUID.test(organizerParticipantId) || !locale) {
      return response(400, { ok: false, code: 'invalid_request' });
    }
    const recipientEmail = normalizeEmail(input.recipientEmail);
    const destinationHint = maskEmail(recipientEmail);
    const acceptanceUrl = acceptanceBaseUrl();
    const rawToken = createRawToken();
    const tokenHash = await hashToken(rawToken);

    const issuedRows = await dbJson('rpc/issue_participant_terms_acceptance_invitation', {
      method: 'POST',
      body: JSON.stringify({
        p_booking_request_id: bookingRequestId,
        p_participant_id: participantId,
        p_organizer_participant_id: organizerParticipantId,
        p_locale: locale,
        p_token_hash: tokenHash
      })
    }) as Array<Record<string, unknown>>;
    const issued = Array.isArray(issuedRows) ? issuedRows[0] : null;
    const invitationId = String(issued?.invitation_id || '');
    if (!UUID.test(invitationId) || !issued?.expires_at) throw new Error('invitation_issue_failed');

    acceptanceUrl.hash = `token=${rawToken}`;
    const email = buildParticipantTermsInvitationEmail(locale, acceptanceUrl.toString());

    try {
      await resendEmail({
        to: recipientEmail,
        subject: email.subject,
        html: email.html,
        from: env('PARTICIPANT_TERMS_FROM_EMAIL', false) || undefined
      });
    } catch {
      await dbJson('rpc/revoke_failed_participant_terms_email_invitation', {
        method: 'POST',
        body: JSON.stringify({ p_invitation_id: invitationId, p_token_hash: tokenHash })
      }).catch(() => null);
      throw new Error('invitation_delivery_failed');
    }

    return response(200, {
      ok: true,
      item: {
        status: 'sent',
        destinationHint,
        termsVersion: issued.terms_version,
        locale: issued.locale,
        representationType: issued.representation_type,
        expiresAt: issued.expires_at
      }
    });
  } catch (error) {
    const code = String(error instanceof Error ? error.message : error);
    if (code === 'recipient_email_invalid') return response(400, { ok: false, code: 'recipient_email_invalid' });
    if (code.startsWith('missing_') || code === 'acceptance_base_url_invalid') return response(503, { ok: false, code: 'delivery_not_configured' });
    return response(409, { ok: false, code: 'invitation_delivery_rejected' });
  }
});
