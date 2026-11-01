import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReportLink, normalizeDt, normalizeExam, extractWeaknesses, selectReview, grade } from '../server/core.js';
import { handleApi } from '../server/api.js';
import { loadStudyBank, loadQuestion } from '../server/data.js';
import { beginProgress, applyProgress, readRoundSelection, saveRoundSelection } from '../public/progress.js';
import * as core from '../server/core.js';

test('개념별로 균등 배분하고 나머지와 부족한 개념의 몫을 남은 문제에 배분합니다', () => {
  const make=(concept,n)=>Array.from({length:n},(_,i)=>({id:`${concept}:${i}`,concept,stem:`${concept} 문제 ${i}`,choices:['O','X']}));
  const bank=[...make('A',8),...make('B',8),...make('C',8)];
  const selected=core.selectBalanced(bank,10,()=>0.5);
  const counts=Object.values(selected.reduce((all,q)=>{all[q.concept]=(all[q.concept] || 0)+1;return all;},{})).sort();
  assert.deepEqual(counts,[3,3,4]);
  const scarce=core.selectBalanced([...make('A',1),...make('B',8),...make('C',8)],10,()=>0.5);
  assert.equal(scarce.length,10);
  assert.equal(scarce.filter(q=>q.concept==='A').length,1);
  assert.deepEqual(['B','C'].map(c=>scarce.filter(q=>q.concept===c).length).sort(),[4,5]);
  assert.equal(core.selectBalanced(bank,2).length,2);
  assert.equal(core.selectBalanced(make('A',2),10).length,2);
});

test('다른 회차에서 반복된 같은 지문과 선택지는 한 번만 출제합니다', () => {
  const q={concept:'개념',stem:'본문 0.1',choices:['O','X']};
  const selected=core.selectBalanced([{...q,id:'a'},{...q,id:'b'},{...q,id:'c',stem:'본문 01'}],10);
  assert.equal(selected.length,2);
  assert.equal(new Set(selected.map(q=>q.stem)).size,2);
});

test('기억한 회차는 기기에서 계정별로 복원하고 저장소를 쓸 수 없어도 학습을 막지 않습니다', () => {
  const values=new Map();
  const storage={getItem:key=>values.get(key) ?? null,setItem:(key,value)=>values.set(key,value)};
  saveRoundSelection(storage,'A',[1,3]);
  saveRoundSelection(storage,'B',[2,4]);
  assert.deepEqual(readRoundSelection(storage,'A',9),[1,3]);
  assert.deepEqual(readRoundSelection(storage,'B',9),[2,4]);
  assert.deepEqual(readRoundSelection(storage,null,9),[9]);
  assert.deepEqual(readRoundSelection({getItem:()=>'{bad'},'A',2),[2]);
  assert.doesNotThrow(()=>saveRoundSelection(null,'A',[1]));
});

const preparationPlan={rounds:{1:{new:['C1']},2:{new:['C2']},3:{new:['C3']}},concepts:{C1:{m:'개념 A',r:1},C2:{m:'개념 B',r:2},C3:{m:'개념 C',r:3}}};
const preparationFetch=async url=>{
  if(url.endsWith('plan_ch1s.json'))return Response.json(preparationPlan);
  if(url.endsWith('index.json'))return Response.json({concept:{'개념 A':['fixture:1'],'개념 B':['fixture:2'],'개념 C':['fixture:3']}});
  if(url.includes('/donghyung/'))return Response.json({examId:'fixture',questions:Object.fromEntries([1,2,3].map((n)=>[n,{concept:`원문 ${n}`,stem:`객관식 ${n}`,choices:['가','나','다','라'],answer:1}]))});
  const round=Number(url.match(/round_ch1s_(\d+)\.json$/)?.[1]);
  if(!round)throw new Error('Unexpected URL');
  return Response.json({jeongsi:{items:[1,2,3].filter(n=>n<=round).map(n=>({n:`${round}-${n}`,c:`C${n}`,mis:`개념 ${['A','B','C'][n-1]}`,s:`OX ${n}`,a:'O'}))}});
};

