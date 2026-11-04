// Old public objects are retained for rollback and because other records may share them.
// Only objects from a failed upload phase are provably uncommitted and safe to remove.
export async function replaceBilingualAssets({ uploadIt, uploadEn, removeNew, commit }) {
  const uploaded = [];
  let it = {};
  let en = {};
  try {
    if (uploadIt) { it = await uploadIt(); uploaded.push(it); }
    if (uploadEn) { en = await uploadEn(); uploaded.push(en); }
  } catch (error) {
    await Promise.allSettled(uploaded.map(removeNew));
    throw error;
  }
  // A lost DB response is ambiguous: retain the new bytes, too. A reviewed orphan
  // sweep can later establish non-reference; never break an acknowledged commit.
  return commit(it, en);
}
