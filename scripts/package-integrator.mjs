import {mkdtempSync,cpSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const {version}=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
const stage=mkdtempSync(join(tmpdir(),'m8-release-'));
const paths=['src','dist','supabase/migrations','deploy/systemd','package.json','package-lock.json','tsconfig.json','tsconfig.build.json',
 'README.md','docs/atualizacao-compras.md','docs/atualizacao-comercial.md','docs/customer-registry-sync.md','docs/pbix-comercial.md','docs/correcao-integrador-0.2.1.md'];
try{
 execFileSync('npm',['run','build'],{cwd:root,stdio:'inherit'});
 for(const path of paths){mkdirSync(join(stage,path,'..'),{recursive:true});cpSync(join(root,path),join(stage,path),{recursive:true});}
 writeFileSync(join(stage,'RELEASE.json'),JSON.stringify({version,createdAt:new Date().toISOString(),companies:[1,2,27404],migrationsThrough:19,includes:['previous quotes/purchases update','shared customers and ERP sellers','four PBIX commercial facts'],excludes:['web application','credentials','PBIX source']},null,2)+'\n');
 const name=`m8-integrador-${version}.tar.gz`,artifact=join(root,'artifacts',name);
 mkdirSync(join(root,'artifacts'),{recursive:true});
 execFileSync('tar',['-czf',artifact,'-C',stage,'.']);
 const checksum=createHash('sha256').update(readFileSync(artifact)).digest('hex');
 writeFileSync(join(root,'artifacts',`m8-integrador-${version}.sha256`),`${checksum}  ${name}\n`);
 console.log(`Pacote gerado: artifacts/${name}`);
}finally{rmSync(stage,{recursive:true,force:true});}
