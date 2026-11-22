// Copyright © 2026 Christopher Snow.
import test from 'node:test';
import assert from 'node:assert/strict';
import {CodeRunner} from '../src/code-runner.mjs';
function fixture(options={}){
 let now=0,id=0;const jobs=new Map(),workers=[];
 const runner=new CodeRunner({makeWorker:()=>{const worker={sent:[],postMessage(data){this.sent.push(data);},terminate(){this.dead=true;},reply(data){this.onmessage({data});}};workers.push(worker);return worker;},idleMs:300_000,...options,now:()=>now,later:(fn,ms)=>{jobs.set(++id,{fn,at:now+ms});return id;},cancel:id=>jobs.delete(id)});
 return {runner,workers,advance:ms=>{now+=ms;for(const [id,job]of [...jobs])if(jobs.has(id)&&job.at<=now){jobs.delete(id);job.fn();}}};
}
test('reuses one worker across clients, while messages/results belong to each current run',()=>{
 const {runner:r,workers:w}=fixture(),a=[],b=[],first={};
 r.execute(first,'worker',{source:'one'},data=>a.push(data));w[0].reply({stage:'Compiling',ready:true});w[0].reply({stdout:'1'});
 r.detach(first);assert.equal(r.state,'ready');assert.equal(w[0].dead,undefined);
 r.execute({},'worker',{source:'two'},data=>b.push(data));w[0].reply({stdout:'2'});
 assert.equal(w.length,1);assert.equal(r.boots,1);assert.equal(a.at(-1).stdout,'1');assert.equal(b.at(-1).stdout,'2');
});
test('idle release counts from completion and never interrupts a running job',()=>{
 const {runner:r,workers:w,advance}=fixture();r.timeoutMs=900_000;
 r.execute({},'worker',{},()=>{});advance(300_001);assert.equal(w[0].dead,undefined);
 w[0].reply({stdout:'done'});advance(299_999);assert.equal(r.state,'ready');advance(1);assert.equal(r.state,'stopped');assert.ok(w[0].dead);
});
test('explicit stop cancels the owner, ignores late replies and allows a fresh worker',()=>{
 const {runner:r,workers:w}=fixture(),a=[],b=[];r.execute({},'worker',{},d=>a.push(d));r.release();assert.equal(a.at(-1).cancelled,true);
 r.execute({},'worker',{},d=>b.push(d));w[0].reply({stdout:'stale'});assert.equal(b.length,0);w[1].reply({stdout:'new'});assert.equal(b.at(-1).stdout,'new');assert.equal(r.boots,2);
});
test('timeout and crashes release memory and next run can start again',()=>{
 const {runner:r,workers:w,advance}=fixture(),replies=[];r.execute({},'worker',{},d=>replies.push(d));advance(90_000);assert.match(replies.at(-1).error,/timed out/);assert.equal(r.worker,null);
 r.execute({},'worker',{},d=>replies.push(d));w[1].onerror({message:'crashed'});assert.equal(replies.at(-1).error,'crashed');assert.equal(r.state,'stopped');
});
test('a second client cannot replace the busy job, and detaching another client cannot cancel it',()=>{
 const {runner:r,workers:w}=fixture(),owner={},other={},a=[],b=[];r.execute(owner,'worker',{},d=>a.push(d));r.execute(other,'worker',{},d=>b.push(d));assert.match(b[0].error,/in progress/);r.detach(other);assert.equal(w[0].dead,undefined);w[0].reply({stdout:'owner'});assert.equal(a.at(-1).stdout,'owner');
});
test('manual startup prepares without running code, and compile errors keep the toolchain ready',()=>{
 const {runner:r,workers:w}=fixture();r.configure('worker',{assets:{verified:true}});r.start();assert.equal(w[0].sent[0].type,'prepare');w[0].reply({prepared:true});assert.equal(r.state,'ready');assert.equal(r.reason,'Ready to compile and run your code.');assert.equal(r.completedRuns,0);assert.equal(r.lastRunMs,null);
 r.execute({},'worker',{},()=>{});w[0].reply({compileError:true,diagnostics:'bad source'});assert.equal(r.state,'ready');assert.equal(r.boots,1);
});