test('선택한 1·3회차만 DT와 exam에서 합치고 누적 중복과 2회차를 제외합니다', async () => {
  for(const source of ['dt','exam']) {
    const response=await handleApi(new Request(`http://localhost/api/questions?rounds=1,3&source=${source}&count=5`),{},preparationFetch);
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.total,2);
    assert.deepEqual(data.questions.map(q=>q.concept).sort(),['개념 A','개념 C']);
    assert.deepEqual(data.questions.map(q=>q.preparationRound).sort(),[1,3]);
    assert.ok(data.questions.every(q=>!('answer' in q) && !('explanation' in q)));
  }
});

test('빈 회차와 잘못된 회차를 원격 조회 전에 거절하고 중복 회차는 정리합니다', async () => {
  for(const rounds of ['', '0,1', '1,11', '1,,3', 'NaN']) {
    let called=false;
    const response=await handleApi(new Request(`http://localhost/api/questions?rounds=${rounds}`),{},async()=>{called=true;throw Error('must not fetch');});
    assert.equal(response.status,400,rounds);
    assert.equal(called,false);
  }
  const repeated=await handleApi(new Request('http://localhost/api/questions?rounds=3,1,3'),{},preparationFetch);
  assert.equal((await repeated.json()).total,2);
  const legacy=await handleApi(new Request('http://localhost/api/questions?round=3'),{},preparationFetch);
  assert.equal((await legacy.json()).total,3);
});

test('공유 exam 문항도 개념별 배분에 참여하고 다섯 번째 시험지의 개념도 포함합니다', async () => {
  const transport=async url=>{
    if(url.endsWith('plan_ch1s.json'))return Response.json({rounds:{},concepts:{A:{m:'A',r:1},B:{m:'B',r:2},C:{m:'C',r:3}}});
    if(url.endsWith('index.json'))return Response.json({concept:{A:Array.from({length:20},(_,i)=>`one:${i+1}`).concat(['two:1','three:1','four:1']),B:Array.from({length:10},(_,i)=>`one:${i+1}`),C:['five:1']}});
    const id=url.match(/\/([^/]+)\.json$/)[1];
    return Response.json({examId:id,questions:Object.fromEntries(Array.from({length:id==='one'?20:1},(_,i)=>[i+1,{concept:'원문',stem:`${id} ${i+1}`,choices:['가','나','다','라'],answer:1}]))});
  };
  const shared=await handleApi(new Request('http://localhost/api/questions?rounds=1,2&source=exam&count=10'),{},transport);
  const questions=(await shared.json()).questions;
  assert.equal(questions.filter(q=>q.concept==='A').length,5);
  assert.equal(questions.filter(q=>q.concept==='B').length,5);
  assert.equal(new Set(questions.map(q=>q.id)).size,10);
  assert.ok(questions.every(q=>q.preparationRound===(q.concept==='A'?1:2)));
  const all=await handleApi(new Request('http://localhost/api/questions?rounds=1,2,3&source=exam&count=10'),{},transport);
  assert.ok((await all.json()).questions.some(q=>q.concept==='C'));
});

