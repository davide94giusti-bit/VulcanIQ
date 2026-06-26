import { cleanText, githubConfig, githubFetch, json, localized, readRequestJson, requireActiveOwner } from './_shared.js';

async function dispatchWorkflow(env, user, language) {
  const config = githubConfig(env || {});
  if (!config) return { ok: false, status: 500, code: 'github_backup_not_configured' };

  const response = await githubFetch(
    config,
    `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/actions/workflows/${encodeURIComponent(config.workflowId)}/dispatches`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: config.ref,
        inputs: {
          requested_by: cleanText(user.email || user.id, 160),
          language: language === 'it' ? 'it' : 'en'
        }
      })
    }
  );

  if (response.status === 204) return { ok: true };
  return { ok: false, status: response.status || 502, code: 'github_dispatch_failed' };
}

export async function onRequestOptions() {
  return json(204, {});
}

export async function onRequestPost(context) {
  const body = await readRequestJson(context.request);
  const language = cleanText(body.language, 8) === 'it' ? 'it' : 'en';
  const ownerAccess = await requireActiveOwner(context.request, context.env || {}, language);
  if (!ownerAccess.ok) return ownerAccess.response;

  const dispatch = await dispatchWorkflow(context.env || {}, ownerAccess.user, language);
  if (!dispatch.ok) {
    const message = dispatch.code === 'github_backup_not_configured'
      ? localized(language, 'Configura le variabili GitHub server-side prima di avviare il backup.', 'Configure the server-side GitHub variables before starting the backup.')
      : localized(language, 'GitHub Actions non ha accettato la richiesta di backup.', 'GitHub Actions did not accept the backup request.');
    return json(dispatch.status || 502, { ok: false, message });
  }

  return json(200, { ok: true, message: localized(language, 'Backup avviato', 'Backup started'), requestedAt: new Date().toISOString() });
}
