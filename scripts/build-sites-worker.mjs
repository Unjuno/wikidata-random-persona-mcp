import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {createHash} from 'node:crypto';
import {validateCatalog} from '../src/core.mjs';
import {validatePersonaIndex} from '../src/persona-index.mjs';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'dist');
const server = resolve(out, 'server');
await rm(out, {recursive:true, force:true});
await mkdir(server, {recursive:true});
await mkdir(resolve(out, '.openai'), {recursive:true});
const catalog = JSON.parse(await readFile(resolve(root, 'data/catalog.json'), 'utf8'));
validateCatalog(catalog);
const blocked = JSON.parse(await readFile(resolve(root, 'data/blocked-qids.json'), 'utf8'));
if (!Array.isArray(blocked)) throw new Error('Invalid suspension list');
await cp(resolve(root, 'sites/worker/index.js'), resolve(server, 'index.js'));
await cp(resolve(root, 'src/core.mjs'), resolve(server, 'core.mjs'));
await cp(resolve(root, 'src/catalog-store.mjs'), resolve(server, 'catalog-store.mjs'));
await cp(resolve(root, 'src/wikidata.mjs'), resolve(server, 'wikidata.mjs'));
await cp(resolve(root, 'src/live-wikidata.mjs'), resolve(server, 'live-wikidata.mjs'));
await cp(resolve(root, 'src/persona-index.mjs'), resolve(server, 'persona-index.mjs'));
let reviewedIndex=null;
try{
 const bytes=await readFile(resolve(root,'data/persona-index.json'));
 if(bytes.length>12*1024*1024)throw Error('Full-dump QID index exceeds Sites bundle limit');
 reviewedIndex=validatePersonaIndex(JSON.parse(bytes.toString('utf8')));
}catch(error){
 if(error.code!=='ENOENT')throw error;
}
await writeFile(resolve(server,'persona-index-data.mjs'),'export default '+JSON.stringify(reviewedIndex)+';\n');
console.log(reviewedIndex?'Using complete Wikidata dump index: '+reviewedIndex.version:'No approved full-dump index; retaining live Wikidata bounded lookup');
await writeFile(resolve(server, 'catalog.mjs'), `export default ${JSON.stringify(catalog)};\n`);
await writeFile(resolve(server, 'blocked-qids.mjs'), `export default ${JSON.stringify(blocked)};\n`);
await cp(resolve(root, '.openai/hosting.json'), resolve(out, '.openai/hosting.json'));
console.log(`Built Sites Worker from ${catalog.version} (${catalog.entries.length} entries).`);

// Embed static bytes in the Worker bundle: Sites' ESM deployment does not copy public/.
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8'};
const assets={};
async function collect(dir,prefix=''){
 for(const file of await readdir(dir,{withFileTypes:true})){
  const path=resolve(dir,file.name),name=prefix+'/'+file.name;
  if(file.isDirectory()){await collect(path,name);continue;}
  const type=types[extname(file.name)];
  if(!type||!file.isFile())throw Error('Unsupported public asset: '+name);
  const bytes=await readFile(path);
  if(!bytes.length)throw Error('Empty public asset: '+name);
  if(bytes.length>400000)throw Error('Public asset exceeds 400 KB: '+name);
  assets[name]={type,size:bytes.length,etag:'"'+createHash('sha256').update(bytes).digest('hex').slice(0,24)+'"',data:bytes.toString('base64')};
 }
}
await collect(resolve(root,'public'));
const html=await readFile(resolve(root,'public/index.html'),'utf8');
for(const path of html.match(/\/assets\/[a-z0-9.-]+/g)??[])if(!assets[path])throw Error('Missing LP asset: '+path);
await writeFile(resolve(server,'site-assets.mjs'),'export default '+JSON.stringify(assets)+';\n');
await cp(resolve(root,'sites/worker/web.mjs'),resolve(server,'web.mjs'));
console.log('Embedded '+Object.keys(assets).length+' LP assets.');

// A reproducible fingerprint ties deployed runtime/assets to the GitHub source.
const fingerprint=createHash('sha256');
for(const name of ['sites/worker/index.js','sites/worker/web.mjs','src/core.mjs','src/catalog-store.mjs','src/wikidata.mjs','src/live-wikidata.mjs','src/persona-index.mjs','data/catalog.json','data/blocked-qids.json','scripts/build-sites-worker.mjs','.openai/hosting.json','package-lock.json']){
 fingerprint.update(name+'\0');fingerprint.update(await readFile(resolve(root,name)));
}
fingerprint.update('persona-index-data\0');fingerprint.update(JSON.stringify(reviewedIndex));
for(const name of Object.keys(assets).sort()){fingerprint.update(name+'\0');fingerprint.update(assets[name].data);}
await writeFile(resolve(server,'build-info.mjs'),'export default '+JSON.stringify({fingerprint:fingerprint.digest('hex')})+';\n');
