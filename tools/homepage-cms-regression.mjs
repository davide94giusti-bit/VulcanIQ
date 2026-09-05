import fs from 'node:fs';
const main = fs.readFileSync('src/main.jsx', 'utf8');
const styles = fs.readFileSync('src/styles.css', 'utf8');
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
test('CMS failure preserves immediate modern fallbacks without legacy media',()=>{
  yes(main.includes('setSiteMedia(mediaReady ? buildMediaMap(mediaResult.value) : {})'),'media failure fallback missing');
  yes(main.includes('setSiteContent(contentReady ? buildSiteContentMap(contentResult.value) : {})'),'content failure fallback missing');
  no(/cmsStatus[^\n]{0,120}MEDIA\./.test(hero),'CMS error references legacy MEDIA fallback');
  no(/heroStyle[^\n]*MEDIA\./.test(hero),'public hero style references legacy background');
});
for(const n of passes)console.log(`PASS  ${n}`);for(const f of failures)console.error(`FAIL  ${f}`);console.log(`\n${passes.length} passed, ${failures.length} failed.`);if(failures.length)process.exit(1);
