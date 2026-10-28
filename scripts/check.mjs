import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
for(const dir of ['src','scripts','test','sites/worker','public/assets'])for(const file of readdirSync(dir)){
 if(!/\.(mjs|js)$/.test(file))continue;
 const result=spawnSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status??1);
}
