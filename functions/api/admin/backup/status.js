import { backupErrorMessage, findLatestBackupArtifact, json, requestLanguage, requireActiveOwner } from './_shared.js';

export async function onRequestOptions() {
  return json(204, {});
}

export async function onRequestGet(context) {
  const language = requestLanguage(context.request, 'en');
  const ownerAccess = await requireActiveOwner(context.request, context.env || {}, language);
  if (!ownerAccess.ok) return ownerAccess.response;

  const latest = await findLatestBackupArtifact(context.env || {});
  if (!latest.ok) {
    return json(latest.status === 404 || latest.status === 410 ? 200 : latest.status || 502, {
      ok: latest.status === 404 || latest.status === 410,
      configured: latest.code !== 'github_backup_not_configured',
      latestBackup: latest.latestBackup || null,
      message: backupErrorMessage(language, latest.code),
      code: latest.code
    });
  }

  return json(200, {
    ok: true,
    configured: true,
    latestBackup: latest.latestBackup
  });
}
