// Unknown legacy completeness is preserved, never guessed from creation time.
export function planRetention(artifacts, keepCount = 3) {
  const rows = artifacts.filter((row) => row.name?.startsWith('vulcaniq-supabase-backup-') && !row.expired)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const complete = rows.filter((row) => row.name.endsWith('-complete'));
  const partial = rows.filter((row) => row.name.endsWith('-partial'));
  return { remove: [...complete.slice(keepCount), ...partial.slice(keepCount)], completeAvailable: complete.length > 0,
    lastCompleteExpiresAt: complete[0]?.expires_at || null };
}
