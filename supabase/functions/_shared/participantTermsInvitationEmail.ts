import { escapeHtml } from './vulcaniq.ts';

type InvitationEmail = { subject: string; html: string };

export function buildParticipantTermsInvitationEmail(locale: string, acceptanceUrl: string): InvitationEmail {
  const english = locale === 'en';
  const safeUrl = escapeHtml(acceptanceUrl);
  const subject = english
    ? 'Review and accept your vulcanIQ experience Terms'
    : 'Consulta e accetta i Termini della tua esperienza vulcanIQ';
  const heading = english ? 'Your Terms invitation' : 'Il tuo invito per i Termini';
  const intro = english
    ? 'You have been invited to review and personally accept the Terms & Conditions for a vulcanIQ experience.'
    : 'Hai ricevuto un invito per consultare e accettare personalmente i Termini e Condizioni di un’esperienza vulcanIQ.';
  const action = english ? 'Review Terms' : 'Consulta i Termini';
  const expiry = english
    ? 'This private link expires after 24 hours and can be used only once. Do not forward it.'
    : 'Questo collegamento privato scade dopo 24 ore e può essere utilizzato una sola volta. Non inoltrarlo.';
  const ignore = english
    ? 'If you were not expecting this invitation, you can ignore this email.'
    : 'Se non aspettavi questo invito, puoi ignorare questa email.';

  return {
    subject,
    html: `<!doctype html><html lang="${english ? 'en' : 'it'}"><body style="font-family:Arial,sans-serif;color:#102030;line-height:1.55"><h1>${heading}</h1><p>${intro}</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#1f5f50;color:#fff;text-decoration:none">${action}</a></p><p>${expiry}</p><p>${ignore}</p></body></html>`
  };
}
