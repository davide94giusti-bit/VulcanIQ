// Stop only on an empty page: PostgREST may cap below our requested page size.
// A bounded failure is preferable to sending a plausible but truncated recap.
export async function completeRows(dbJson, table, query, { maximum = 20000, timeoutMs = 45000 } = {}) {
  if (!/^[a-z_]+$/.test(table)) throw new Error('recap_source_invalid');
  const params = new URLSearchParams(query);
  params.set('order', 'id.asc');
  params.set('limit', '250');
  const rows = [];
  const seen = new Set();
  const started = Date.now();
  let cursor = '';
  while (true) {
    if (Date.now() - started > timeoutMs) throw new Error('recap_source_timeout');
    if (cursor) params.set('id', `gt.${cursor}`);
    const page = await dbJson(`${table}?${params}`, { method: 'GET' });
    if (!Array.isArray(page)) throw new Error('recap_source_invalid');
    if (!page.length) return rows;
    for (const row of page) {
      const id = String(row?.id || '');
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || seen.has(id)) throw new Error('recap_cursor_invalid');
      seen.add(id);
      rows.push(row);
    }
    if (rows.length > maximum) throw new Error('recap_source_limit');
    cursor = String(page.at(-1).id);
  }
}
