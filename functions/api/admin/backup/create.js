import {
  claimAdminActionRateLimit,
  cleanText,
  findLatestBackupWorkflowRun,
  githubConfig,
  githubFetch,
  json,
  localized,
  readRequestJsonWithinLimit,
  requestHasJsonContentType,
  requireActiveOwner
} from './_shared.js';

function isActiveWorkflowRun(run) {
  return ['queued', 'in_progress', 'waiting', 'requested', 'pending'].includes(String(run?.status || '').toLowerCase());
}

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

  if (response.status === 204) return { ok: true, authMode: response.vulcaniqAuthMode || config.authMode };
  return { ok: false, status: response.status || 502, code: 'github_dispatch_failed' };
}

export async function onRequestOptions() {
  return json(204, {});
}

export async function onRequestPost(context) {
  if (!requestHasJsonContentType(context.request)) {
    return json(415, { ok: false, message: 'Content-Type must be application/json.' });
  }

  const parsedBody = await readRequestJsonWithinLimit(context.request, 8192);
  if (!parsedBody.ok) {
    const message = parsedBody.status === 413
      ? 'Request body is too large.'
      : 'Request body must contain a valid JSON object.';
    return json(parsedBody.status, { ok: false, message });
  }

  const body = parsedBody.value;
  const language = cleanText(body.language, 8) === 'it' ? 'it' : 'en';
  const ownerAccess = await requireActiveOwner(context.request, context.env || {}, language);
  if (!ownerAccess.ok) return ownerAccess.response;

  const rateLimitAllowed = await claimAdminActionRateLimit(
    ownerAccess.config,
    'backup_create',
    ownerAccess.user.id,
    2,
    600
  );
  if (!rateLimitAllowed) {
    return json(429, {
      ok: false,
      message: localized(language, 'Limite backup raggiunto. Attendi prima di riprovare.', 'Backup rate limit reached. Wait before trying again.')
    });
  }

  const workflow = await findLatestBackupWorkflowRun(context.env || {});
  if (workflow.ok && isActiveWorkflowRun(workflow.workflowRun)) {
    return json(409, {
      ok: false,
      code: 'backup_already_running',
      message: localized(language, 'Un backup è già in esecuzione.', 'A backup is already in progress.')
    });
  }

  const dispatch = await dispatchWorkflow(context.env || {}, ownerAccess.user, language);
  if (!dispatch.ok) {
    const message = dispatch.code === 'github_backup_not_configured'
      ? localized(language, 'Configura le variabili GitHub server-side prima di avviare il backup.', 'Configure the server-side GitHub variables before starting the backup.')
      : localized(language, 'GitHub Actions non ha accettato la richiesta di backup.', 'GitHub Actions did not accept the backup request.');
    return json(dispatch.status || 502, { ok: false, message });
  }

  console.info('vulcanIQ backup workflow dispatched', {
    authMode: dispatch.authMode,
    requestedBy: ownerAccess.user.id
  });

  return json(200, {
    ok: true,
    message: localized(language, 'Backup avviato', 'Backup started'),
    requestedAt: new Date().toISOString(),
    authentication: dispatch.authMode
  });
}
