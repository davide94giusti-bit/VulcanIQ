import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { transformWithEsbuild } from 'vite';

// Compile-only checking: no provider imports, application execution, or secrets read.
// esbuild is Vite's locked build dependency; this adds no new dependency.
const roots = ['functions', 'supabase/functions', 'src', 'shared', 'scripts', 'tools', 'workers/notifications'];
const files = [];
async function visit(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.wrangler', '.temp', 'dist', 'outputs', 'tmp_artifact'].includes(item.name)) continue;
    const file = path.join(directory, item.name);
    if (item.isDirectory()) await visit(file);
    else if (item.isFile() && /\.(?:mjs|cjs|js|jsx|ts|tsx)$/.test(file) && !file.endsWith('.d.ts')) files.push(file);
  }
}
for (const root of roots) await visit(root);
let passed = 0;
for (const file of files.sort()) {
  if (/\.[jt]sx$/.test(file)) await transformWithEsbuild(await readFile(file, 'utf8'), file, { loader: file.endsWith('.tsx') ? 'tsx' : 'jsx', logLevel: 'silent' });
  else {
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '--check', file], { encoding: 'utf8', timeout: 15000 });
    if (result.status !== 0) { console.error(`FAIL syntax ${file}\n${result.stderr || result.error?.message || 'unknown syntax failure'}`); process.exit(1); }
  }
  passed++;
}
console.log(`Syntax/JSX compile: ${passed} passed, 0 failed. Not a whole-program type or semantic check.`);
