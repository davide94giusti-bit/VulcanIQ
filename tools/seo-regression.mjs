import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_INDEXABLE_PATHS, routeDefinitionFromPathname } from '../src/app/publicRoutes.js';
import { SITE_ORIGIN, absoluteSiteUrl } from '../src/config/site.js';
import { structuredDataFor } from '../src/seo/structuredData.js';
import { seoMetaFor } from '../src/seo/metadata.js';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const passes = [];
const failures = [];
function test(name, fn) {
  try { fn(); passes.push(name); }
  catch (error) { failures.push(`${name}: ${error.message}`); }
}

const seo = read('src/seo.js');
const site = read('src/config/site.js');
const sitemap = read('public/sitemap.xml');
const robots = read('public/robots.txt');
const redirects = read('public/_redirects');
const headers = read('public/_headers');
const index = read('index.html');
const notFound = read('public/404.html');
const mainSource = read('src/main.jsx');
const allSeoFiles = `${seo}\n${site}\n${sitemap}\n${robots}\n${index}`;

function sitemapLocs(xml) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
}

function redirectSources(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => line.split(/\s+/)[0]);
}

test('canonical site origin is production apex', () => {
  assert.equal(SITE_ORIGIN, 'https://vulcaniq.it');
  assert.equal(absoluteSiteUrl('/brand/vulcaniq/og-image.png'), 'https://vulcaniq.it/brand/vulcaniq/og-image.png');
});

test('SEO assets contain no obsolete .com canonical host', () => {
  assert.equal(allSeoFiles.includes('www.vulcaniq.com'), false);
});

test('sitemap contains exactly supported indexable canonical routes', () => {
  assert.deepEqual(sitemapLocs(sitemap).sort(), [...PUBLIC_INDEXABLE_PATHS].sort());
  for (const pathname of sitemapLocs(sitemap)) assert.ok(routeDefinitionFromPathname(pathname));
});

test('sitemap excludes phantom keyword landing pages and /home duplicate', () => {
  for (const phantom of ['/home','/etna-private-tour','/etna-tour-from-catania','/mount-etna-family-experience','/etna-sunset-excursion','/etna-volcano-guide','/etna-school-trip','/etna-corporate-team-building','/etna-live-volcano-tour','/etna-cultural-experience']) {
    assert.equal(sitemap.includes(`<loc>${SITE_ORIGIN}${phantom}</loc>`), false, phantom);
  }
});

test('robots points to canonical sitemap and blocks admin/API/referral paths', () => {
  assert.match(robots, /Sitemap: https:\/\/vulcaniq\.it\/sitemap\.xml/);
  assert.match(robots, /Disallow: \/admin\//);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Disallow: \/r\//);
});

test('unknown paths are no longer globally rewritten to the SPA', () => {
  const liveRules = redirects.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  assert.equal(liveRules.includes('/* /index.html 200'), false);
  assert.match(notFound, /noindex,nofollow/);
});

test('routing shortcuts are not duplicated', () => {
  const sources = redirectSources(redirects);
  assert.equal(new Set(sources).size, sources.length);
  assert.match(redirects, /^\/home \/ 301$/m);
});

test('admin receives noindex response header and CSP is report-only during rollout', () => {
  assert.match(headers, /\/admin\/\*[\s\S]*X-Robots-Tag: noindex, nofollow/);
  assert.match(headers, /Content-Security-Policy-Report-Only:/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /frame-ancestors 'none'/);
});

test('static social metadata uses absolute image and canonical host', () => {
  assert.match(index, /rel="canonical" href="https:\/\/vulcaniq\.it\/"/);
  assert.match(index, /property="og:image" content="https:\/\/vulcaniq\.it\//);
  assert.match(index, /name="twitter:card" content="summary_large_image"/);
});

test('runtime SEO supports preview/noindex and coherent Italian/English alternates', () => {
  assert.match(seo, /isCloudflarePreviewHostname/);
  assert.match(seo, /noindex,nofollow/);
  assert.match(seo, /hreflang: 'it'/);
  assert.match(seo, /hreflang: 'en'/);
  assert.match(seo, /hreflang: 'x-default'/);
});

test('structured data parses and contains no self-serving aggregateRating', () => {
  const graph = structuredDataFor('reviews', 'it', 'https://vulcaniq.it/reviews');
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(graph)));
  assert.equal(JSON.stringify(graph).includes('aggregateRating'), false);
});

test('all indexable routes have localized SEO metadata', () => {
  for (const pathname of PUBLIC_INDEXABLE_PATHS) {
    const route = routeDefinitionFromPathname(pathname);
    for (const lang of ['it','en']) {
      const meta = seoMetaFor(route.page, lang);
      assert.ok(meta.title?.length > 8, `${pathname} ${lang} title`);
      assert.ok(meta.description?.length > 40, `${pathname} ${lang} description`);
    }
  }
});

test('partnerships and latest-news render helpers remain defined after feature extraction', () => {
  for (const helper of [
    'normalizedKeyText',
    'partnershipCategoryOption',
    'partnershipCategoryLabel',
    'partnershipCategoryKey',
    'partnershipCategoryLabelsForKey',
    'localizedPartnershipDescription',
    'createTextTeaser',
    'FormattedText'
  ]) {
    assert.match(mainSource, new RegExp(`function\\s+${helper}\\s*\\(`), helper);
  }
  assert.match(mainSource, /normalizeLatestNewsTitle[\s\S]*normalizedKeyText\(clean\)/);
  assert.match(mainSource, /items\.map\(\(item\) => \(\{ \.\.\.item, categoryKey: partnershipCategoryKey\(item\) \}\)\)/);
});

for (const name of passes) console.log(`PASS  ${name}`);
for (const name of failures) console.error(`FAIL  ${name}`);
console.log(`\n${passes.length} passed, ${failures.length} failed.`);
if (failures.length) process.exit(1);
