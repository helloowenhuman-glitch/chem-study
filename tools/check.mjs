import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const js=[];
async function walk(path) {
  for(const entry of await readdir(path,{withFileTypes:true})) {
    if(['node_modules','.git','.vercel','.gradle','build'].includes(entry.name))continue;
    const file=join(path,entry.name);
    if(entry.isDirectory())await walk(file);
    else if(/\.m?js$/.test(entry.name))js.push(file);
  }
}
await walk(root);
for(const file of js) {
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr);
}
for(const name of ['package.json','vercel.json'])JSON.parse(await readFile(join(root,name),'utf8'));
for(const name of ['public/index.html','public/styles.css','public/app.js','public/client.js','supabase/schema.sql'])await stat(join(root,name));
console.log(`문법 검사 ${js.length}개 파일과 배포 설정 확인 완료`);