test('리포트 주소는 DT 학생 링크만 받고 다른 호스트와 프로토콜을 거절합니다', () => {
  assert.equal(parseReportLink('https://chemistreal.github.io/DT/report.html?student=abcdef123&c=ch1s').student,'abcdef123');
  for(const url of ['http://chemistreal.github.io/DT/report.html?student=abcdef123','https://chemistreal.github.io.evil.test/DT/report.html?student=abcdef123','https://chemistreal.github.io/exam/admin.html?student=abcdef123','https://a:b@chemistreal.github.io/DT/report.html?student=abcdef123']) assert.throws(()=>parseReportLink(url));
});
test('DT OX와 exam 객관식의 정답을 원본 형식대로 보존하고 제외 문항을 뺍니다', () => {
  const items=normalizeDt({course:'ch1s',round:9,jeongsi:{items:[{n:'9-35',c:'CH1S-175',mis:'산·염기',s:'본문',a:'X',w:'해설'},{n:'9-36',s:'제외',a:'O',excluded:true}]}},9);
  assert.equal(items.length,1); assert.equal(items[0].answer,'X');
  assert.equal(normalizeExam({examId:'jmchc-5',questions:{'1':{concept:'혼성',stem:'본문',choices:['가','나','다','라'],answer:2,explanation:'해설'}}})[0].answer,'2');
});
test('리포트가 비정상일 때 빈 오답으로 위장하지 않고 실제 오답만 집계합니다', () => {
  assert.throws(()=>extractWeaknesses({error:'not found'}));
  const weak=extractWeaknesses({rows:[{course:'ch1s',round:9,wrongMis:['짝산·짝염기','짝산·짝염기']},{course:'ch1s',round:8,wrongMis:['헤스 법칙']}],cumulative:{}},'ch1s');
  assert.equal(weak.length,2); assert.equal(weak.find(w=>w.name==='짝산·짝염기').count,1);
});
test('복습은 일치하는 오답 개념만 고르고 없을 때 다른 문제를 몰래 섞지 않습니다', () => {
  const qs=[{id:'a',concept:'짝산·짝염기',conceptId:'C1'},{id:'b',concept:'열화학',conceptId:'C2'}];
  assert.deepEqual(selectReview(qs,[{name:'짝산 짝염기'}],10).map(q=>q.id),['a']);
  assert.deepEqual(selectReview(qs,[{name:'없는 개념'}],10),[]);
});
test('OX와 객관식을 채점하고 허용되지 않는 답을 거절합니다', () => {
  assert.equal(grade({answer:'X',choices:['O','X']},'X').correct,true);
  assert.equal(grade({answer:'2',choices:['가','나','다','라']},'1').correct,false);
  assert.throws(()=>grade({answer:'2',choices:['가','나','다','라']},'9'));
});
test('리포트 연결은 로그인 없이 원격 요청을 실행하지 않습니다', async () => {
  let called=false;
  const response=await handleApi(new Request('http://localhost/api?route=report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://chemistreal.github.io/DT/report.html?student=abcdef123'})}),{},async()=>{called=true;throw Error('must not call');});
  assert.equal(response.status,401);assert.equal(called,false);
  assert.match(response.headers.get('Cache-Control'),/no-store/);
});
test('비정상 회차를 거절하고 공개 설정에 서버 비밀키를 포함하지 않습니다', async () => {
  const bad=await handleApi(new Request('http://localhost/api?route=questions&round=99'),{});
  assert.equal(bad.status,400);
  const config=await handleApi(new Request('http://localhost/api?route=config'),{SUPABASE_SERVICE_ROLE_KEY:'NEVER-EXPOSE'});
  assert.equal((await config.text()).includes('NEVER-EXPOSE'),false);
  const padded=await handleApi(new Request('http://localhost/api?route=config'),{SUPABASE_URL:' \nhttps://example.supabase.co/\r\n',SUPABASE_PUBLISHABLE_KEY:' fixture-key \n'});
  const normalized=await padded.json();
  assert.equal(normalized.supabaseUrl,'https://example.supabase.co');
  assert.equal(normalized.publishableKey,'fixture-key');
});

