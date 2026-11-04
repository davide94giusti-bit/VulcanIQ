import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { deflateRawSync,inflateRawSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const directories=new Set(['src','public','functions','shared','supabase','workers','tools','scripts','docs','.github']);
const roots=new Set(['package.json','package-lock.json','pnpm-lock.yaml','pnpm-workspace.yaml','index.html','README.md','LICENSE','LICENSE.md','.gitignore','.gitattributes','.npmrc','.nvmrc','.node-version','.env.example','vite.config.js','wrangler.toml','wrangler.example.toml','eslint.config.js','tsconfig.json']);
export function releasePathAllowed(name){
  if(!name||name.includes('\\')||name.startsWith('/')||/^[A-Za-z]:/.test(name))return false;
  const parts=name.split('/');if(parts.some(part=>!part||['.','..','.git','.codex','.agents','node_modules','outputs','tmp_artifact','dist','coverage','.wrangler','.temp','.branches','__pycache__','.pnpm-store'].includes(part)))return false;
  if(parts.some(part=>/^\.env(?:\.|$)/.test(part)&&part!=='.env.example'))return false;
  if(parts.some(part=>part.startsWith('.dev.vars')&&part!=='.dev.vars.example'))return false;
  if(/\.(?:zip|xlsx?|csv|tsv|log|sqlite|db|pem|key|p12|pfx|pyc)$/i.test(name))return false;
  if(parts[0]==='supabase'&&!['functions','migrations','tests','audit','setup','config.toml'].includes(parts[1])&&!(parts.length===2&&parts[1].endsWith('.sql')))return false;
  if(parts[0]==='workers'&&parts.some(part=>part.startsWith('.')))return false;
  if(parts[0]==='.github'&&parts[1]!=='workflows'&&parts[1]!=='pull_request_template.md')return false;
  return parts.length===1?roots.has(name)||/^[A-Z][A-Z0-9_-]+\.(?:md|txt)$/.test(name):directories.has(parts[0]);
}
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function secretFindings(name,bytes){
  const text=bytes.toString('utf8'),findings=[];
  const fixture=/^(?:tools|supabase\/tests)\//.test(name);
  const rules=[['private_key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----(?:\s|\\[rn])*[A-Za-z0-9+/=]{32,}/g],['supabase_secret',/sb_secret_[A-Za-z0-9_-]{20,}/g],['github_token',/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/g],['aws_access_key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],['provider_secret',/\bre_[A-Za-z0-9]{24,}\b/g]];
  for(const [rule,regex] of rules)for(const match of text.matchAll(regex)){
    if(fixture&&/(?:fixture|synthetic|regression|example|test|mock)/i.test(match[0]))continue;
    findings.push({path:name,rule});break;
  }
  for(const match of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)){
    try{const payload=JSON.parse(Buffer.from(match[0].split('.')[1],'base64url').toString());if(payload.role==='service_role'&&!(fixture&&payload.iss==='supabase-demo')){findings.push({path:name,rule:'service_role_jwt'});break;}}catch{/* not a JWT */}
  }
  return findings;
}
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
export function zipEntries(entries){
  const locals=[],central=[];let offset=0;
  for(const {name,bytes} of entries){const filename=Buffer.from(name),compressed=deflateRawSync(bytes),crc=crc32(bytes),header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(filename.length,26);
    locals.push(header,filename,compressed);const record=Buffer.alloc(46);record.writeUInt32LE(0x02014b50);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt16LE(0x800,8);record.writeUInt16LE(8,10);record.writeUInt16LE(33,14);record.writeUInt32LE(crc,16);record.writeUInt32LE(compressed.length,20);record.writeUInt32LE(bytes.length,24);record.writeUInt16LE(filename.length,28);record.writeUInt32LE(offset,42);central.push(record,filename);offset+=header.length+filename.length+compressed.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,directory,end]);
}
export function readZip(bytes){
  const entries=[];let cursor=0;
  while(bytes.readUInt32LE(cursor)===0x04034b50){
    const method=bytes.readUInt16LE(cursor+8),crc=bytes.readUInt32LE(cursor+14),compressedLength=bytes.readUInt32LE(cursor+18),size=bytes.readUInt32LE(cursor+22),nameLength=bytes.readUInt16LE(cursor+26),extra=bytes.readUInt16LE(cursor+28);
    if(size>100*1024*1024)throw Error('archive_entry_too_large');
    const name=bytes.subarray(cursor+30,cursor+30+nameLength).toString(),start=cursor+30+nameLength+extra,compressed=bytes.subarray(start,start+compressedLength);
    if(method!==8)throw Error('unsupported_archive_method');const content=inflateRawSync(compressed,{maxOutputLength:100*1024*1024});if(content.length!==size||crc32(content)!==crc)throw Error('archive_integrity_failed');entries.push({name,bytes:content});cursor=start+compressedLength;
  }
  if(!entries.length)throw Error('empty_archive');return entries;
}
export function verifyArchive(bytes){
  const entries=readZip(bytes),names=new Set(),findings=[];
  for(const entry of entries){if(names.has(entry.name))throw Error('duplicate_archive_entry');names.add(entry.name);if(entry.name!=='RELEASE-MANIFEST.json'&&!releasePathAllowed(entry.name))throw Error('forbidden_archive_path: '+entry.name);findings.push(...secretFindings(entry.name,entry.bytes));}
  if(findings.length)throw Error('secret_scan_failed: '+JSON.stringify(findings));
  const manifest=JSON.parse(entries.find(entry=>entry.name==='RELEASE-MANIFEST.json')?.bytes.toString()||'null');if(!manifest||!Array.isArray(manifest.files)||manifest.files.length!==entries.length-1)throw Error('manifest_count_mismatch');
  const manifested=new Set();
  for(const file of manifest.files){if(manifested.has(file.path)||file.path==='RELEASE-MANIFEST.json')throw Error('duplicate_manifest_path');manifested.add(file.path);const entry=entries.find(value=>value.name===file.path);if(!entry||sha(entry.bytes)!==file.sha256||entry.bytes.length!==file.bytes)throw Error('manifest_hash_mismatch: '+file.path);}
  if(sha(Buffer.from(JSON.stringify(manifest.files)))!==manifest.sourceTreeSha256)throw Error('manifest_tree_hash_mismatch');
  return{manifest,entries,sha256:sha(bytes)};
}
export function buildRelease(repository,output,buildDate=new Date().toISOString()){
  const git=args=>execFileSync('git',args,{cwd:repository,encoding:'utf8',maxBuffer:32*1024*1024});
  const tracked=git(['ls-files','-z']).split('\0').filter(Boolean);
  const added=git(['ls-files','--others','--exclude-standard','-z','--',...directories,...roots]).split('\0').filter(Boolean);
  const candidates=[...new Set([...tracked,...added])].filter(releasePathAllowed).sort();const entries=[];const findings=[];
  const sourceRoot=fs.realpathSync(repository);
  for(const name of candidates){const absolute=path.join(repository,...name.split('/'));if(!fs.existsSync(absolute))continue;const relativeReal=path.relative(sourceRoot,fs.realpathSync(absolute));if(relativeReal.startsWith('..'+path.sep)||path.isAbsolute(relativeReal))throw Error('source_outside_repository: '+name);const stat=fs.lstatSync(absolute);if(!stat.isFile()||stat.isSymbolicLink())throw Error('nonregular_source_file: '+name);const bytes=fs.readFileSync(absolute);findings.push(...secretFindings(name,bytes));entries.push({name,bytes});}
  if(findings.length)throw Error('secret_scan_failed: '+JSON.stringify(findings));
  const files=entries.map(entry=>({path:entry.name,bytes:entry.bytes.length,sha256:sha(entry.bytes)}));
  const manifest={format:1,project:'VulcanIQ',buildDate,baseCommit:git(['rev-parse','HEAD']).trim(),branch:git(['branch','--show-current']).trim(),uncommitted:git(['status','--porcelain','--untracked-files=no']).trim().length>0||added.some(releasePathAllowed),sourceTreeSha256:sha(Buffer.from(JSON.stringify(files))),nodeEngine:JSON.parse(entries.find(entry=>entry.name==='package.json').bytes.toString()).engines||{},migrationFiles:files.filter(file=>file.path.startsWith('supabase/migrations/')||/^workers\/[^/]+\/migrations\//.test(file.path)).map(file=>file.path),files};
  entries.push({name:'RELEASE-MANIFEST.json',bytes:Buffer.from(JSON.stringify(manifest,null,2)+'\n')});const archive=zipEntries(entries);const verified=verifyArchive(archive);
  if(fs.existsSync(output))throw Error('output_exists');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,archive,{flag:'wx'});fs.writeFileSync(output+'.sha256',verified.sha256+'  '+path.basename(output)+'\n',{flag:'wx'});
  return{archive:output,sha256:verified.sha256,files:files.length,baseCommit:manifest.baseCommit,sourceTreeSha256:manifest.sourceTreeSha256};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  if(args.includes('--verify')){const verified=verifyArchive(fs.readFileSync(get('--verify')));if(args.includes('--extract')){const destination=path.resolve(get('--extract'));if(fs.existsSync(destination))throw Error('extract_target_must_not_exist');fs.mkdirSync(destination,{recursive:true});for(const entry of verified.entries){const target=path.join(destination,...entry.name.split('/'));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,entry.bytes,{flag:'wx'});}}console.log(JSON.stringify({ok:true,files:verified.manifest.files.length,sha256:verified.sha256,sourceTreeSha256:verified.manifest.sourceTreeSha256}));}
  else{if(!args.includes('--output'))throw Error('Usage: node tools/release-source.mjs --output <new.zip> [--date ISO-date]');console.log(JSON.stringify(buildRelease(process.cwd(),path.resolve(get('--output')),args.includes('--date')?get('--date'):undefined)));}
}
