import { backupErrorMessage, findLatestBackupArtifact, findLatestBackupWorkflowRun, json, readBackupArtifactMetadata, requestLanguage, requireActiveOwner } from './_shared.js';

function wantsMetadata(request) {
  try {
    const url = new URL(request.url);
    return url.searchParams.get('metadata') === '1';
  } catch {
    return false;
  }
}

function validIsoString(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function attachMetadata(latestBackup, metadata) {
  if (!latestBackup) return latestBackup;
  const metadataBackupCreatedAt = validIsoString(metadata?.backupCreatedAtUtc || metadata?.projectInfo?.backup_created_at_utc || metadata?.projectInfo?.backupCreatedAtUtc);
  const fallbackCreatedAt = validIsoString(latestBackup.backupCreatedAt || latestBackup.parsedBackupCreatedAt || latestBackup.artifactCreatedAt || latestBackup.createdAt);
  const backupCreatedAt = metadataBackupCreatedAt || fallbackCreatedAt;
  const storage = metadata?.storage || {
    detailsAvailable: false,
    included: null,
    status: 'none',
    fileCount: null,
    sizeInBytes: null,
    bucketCount: null,
    failureCount: null,
    failures: []
  };

  return {
    ...latestBackup,
    createdAt: backupCreatedAt,
    backupCreatedAt,
    backupCreatedAtSource: metadataBackupCreatedAt
      ? '00_project_info.json'
      : latestBackup.backupCreatedAtSource || (latestBackup.parsedBackupCreatedAt ? 'artifact_name' : 'github_artifact_created_at'),
    artifactCreatedAt: latestBackup.artifactCreatedAt || latestBackup.uploadedAt || latestBackup.createdAt,
    storage,
    auth: metadata?.auth || { schemaIncluded: false, dataIncluded: false, restoreMode: 'manual_reprovision' },
    integrity: metadata?.integrity || { sha256ManifestIncluded: false, dataClassification: 'confidential_restricted' },
    metadataAvailable: Boolean(metadata?.projectInfo || metadata?.storageManifest)
  };
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
