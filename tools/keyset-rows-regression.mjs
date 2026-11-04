import assert from 'node:assert/strict';
import { collectKeysetRows } from '../src/services/keysetRows.js';
let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
function fixture(size, cap, failAt = Infinity) {
  const rows = Array.from({ length: size }, (_, index) => ({ id: String(index).padStart(6, '0') }));
  let calls = 0;
  return () => {
    let after = ''; let limit = 250;
    const q = { order() { return q; }, limit(n) { limit = n; return q; }, gt(_, n) { after = n; return q; }, then(resolve) { calls++; resolve(calls === failAt ? { error: new Error('network') } : { data: rows.filter((r) => r.id > after).slice(0, Math.min(limit, cap)) }); } };
    return q;
  };
}
for (const n of [0, 1, 251, 501, 1001]) await test(`${n} rows survive server cap below requested page size`, async () => assert.equal((await collectKeysetRows(fixture(n, 100))).length, n));
await test('partial dependency failure rejects instead of returning partial totals', async () => assert.rejects(collectKeysetRows(fixture(501, 100, 3)), /network/));
await test('safety ceiling reports explicit failure instead of truncation', async () => assert.rejects(collectKeysetRows(fixture(501, 100), { maximum: 250 }), /DETAIL_EXPORT_LIMIT/));
console.log(`${passed} passed, 0 failed.`);
