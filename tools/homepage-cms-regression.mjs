import fs from 'node:fs';
const main = fs.readFileSync('src/main.jsx', 'utf8');
const styles = fs.readFileSync('src/styles.css', 'utf8');
const publicSw = fs.readFileSync('public/sw.js', 'utf8');
const passes=[]; const failures=[];
function test(name, fn){try{fn();passes.push(name);}catch(e){failures.push(`${name}: ${e.message}`);}}
function yes(value,msg){if(!value)throw new Error(msg);}
function no(value,msg){if(value)throw new Error(msg);}
const hero = main.slice(main.indexOf('function Hero('), main.indexOf('function ExperienceAccordion'));

test('CMS resolves asynchronously without gating the first public render',()=>{
  yes(main.includes('Promise.allSettled([listSiteMedia({ activeOnly: true }), loadPublicSiteContent()])'),'independent CMS loading missing');
  no(main.includes('cmsStatus') || main.includes('setCmsStatus'),'CMS status still gates public rendering');
  yes(hero.includes("fallback={text(lang, 'heroTitle')}"),'immediate title fallback missing');
  yes(hero.includes("fallback={text(lang, 'heroLead')}"),'immediate lead fallback missing');
});
test('homepage startup never renders a transient skeleton shell',()=>{
  no(hero.includes("cmsStatus === 'loading'") || hero.includes('hero-cms-loading'),'Hero still renders the startup skeleton');
  no(styles.includes('.hero-cms-loading'),'obsolete startup skeleton CSS remains');
});
test('initial Hero media never uses the known legacy background',()=>{
  no(styles.includes("url('/images/etna-eruption-hero.jpg')"),'legacy Hero JPG remains in the first-paint CSS fallback');
  no(hero.includes("'/images/etna-eruption-hero.jpg'"),'legacy Hero JPG remains in Hero rendering');
  yes(styles.includes('linear-gradient(135deg, #101a28, #243850)'),'neutral first-paint fallback is missing');
});
test('last known public Hero media seeds the first render when available',()=>{
  yes(main.includes("const PUBLIC_HERO_MEDIA_CACHE_KEY = 'vulcaniq_public_hero_media_v1'"),'versioned public Hero cache key missing');
  yes(main.includes('function readCachedPublicHeroMedia()'),'cached Hero reader missing');
  yes(main.includes('function writeCachedPublicHeroMedia(siteMedia)'),'cached Hero writer missing');
  yes(main.includes('useState(() => readCachedPublicHeroMedia())'),'first render does not use cached public Hero media');
});
test('unresolved/public Hero never renders legacy intro/feature media',()=>{
  no(/fallbackSrc:\s*MEDIA\.introVideo/.test(hero),'legacy intro video fallback remains');
  no(/fallbackSrc:\s*MEDIA\.premium/.test(hero),'legacy feature image fallback remains');
  yes(hero.includes("mediaUrl(mediaSource, 'home_hero_feature_image', '')"),'feature image must resolve without a legacy fallback');
  yes(hero.includes("mediaUrl(mediaSource, 'home_hero_video', '')"),'feature video must resolve without a legacy fallback');
});
test('ready inactive feature media remains absent',()=>{
  yes(main.includes("if (item?.active === false) return '';"),'inactive media guard missing');
  yes(hero.includes('const heroFeatureMediaVisible = Boolean(heroFeatureImage || heroFeatureVideo);'),'feature visibility must be derived from active CMS media');
  yes(hero.includes('{heroFeatureMediaVisible && ('),'inactive feature media render guard missing');
});
test('current background video/poster/centered/reduced-motion behavior remains represented',()=>{
  yes(hero.includes('heroBackgroundVideo'),'background video missing');
  yes(hero.includes('heroPoster'),'poster handling missing');
  yes(hero.includes('heroCenteredWithoutMedia'),'centered layout missing');
  yes(styles.includes('@media (prefers-reduced-motion: reduce)'),'reduced-motion handling missing');
});
test('CMS refresh updates the public Hero cache and preserves it on failure',()=>{
  yes(main.includes('const nextMedia = buildMediaMap(mediaResult.value)'),'authoritative CMS media map missing');
  yes(main.includes('writeCachedPublicHeroMedia(nextMedia)'),'successful CMS media does not refresh the public Hero cache');
  no(main.includes('setSiteMedia(mediaReady ? buildMediaMap(mediaResult.value) : {})'),'failed CMS refresh discards known-current cached Hero media');
  yes(main.includes("if (contentResult.status === 'fulfilled') setSiteContent(buildSiteContentMap(contentResult.value))"),'content failure fallback missing');
  no(/cmsStatus[^\n]{0,120}MEDIA\./.test(hero),'CMS error references legacy MEDIA fallback');
  no(/heroStyle[^\n]*MEDIA\./.test(hero),'public hero style references legacy background');
});
test('public service worker leaves Hero assets to normal browser caching',()=>{
  no(publicSw.includes("addEventListener('fetch'") || publicSw.includes('caches.open'),'public service worker unexpectedly intercepts application assets');
  no(publicSw.includes('etna-eruption-hero.jpg'),'public service worker references the legacy Hero image');
  yes(publicSw.includes("addEventListener('push'") && publicSw.includes('vulcaniq-public-inbox-changed'),'push and unread refresh behavior missing');
});
for(const n of passes)console.log(`PASS  ${n}`);for(const f of failures)console.error(`FAIL  ${f}`);console.log(`\n${passes.length} passed, ${failures.length} failed.`);if(failures.length)process.exit(1);
