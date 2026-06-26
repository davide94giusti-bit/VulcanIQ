import { artifactFilename, backupErrorMessage, findLatestBackupArtifact, githubErrorCode, githubFetch, json, requestLanguage, requireActiveOwner } from './_shared.js';

export async function onRequestOptions() {
  return json(204, {});
}

export async function onRequestGet(context) {
  const language = requestLanguage(context.request, 'en');
  const ownerAccess = await requireActiveOwner(context.request, context.env || {}, language);
  if (!ownerAccess.ok) return ownerAccess.response;

  const latest = await findLatestBackupArtifact(context.env || {});
  if (!latest.ok) {
    return json(latest.status || 502, {
      ok: false,
      message: backupErrorMessage(language, latest.code),
      latestBackup: latest.latestBackup || null
    });
  }

  const artifact = latest.artifact;
  if (!String(artifact?.name || '').startsWith('vulcaniq-supabase-backup-')) {
    return json(404, { ok: false, message: backupErrorMessage(language, 'no_backup_artifacts') });
  }

  let response = await githubFetch(
    latest.config,
    `/repos/${encodeURIComponent(latest.config.owner)}/${encodeURIComponent(latest.config.repo)}/actions/artifacts/${encodeURIComponent(artifact.id)}/zip`,
    { redirect: 'manual' }
  );

  if (response.status >= 300 && response.status < 400 && response.headers.get('Location')) {
    response = await fetch(response.headers.get('Location'), {
      method: 'GET',
      headers: { Accept: 'application/zip' }
    });
  }

  if (!response.ok) {
    const code = response.status ? githubErrorCode(response.status) : 'artifact_download_failed';
    console.error('vulcanIQ backup artifact download failed', { status: response.status, code });
    return json(response.status || 502, { ok: false, message: backupErrorMessage(language, code) });
  }

  const zip = await response.arrayBuffer();
  if (!zip || zip.byteLength === 0) {
    return json(502, { ok: false, message: backupErrorMessage(language, 'artifact_download_failed') });
  }

  return new Response(zip, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${artifactFilename(artifact)}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