test('exam 인덱스의 별칭을 복습과 풀이 기록에 사용할 수 있도록 보존합니다', async () => {
  const fakeFetch=async url=>new Response(JSON.stringify(url.endsWith('plan_ch1s.json')?{rounds:{},concepts:{C1:{m:'형식 전하 계산',r:2}}}:url.endsWith('index.json')?{concept:{'형식 전하 계산':['example:1']}}:{examId:'example',questions:{'1':{concept:'형식전하',stem:'문제',choices:['가','나','다','라'],answer:1,explanation:'해설'}}}));
  const bank=await loadStudyBank(2,'exam',[{name:'형식 전하 계산'}],fakeFetch);
  assert.equal(selectReview(bank,[{name:'형식 전하 계산'}]).length,1);
  assert.equal(bank[0].concept,'형식 전하 계산');
  assert.ok((await loadQuestion('exam:example:1',fakeFetch)).matchingConcepts.includes('형식 전하 계산'));
  let stored;
  const transport=async(url,options)=>{
    if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'owner-A'}));
    if(url.includes('/rest/v1/study_answers')){stored=JSON.parse(options.body);return new Response(null,{status:201});}
    return fakeFetch(url);
  };
  const request=new Request('http://localhost/api?route=answer',{method:'POST',headers:{Authorization:'Bearer fixture-token','Content-Type':'application/json'},body:JSON.stringify({questionId:'exam:example:1',concept:'형식 전하 계산',selected:'1',round:2,mode:'review',sessionId:'11111111-1111-4111-8111-111111111111',user_id:'someone-else'})});
  const response=await handleApi(request,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'fixture-key'},transport);
  assert.equal(response.status,200);
  assert.equal(stored.concept,'형식 전하 계산');
  assert.equal(stored.user_id,'owner-A');
});

test('이전 계정의 지연된 응답은 로그아웃 또는 계정 전환 이후 적용하지 않습니다', () => {
  const state={session:{user:{id:'A'}},screen:'home',sessionId:'',report:null,attempts:[],weaknesses:[]};
  const ticket=beginProgress(state);
  const data={report:{report_url:'private'},attempts:[{concept:'private'}],weaknesses:[{name:'private'}],targetRound:9};
  state.session=null;
  assert.equal(applyProgress(state,ticket,data),false);
  assert.equal(state.report,null);
  state.session={user:{id:'B'}};
  assert.equal(applyProgress(state,ticket,data),false);
  assert.equal(state.weaknesses.length,0);
  const current=beginProgress(state);
  assert.equal(applyProgress(state,current,{...data,report:null,weaknesses:[],attempts:[]}),true);
});

test('저장한 리포트 연결을 새 요청에서도 계정 기록에서 다시 불러옵니다', async () => {
  let savedLink=null;
  const transport=async(url,options={})=>{
    if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'account-A'}));
    if(url.startsWith('https://script.google.com/'))return new Response(JSON.stringify({rows:[{course:'ch1s',round:9,wrongMis:['짝산·짝염기']}],cumulative:{}}));
    if(url.includes('/rest/v1/report_links')) {
      if(options.method==='POST'){savedLink=JSON.parse(options.body);return new Response(null,{status:201});}
      return new Response(JSON.stringify(savedLink?[savedLink]:[]));
    }
    if(url.includes('/rest/v1/study_profiles'))return new Response(JSON.stringify([{target_round:9}]));
    if(url.includes('/rest/v1/study_answers'))return new Response('[]');
    throw new Error('Unexpected request');
  };
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'fixture-key',REPORT_API_URL:'https://script.google.com/macros/s/fixture/exec'};
  const headers={Authorization:'Bearer fixture-token','Content-Type':'application/json'};
  const reportUrl='https://chemistreal.github.io/DT/report.html?student=abcdef123&c=ch1s';
  const connected=await handleApi(new Request('http://localhost/api/report',{method:'POST',headers,body:JSON.stringify({url:reportUrl})}),env,transport);
  assert.equal(connected.status,200);
  const reopened=await handleApi(new Request('http://localhost/api/progress',{headers}),env,transport);
  assert.equal(reopened.status,200);
  const restored=await reopened.json();
  assert.equal(restored.report.report_url,reportUrl);
  assert.equal(restored.weaknesses[0].name,'짝산·짝염기');
  assert.equal(restored.targetRound,9);
});