test('Compile during manual startup waits, then runs automatically on the same worker',()=>{
 const {runner:r,workers:w}=fixture(),client={},replies=[];r.configure('worker',{assets:{}});r.start();
 r.execute(client,'worker',{source:'queued'},d=>replies.push(d));assert.equal(w[0].sent.length,1);assert.match(replies[0].stage,/Waiting/);
 w[0].reply({prepared:true});assert.equal(w[0].sent.length,2);assert.equal(w[0].sent[1].source,'queued');assert.equal(r.boots,1);
 w[0].reply({stdout:'7'});assert.equal(replies.at(-1).stdout,'7');assert.equal(r.state,'ready');
});
test('stopping or detaching a queued compile cancels startup without running that code',()=>{
 for(const detach of [false,true]){
  const {runner:r,workers:w}=fixture(),client={},replies=[];r.configure('worker',{});r.start();r.execute(client,'worker',{source:'never run'},d=>replies.push(d));
  if(detach)r.detach(client);else r.release();assert.equal(replies.at(-1).cancelled,true);assert.equal(w[0].sent.length,1);assert.equal(r.state,'stopped');
 }
});
test('startup errors reach the queued compile without leaving an editor waiting',()=>{
 const {runner:r,workers:w}=fixture(),replies=[];r.configure('worker',{});r.start();r.execute({},'worker',{source:'queued'},d=>replies.push(d));w[0].reply({error:'missing binary'});
 assert.equal(replies.at(-1).error,'missing binary');assert.equal(r.state,'stopped');assert.equal(r.pending,null);
});

test('default idle policy is thirty minutes and settings keep the last completion as the deadline origin',()=>{
 assert.equal(new CodeRunner().idleMs,1800000);
 const {runner:r,workers:w,advance}=fixture();r.execute({},'worker',{},()=>{});w[0].reply({stdout:'done'});advance(240000);
 r.setIdleMinutes(30);advance(1560000-1);assert.equal(r.state,'ready');advance(1);assert.equal(r.state,'stopped');
});
test('shortening an expired idle policy releases memory; changing it during a run does not interrupt code',()=>{
 const {runner:r,workers:w,advance}=fixture({idleMs:1800000,timeoutMs:3600000});r.execute({},'worker',{},()=>{});r.setIdleMinutes(5);advance(600000);assert.equal(w[0].dead,undefined);
 w[0].reply({stdout:'done'});r.setIdleMinutes(30);advance(600000);r.setIdleMinutes(5);assert.equal(r.state,'stopped');assert.equal(r.wasmBytes,0);
});
test('telemetry updates allocation without completing a job; elapsed time includes queued startup and survives memory release',()=>{
 const {runner:r,workers:w,advance}=fixture();r.configure('worker',{});r.start();advance(1000);r.execute({},'worker',{source:'queued'},()=>{});advance(2000);
 w[0].reply({telemetry:{wasmBytes:67108864}});assert.ok(r.busy);assert.equal(r.wasmBytes,67108864);assert.equal(r.lastRunMs,null);
 w[0].reply({prepared:true,wasmBytes:67108864});advance(1500);w[0].reply({stdout:'done',wasmBytes:67108864});assert.equal(r.lastRunMs,3500);assert.equal(r.completedRuns,1);
 r.release();assert.equal(r.wasmBytes,0);assert.equal(r.lastRunMs,3500);
});
test('Python program errors keep the toolchain and do not count as completed runs',()=>{
 const {runner:r,workers:w}=fixture(),replies=[];
 r.execute({},'',{},reply=>replies.push(reply));w[0].reply({error:'SyntaxError',programError:true});
 assert.equal(r.state,'ready');assert.equal(r.boots,1);assert.equal(r.completedRuns,0);assert.equal(r.lastRunMs,null);assert.equal(replies.at(-1).error,'SyntaxError');
 r.execute({},'',{},()=>{});w[0].reply({stdout:'recovered'});assert.equal(r.boots,1);assert.equal(r.completedRuns,1);
});
