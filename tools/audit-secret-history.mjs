import { execFileSync } from 'node:child_process';
import { secretFindings } from './release-source.mjs';

// Explicit relevant source checkpoints, not arbitrary user artifact directories.
// Print paths/rules/revisions only. Never print blobs or matched credentials.
const revisions = process.argv.slice(2);
if (!revisions.length) throw Error('Provide reviewed commit IDs to scan.');
const git = args => execFileSync('git', args, { maxBuffer: 96 * 1024 * 1024 });
const findings = []; let files = 0;
for (const revision of revisions) {
  if (!/^[a-f0-9]{7,40}$/.test(revision)) throw Error('Only explicit commit hashes are accepted.');
  git(['rev-parse', '--verify', `${revision}^{commit}`]);
  const sources = git(['ls-tree', '-r', '-z', revision]).toString().split('\0').flatMap(record => {
    const match = record.match(/^\d+ blob ([a-f0-9]+)\t(.+)$/);
    if (!match) return [];
    const [, oid, name] = match;
    return /\.(?:js|mjs|cjs|jsx|ts|tsx|sql|json|toml|ya?ml|md|txt|ps1|sh|env|example)$/.test(name) || /(?:^|\/)\.env(?:\.|$)/.test(name) ? [{ oid, name }] : [];
  });
  const batch = execFileSync('git', ['cat-file', '--batch'], { input: sources.map(row => row.oid).join('\n') + '\n', maxBuffer: 96 * 1024 * 1024 });
  let cursor = 0;
  for (const { name } of sources) {
    const end = batch.indexOf(10, cursor);
    const header = batch.subarray(cursor, end).toString().match(/^[a-f0-9]+ blob (\d+)$/);
    if (!header) throw Error('Invalid Git blob framing');
    const length = Number(header[1]);
    const result = secretFindings(name, batch.subarray(end + 1, end + 1 + length));
    cursor = end + 1 + length + 1;
    findings.push(...result.map(row => ({ revision, ...row }))); files++;
  }
}
console.log(JSON.stringify({ revisions, files, findings }, null, 2));
process.exitCode = findings.length ? 1 : 0;
