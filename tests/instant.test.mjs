import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../server/api.js';
import { packQuestions } from '../server/study.js';
import { hydrateQuestions, instantGrade, readLocalStudy, writeLocalStudy, putJob, acknowledgeJob, mergeBookmarks, drainOutbox, createSyncGate } from '../public/local-study.js';
import { reviewAnswers, retryQuestions } from '../public/study.js';

const q={id:'dt:1:1-01',kind:'ox',source:'DT',sourceId:'1-01',round:1,conceptId:'CH1S-028',concept:'몰수=질량÷몰 질량',stem:'본문',choices:['O','X'],answer:'O',explanation:'질량을 몰 질량으로 나눕니다.'};
const transport=async url=>Response.json(url.endsWith('plan_ch1s.json')?{rounds:{},concepts:{'CH1S-028':{m:q.concept,r:1}}}:{jeongsi:{items:[{n:'1-01',c:q.conceptId,mis:q.concept,s:q.stem,a:'O',w:q.explanation}]}});

test('선택한 문제만 즉시 채점 정보를 준비하고 주제 안내는 한 번만 전송합니다',async()=>{
  const packed=packQuestions([q,{...q,id:'dt:1:1-02'}]);
  assert.equal(Object.keys(packed.topics).length,1);
  assert.equal(packed.questions[0].solution.teaching.topic,undefined);
  const [ready]=hydrateQuestions(packed);
  const result=instantGrade(ready,'X');
  assert.equal(result.correct,false);assert.equal(result.answer,'O');assert.equal(result.teaching.topic.id,'mole');
  assert.throws(()=>instantGrade(ready,'3'));
  const legacy=await handleApi(new Request('http://local/api/questions?round=1'),{},transport);
  assert.ok(!('solution' in (await legacy.json()).questions[0]));
  const instant=await handleApi(new Request('http://local/api/questions?round=1&instant=1'),{},transport);
  assert.equal(instant.status,200);
  assert.equal(instantGrade(hydrateQuestions(await instant.json())[0],'O').correct,true);
});

test('별표 정답과 오답을 한 번씩 모으고 별표 해제도 결과와 재풀이에 반영합니다',()=>{
  const questions=[q,{...q,id:'b'},{...q,id:'c'}];
  const results=[{correct:true},{correct:false},{correct:true}];
  const stars=new Set([q.id,'b']);
  assert.deepEqual(reviewAnswers(questions,results,stars).map(x=>x.question.id),[q.id,'b']);
  assert.equal(retryQuestions(questions,results,stars).length,2);
  stars.delete(q.id);
  assert.deepEqual(reviewAnswers(questions,results,stars).map(x=>x.question.id),['b']);
});

test('기기 임시 기록은 계정별로 복원하고 오래된 저장 성공은 최신 별표 변경을 지우지 않습니다',()=>{
  const values=new Map();const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  let local=readLocalStudy(storage,'A');
  local=putJob(local,{id:'bookmark:q',version:'old',route:'bookmark',body:{questionId:'q',marked:true}});
  writeLocalStudy(storage,'A',local);
  assert.equal(readLocalStudy(storage,'A').outbox.length,1);
  assert.equal(readLocalStudy(storage,'B').outbox.length,0);
  local=putJob(local,{id:'bookmark:q',version:'new',route:'bookmark',body:{questionId:'q',marked:false}});
  assert.equal(acknowledgeJob(local,{id:'bookmark:q',version:'old'}).outbox.length,1);
  assert.equal(acknowledgeJob(local,{id:'bookmark:q',version:'new'}).outbox.length,0);
  local.bookmarks=[];
  assert.equal(mergeBookmarks(local,[{question_id:'q'}]).bookmarks.length,0);
});

test('별표 저장은 로그인 사용자 소유로만 쓰고 해제는 본인 행에만 적용합니다',async()=>{
  let mutation;
  const fetcher=async(url,options={})=>{
    if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner-A'});
    if(url.includes('/rest/v1/study_bookmarks')){mutation={url,options};return new Response(null,{status:204});}
    return transport(url);
  };
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'fixture'};
  const headers={Authorization:'Bearer fixture','Content-Type':'application/json'};
  const body={questionId:q.id,concept:q.concept,round:1,marked:true,user_id:'other'};
  const saved=await handleApi(new Request('http://local/api/bookmark',{method:'POST',headers,body:JSON.stringify(body)}),env,fetcher);
  assert.equal(saved.status,200);assert.equal(JSON.parse(mutation.options.body).user_id,'owner-A');
  const removed=await handleApi(new Request('http://local/api/bookmark',{method:'POST',headers,body:JSON.stringify({...body,marked:false})}),env,fetcher);
  assert.equal(removed.status,200);assert.equal(mutation.options.method,'DELETE');assert.match(mutation.url,/user_id=eq.owner-A/);
  const denied=await handleApi(new Request('http://local/api/bookmark',{method:'POST',body:JSON.stringify(body)}),env,()=>{throw Error('Must not call');});
  assert.equal(denied.status,401);
});

test('답안 실패 뒤에는 후속 답안을 앞서 저장하지 않고 실행 중인 동기화를 함께 기다립니다',async()=>{
  let local={bookmarks:[],outbox:[{id:'a',version:'a',route:'answer'},{id:'b',version:'b',route:'answer'},{id:'s',version:'s',route:'bookmark'}]};
  const calls=[];
  const run=()=>drainOutbox({getJobs:()=>local.outbox,isCurrent:()=>true,send:async job=>{calls.push(job.id);if(job.id==='a')throw Error('offline');},ack:job=>{local=acknowledgeJob(local,job);},onError:()=>{}});
  await run();
  assert.deepEqual(calls,['a','s']);assert.deepEqual(local.outbox.map(j=>j.id),['a','b']);
  const gate=createSyncGate();let release;
  const held=new Promise(resolve=>{release=resolve;});
  const first=gate('A',()=>held);
  const second=gate('A',()=>{throw Error('must share');});
  assert.equal(first,second);
  let finished=false;second.then(()=>{finished=true;});
  await Promise.resolve();assert.equal(finished,false);
  release();await second;assert.equal(finished,true);
});
