import fs from 'node:fs';
const main = fs.readFileSync('src/main.jsx', 'utf8');
const styles = fs.readFileSync('src/styles.css', 'utf8');
const passes=[]; const failures=[];
function test(name, fn){try{fn();passes.push(name);}catch(e){failures.push(`${name}: ${e.message}`);}}
function yes(value,msg){if(!value)throw new Error(msg);}
function no(value,msg){if(value)throw new Error(msg);}
const hero = main.slice(main.indexOf('function Hero('), main.indexOf('function ExperienceAccordion'));

test('CMS has an explicit loading/ready/error lifecycle',()=>{
  yes(main.includes("const [cmsStatus, setCmsStatus]"),'cmsStatus state missing');
  yes(main.includes("? 'loading' : 'error'"),'initial loading/error state missing');
  yes(main.includes("setCmsStatus('loading')"),'loading transition missing');
  yes(main.includes("? 'ready' : 'error'"),'ready/error resolution missing');
});
test('unresolved CMS renders a stable modern shell',()=>{
  yes(hero.includes("cmsStatus === 'loading'"),'loading gate missing');
  yes(hero.includes('hero-cms-loading'),'modern loading shell missing');
  yes(styles.includes('.hero-cms-loading'),'loading shell CSS missing');
  yes(/100(?:svh|dvh)/.test(styles),'dynamic viewport geometry missing');
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
test('CMS failure resolves to modern no-legacy Hero',()=>{
  yes(main.includes("setCmsStatus('error')") || main.includes("? 'ready' : 'error'"),'error path missing');
  no(/cmsStatus[^\n]{0,120}MEDIA\./.test(hero),'CMS error references legacy MEDIA fallback');
  no(/heroStyle[^\n]*MEDIA\./.test(hero),'public hero style references legacy background');
});
for(const n of passes)console.log(`PASS  ${n}`);for(const f of failures)console.error(`FAIL  ${f}`);console.log(`\n${passes.length} passed, ${failures.length} failed.`);if(failures.length)process.exit(1);
