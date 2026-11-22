import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildOffline} from '../scripts/offline.mjs';
import {validateRelease} from '../src/release-contract.mjs';
test('release pins the SPA assets and verifies every offline resource',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cuda-python-release-'));
 try{
  const build=async text=>{
   await rm(directory,{recursive:true,force:true});await mkdir(directory,{recursive:true});
   await writeFile(join(directory,'index.html'),'<html><head><link rel="stylesheet" href="./styles.css"><script src="./app.mjs"></script></head><body><button type="button" class="button" id="theme">Theme</button></body></html>');
   await writeFile(join(directory,'app.mjs'),text);await writeFile(join(directory,'styles.css'),'body{}');
   return buildOffline(directory);
  };
  const first=await build('first');assert.deepEqual(await build('first'),first);
  const release=await build('changed');assert.notEqual(release.id,first.id);
  for(const file of release.files){const bytes=await readFile(join(directory,'releases',release.id,file.path));assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}
  const html=await readFile(join(directory,'index.html'),'utf8');
  assert.ok(html.includes(`./releases/${release.id}/app.mjs`));assert.ok(html.includes(`./releases/${release.id}/offline.mjs`));assert.match(html,/id="app-status-open"/);
  assert.doesNotMatch(await readFile(join(directory,'sw.js'),'utf8'),/skipWaiting|cache\.addAll/);
  for(const bad of [{...release,bytes:0},{...release,id:'main'},{...release,files:[...release.files,release.files[0]]}])assert.throws(()=>validateRelease(bad));
 }finally{await rm(directory,{recursive:true,force:true});}
});
