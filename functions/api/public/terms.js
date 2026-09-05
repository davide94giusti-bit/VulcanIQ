import { cleanText, json, supabaseRpc } from './_shared.js';

const PURPOSES = new Set(['booking_request', 'excursion_booking']);
const LOCALES = new Set(['it', 'en']);

export async function onRequestOptions(context) {
  return json(context.request, context.env, 204);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const purpose = cleanText(url.searchParams.get('purpose'), 40);
  const locale = cleanText(url.searchParams.get('locale'), 8);
  if (!PURPOSES.has(purpose) || !LOCALES.has(locale)) {
    return json(context.request, context.env, 400, { ok: false, code: 'terms_request_invalid' });
  }

  try {
    const result = await supabaseRpc(context.env, 'resolve_current_terms_version', {
      p_document_purpose: purpose,
      p_locale: locale
    });
    const row = Array.isArray(result) ? result[0] : result;
    const content = row?.content_snapshot;
    if (!row?.id || !row?.version || !content || !Array.isArray(content.sections)) {
      return json(context.request, context.env, 503, { ok: false, code: 'terms_unavailable' });
    }
    return json(context.request, context.env, 200, {
      ok: true,
      terms: {
        id: row.id,
        purpose: row.document_purpose,
        version: row.version,
        locale: row.locale,
        effectiveAt: row.effective_at,
        content: {
          intro: String(content.intro || ''),
          sections: content.sections.map((section) => ({
            title: String(section?.title || ''),
            body: String(section?.body || '')
          })).filter((section) => section.title && section.body)
        }
      }
    });
  } catch {
    return json(context.request, context.env, 503, { ok: false, code: 'terms_unavailable' });
  }
}
