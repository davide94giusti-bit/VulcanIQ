// Compatibility collector for existing list consumers. Each database read is bounded;
// totals use SQL aggregation. A safety ceiling throws instead of claiming a complete sample.
export async function collectKeysetRows(makeQuery, { pageSize = 250, maximum = 100000 } = {}) {
  const rows = [];
  let after = null;
  for (;;) {
    let query = makeQuery().order('id', { ascending: true }).limit(pageSize);
    if (after) query = query.gt('id', after);
    const { data, error } = await query;
    if (error) throw error;
    const page = data || [];
    if (!page.length) return rows;
    rows.push(...page);
    const next = page.at(-1)?.id;
    if (!next || next === after) throw new Error('INVALID_PAGINATION_CURSOR');
    after = next;
    if (rows.length > maximum) throw new Error('DETAIL_EXPORT_LIMIT_USE_SCOPED_FILTERS');
    // Do not treat a short page as completion: PostgREST may cap below pageSize.
  }
}
