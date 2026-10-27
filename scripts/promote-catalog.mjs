import {withCatalogLock,promoteCatalog} from '../src/catalog-files.mjs';
const args=process.argv.slice(2);const i=args.indexOf('--expected-sha256');
await withCatalogLock('data',async()=>{
 const version=promoteCatalog({reviewed:args.includes('--reviewed'),expectedSha256:i>=0?args[i+1]:undefined});
 console.log(`Promoted ${version}; previous version saved. Restart/sync and republish separately.`);
});
