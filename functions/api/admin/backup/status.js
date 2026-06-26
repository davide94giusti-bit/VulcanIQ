function json(status, body = {}) {
  if (status === 204) return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

function cleanText(value, maxLength = 160) {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength);
}

export async function onRequestGet(context) {
  const owner = cleanText(context.env?.GITHUB_OWNER, 120);
  const repo = cleanText(context.env?.GITHUB_REPO, 120);
  const workflowId = cleanText(context.env?.GITHUB_BACKUP_WORKFLOW_ID || 'vulcaniq-db-backup.yml', 180);
  const configured = Boolean(owner && repo);
  return json(200, {
    ok: true,
    configured,
    workflow_url: configured ? `https://github.com/${owner}/${repo}/actions/workflows/${workflowId}` : null
  });
}
