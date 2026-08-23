import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const passes = [];
const failures = [];

function test(name, fn) {
  try {
    fn();
    passes.push(name);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}

const mainSource = read('src/main.jsx');
const optimizerSource = read('src/features/admin/media/videoOptimizer.js');
const optimizerUi = read('src/features/admin/media/VideoOptimizer.jsx');
const optimizerCss = read('src/features/admin/media/videoOptimizer.css');
const mediaService = read('src/services/siteMediaService.js');
const schema = read('supabase/schema.sql');
const migration = read('supabase/migrations/20260819150000_admin_media_optimizer.sql');
const optionalHeroMigration = read('supabase/migrations/20260819160000_home_hero_optional_media.sql');
const styles = read('src/styles.css');

test('media optimizer accepts MOV MP4 and WEBM sources without uploading raw MOV', () => {
  assert.match(optimizerSource, /SOURCE_EXTENSIONS\s*=\s*\['mov', 'mp4', 'webm'\]/);
  assert.match(optimizerSource, /video\/quicktime/);
  assert.doesNotMatch(mediaService, /video\/quicktime/);
});

test('media optimizer detects browser-supported MP4 and WEBM recording', () => {
  assert.match(optimizerSource, /MediaRecorder\.isTypeSupported/);
  assert.match(optimizerSource, /video\/mp4;codecs=avc1/);
  assert.match(optimizerSource, /video\/webm;codecs=vp9/);
  assert.match(optimizerSource, /video\/webm;codecs=vp8/);
});

test('hero preset is bounded for browser and storage safety', () => {
  assert.match(optimizerSource, /MAX_SOURCE_BYTES\s*=\s*180 \* 1024 \* 1024/);
  assert.match(optimizerSource, /STORAGE_SAFE_OUTPUT_BYTES\s*=\s*9 \* 1024 \* 1024/);
  assert.match(optimizerSource, /MAX_CLIP_SECONDS\s*=\s*30/);
  assert.match(optimizerSource, /OUTPUT_FPS\s*=\s*30/);
  assert.match(optimizerSource, /maxWidth = 1280/);
  assert.match(optimizerSource, /maxHeight = 720/);
});

test('optimizer removes audio and creates a local poster', () => {
  assert.match(optimizerSource, /canvas\.captureStream\(OUTPUT_FPS\)/);
  assert.match(optimizerSource, /canvasBlob\(canvas, 'image\/webp'/);
  assert.match(optimizerSource, /video\.muted = true/);
  assert.doesNotMatch(optimizerSource, /getAudioTracks\(\)/);
});

test('admin optimizer only updates drafts until the existing save flow runs', () => {
  assert.match(mainSource, /<VideoOptimizer[\s\S]*onApply=/);
  assert.match(mainSource, /updateMediaDraft\('home_hero_background'/);
  assert.match(mainSource, /updateMediaDraft\('home_hero_background_poster'/);
  assert.match(optimizerUi, /Save all/);
  assert.doesNotMatch(optimizerSource, /supabase|fetch\(/i);
});

test('hero uses dedicated background poster with backwards-compatible fallback', () => {
  assert.match(mainSource, /heroFeatureImage\s*=\s*mediaUrl\(mediaSource, 'home_hero_feature_image', MEDIA\.premium\)/);
  assert.match(mainSource, /heroPoster\s*=\s*mediaUrl\(mediaSource, 'home_hero_background_poster', heroFeatureImage\)/);
  assert.match(mainSource, /home_hero_background_poster/);
});

test('public media bucket allows generated MP4 WEBM and WEBP assets', () => {
  for (const mime of ['video/mp4', 'video/webm', 'image/webp']) {
    assert.ok(schema.includes(`'${mime}'`), mime);
  }
  assert.match(migration, /array_append\(allowed_mime_types, 'video\/webm'\)/);
  assert.match(migration, /when allowed_mime_types is null then null/);
  assert.doesNotMatch(migration, /video\/quicktime/);
  assert.match(migration, /^\s*begin;/m);
  assert.match(migration, /^\s*commit;/m);
});

test('optimizer UI is responsive and exposes cancel/apply actions', () => {
  assert.match(optimizerUi, /abortRef\.current\?\.abort/);
  assert.match(optimizerUi, /Use in hero/);
  assert.match(optimizerCss, /@media \(max-width: 760px\)/);
  assert.match(optimizerCss, /grid-template-columns: 1fr/);
});


test('optional hero feature media can be removed and the hero collapses to one column', () => {
  assert.match(mainSource, /const explicitlyInactive = stored\.active === false/);
  assert.match(mainSource, /file_url: explicitlyInactive \? \(stored\.file_url \|\| ''\)/);
  assert.match(mainSource, /if \(item\?\.active === false\) return '';/);
  assert.match(mainSource, /heroFeatureMediaVisible\s*=\s*Boolean\(heroFeatureImage \|\| heroFeatureVideo\)/);
  assert.match(mainSource, /hero-grid-no-media/);
  assert.match(mainSource, /heroFeatureMediaVisible && \(/);
  assert.match(mainSource, /heroFeatureVideo \? \(/);
  assert.match(optionalHeroMigration, /active = false and media_key in \('home_hero_feature_image', 'home_hero_video'\)/);
  assert.match(optionalHeroMigration, /^\s*begin;/m);
  assert.match(optionalHeroMigration, /^\s*commit;/m);
});


test('hero can center the entire copy when feature media is absent', () => {
  assert.match(mainSource, /home\.hero\.layout/);
  assert.match(mainSource, /heroCenteredWithoutMedia/);
  assert.match(mainSource, /hero-layout-center/);
  assert.match(mainSource, /Hero alignment without image\/video/);
  assert.match(styles, /hero\.hero-no-feature-media[\s\S]*?min-height:\s*auto/);
  assert.match(styles, /hero-layout-center \.hero-copy \.controlled-text[\s\S]*?text-align:\s*center/);
});

test('home shell ends with the hero so the footer follows immediately', () => {
  assert.match(styles, /\.public-page-shell\.public-page-home\s*\{[^}]*min-height:\s*auto;[^}]*padding-bottom:\s*0;/);
});

test('home hero fills the dynamic viewport before the footer on desktop and mobile', () => {
  assert.match(styles, /\.public-page-shell\.public-page-home \.hero\.hero-no-feature-media\s*\{[^}]*min-height:\s*calc\(100svh - var\(--header-height\)\)/);
  assert.match(styles, /@supports\s*\(height:\s*100dvh\)[\s\S]*?\.public-page-shell\.public-page-home \.hero\.hero-no-feature-media\s*\{[^}]*min-height:\s*calc\(100dvh - var\(--header-height\)\)/);
});

test('website editor secondary sections start collapsed', () => {
  assert.doesNotMatch(mainSource, /latest-news-editor" open/);
  assert.doesNotMatch(mainSource, /social-links-editor" open/);
  assert.doesNotMatch(mainSource, /media-quick-editor" open=/);
});

for (const name of passes) console.log(`PASS  ${name}`);
for (const name of failures) console.error(`FAIL  ${name}`);
console.log(`\n${passes.length} passed, ${failures.length} failed.`);
if (failures.length) process.exit(1);
