import { readFileSync } from 'node:fs';
// Supplemental source guards inspect the actual split modules, not a copied fixture.
export function readApplicationSource() {
  return ['src/main.jsx', 'src/app/siteShared.jsx', 'src/app/PublicApp.jsx', 'src/features/admin/AdminApp.jsx']
    .map(path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')).join('\n');
}
