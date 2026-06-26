import { backupErrorMessage, findLatestBackupArtifact, findLatestBackupWorkflowRun, json, readBackupArtifactMetadata, requestLanguage, requireActiveOwner } from './_shared.js';

function wantsMetadata(request) {
  try {
    const url = new URL(request.url);
    return url.searchParams.get('metadata') === '1';
  } catch {
    return false;
  }
}

function attachMetadata(latestBackup, metadata) {
  if (!latestBackup) return latestBackup;
  if (!metadata?.storage) {
    return {
      ...latestBackup,
      storage: {
        detailsAvailable: false,
        included: null,
        fileCount: null,
        sizeInBytes: null,
        bucketCount: null,
        failureCount: null
      }
    };
  }
  return { ...latestBackup, storage: metadata.storage };
}

export async function onRequestOptions() {
  return json(204, {});
}

export async function onRequestGet(context) {
  const language = requestLanguage(context.request, 'en');
  const ownerAccess = await requireActiveOwner(context.request, context.env || {}, language);
  if (!ownerAccess.ok) return ownerAccess.response;

  const [latest, workflow] = await Promise.all([
    findLatestBackupArtifact(context.env || {}),
    findLatestBackupWorkflowRun(context.env || {})
  ]);
  const workflowRun = workflow.ok ? workflow.workflowRun : null;
  const includeMetadata = wantsMetadata(context.request);
  const metadata = latest.ok && includeMetadata
    ? await readBackupArtifactMetadata(latest.config, latest.artifact)
    : null;

  if (!latest.ok) {
    return json(latest.status === 404 || latest.status === 410 ? 200 : latest.status || 502, {
      ok: latest.status === 404 || latest.status === 410,
      configured: latest.code !== 'github_backup_not_configured',
      latestBackup: attachMetadata(latest.latestBackup || null, metadata),
      workflowRun,
      message: backupErrorMessage(language, latest.code),
      code: latest.code
    });
  }

  return json(200, {
    ok: true,
    configured: true,
    latestBackup: attachMetadata(latest.latestBackup, metadata),
    workflowRun
  });
}
