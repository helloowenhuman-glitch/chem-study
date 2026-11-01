import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudyGuide, buildTeaching } from '../server/study.js';
import { studyTopics } from '../server/study-content.js';
import { normalizeExam, publicQuestion } from '../server/core.js';
import { wrongAnswers, retryQuestions, renderWrongAnswers, renderStudyGuide } from '../public/study.js';
import { handleApi } from '../server/api.js';

const limits=[42,59,83,105,118,140,153,173,192,211];
const id=n=>`CH1S-${String(n).padStart(3,'0')}`;
const plan={rounds:Object.fromEntries(limits.map((_,i)=>[i+1,{title:`회차 ${i+1}`}])) ,concepts:Object.fromEntries(Array.from({length:211},(_,i)=>[id(i+1),{m:`개념 ${i+1}`,r:limits.findIndex(limit=>limit>=i+1)+1,u:'단원'}]))};

test('선택 회차의 개념과 공식만 표시하며 211개 개념을 빠짐없이 주제에 연결합니다',()=>{
  const guide=buildStudyGuide(plan,[1,3]);
  assert.deepEqual(guide.rounds.map(r=>r.number),[1,3]);
  assert.equal(guide.rounds.flatMap(r=>r.topics.flatMap(t=>t.concepts)).length,66);
  const all=buildStudyGuide(plan,[1,2,3,4,5,6,7,8,9,10]);
  const concepts=all.rounds.flatMap(r=>r.topics.flatMap(t=>t.concepts));
  assert.equal(concepts.length,211);
  assert.equal(new Set(concepts.map(c=>c.id)).size,211);
  assert.ok(all.rounds.every(r=>r.topics.length && r.topics.every(t=>t.rules.length && t.example.steps.length && t.sources.every(s=>s.url.startsWith('https://')))));
});

test('몰과 열량 및 적정 예시의 계산과 단위를 확인하고 pH 조건을 명시합니다',()=>{
  const topic=key=>studyTopics.find(t=>t.id===key);
  const mole=topic('mole').example;
  assert.equal(mole.result.value,mole.inputs.mass/mole.inputs.molarMass);
  assert.equal(mole.result.unit,'mol');
  const heat=topic('calorimetry').example;
  assert.equal(heat.result.value,heat.inputs.specificHeat*heat.inputs.mass*heat.inputs.temperatureChange);
  assert.equal(heat.result.unit,'J');
  const titration=topic('titration').example;
  assert.equal(titration.result.value,titration.inputs.acidConcentration*titration.inputs.acidVolume/titration.inputs.baseConcentration);
  assert.equal(titration.result.unit,'mL');
  assert.ok(topic('water').formulas.some(f=>f.expression.includes('14') && f.conditions.includes('25')));
});

test('계산 문항의 원문 수치 해설과 선택지 오류를 보존하고 출제 전에는 숨깁니다',()=>{
  const q=normalizeExam({examId:'fixture',questions:{1:{concept:'몰수=질량÷몰 질량',learningPoint:'몰수 계산',stem:'10 g은 몇 mol인가?',choices:['0.2','0.5','2','5'],answer:2,explanation:'n = 10 g ÷ 20 g/mol = 0.5 mol이다.',misconceptions:{1:'몰 질량 대신 다른 값을 나눈 오류입니다.'}}}})[0];
  const visible=publicQuestion(q);
  for(const key of ['answer','explanation','misconceptions','misconception','learningPoint'])assert.ok(!(key in visible));
  const teaching=buildTeaching(q,'1','몰수=질량÷몰 질량',{...plan,concepts:{[id(28)]:{m:'몰수=질량÷몰 질량',r:1}}});
  assert.equal(teaching.kind,'calculation');
  assert.match(teaching.explanation,/10 g ÷ 20 g\/mol = 0.5 mol/);
  assert.match(teaching.mistake,/몰 질량/);
  assert.equal(teaching.topic.id,'mole');
  assert.ok(teaching.topic.formulas.some(f=>f.expression.includes('m / M')));
  const concept=buildTeaching({...q,conceptId:id(175),stem:'브뢴스테드 산의 정의로 옳은 것은?',learningPoint:'산의 정의',explanation:'산은 양성자를 주는 물질입니다.'},'1','산의 정의',plan);
  assert.equal(concept.kind,'concept');
  const numericOx=buildTeaching({kind:'ox',conceptId:id(11),stem:'금속 원자 1개가 차지하는 부피는 약 1.7×10⁻²³ m³이다.',answer:'X',explanation:'10 cm³ ÷ (6.02×10²³) ≈ 1.7×10⁻²³ cm³입니다.'},'O','원자 개수·부피 어림',plan);
  assert.equal(numericOx.kind,'calculation');
});

test('결과는 틀린 문항만 내 답 및 정답과 묶고 재출제에는 해설을 넣지 않습니다',()=>{
  const questions=[{id:'a',kind:'ox',concept:'몰',stem:'본문 <script>',choices:['O','X']},{id:'b',kind:'ox',concept:'몰',stem:'맞힌 문제',choices:['O','X']}];
  const results=[{correct:false,selected:'X',answer:'O',explanation:'근거입니다.'},{correct:true,selected:'O',answer:'O'}];
  assert.deepEqual(wrongAnswers(questions,results).map(x=>x.question.id),['a']);
  assert.deepEqual(retryQuestions(questions,results),[questions[0]]);
  assert.equal(wrongAnswers(questions,[{correct:true}]).length,0);
  const html=renderWrongAnswers(questions,results);
  assert.match(html,/내 답/);assert.match(html,/정답/);assert.match(html,/근거입니다/);
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('맞힌 문제'));
  assert.match(renderStudyGuide(buildStudyGuide(plan,[1])),/공식/);
});

test('학습 안내 API는 선택 범위를 검증하고 보충 자료 실패가 채점을 막지 않습니다',async()=>{
  const response=await handleApi(new Request('http://local/api/guide?rounds=1,3'),{},async()=>Response.json(plan));
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).rounds.map(r=>r.number),[1,3]);
  const invalid=await handleApi(new Request('http://local/api/guide?rounds='),{},async()=>{throw Error('must not fetch');});
  assert.equal(invalid.status,400);
  const transport=async url=>{
    if(url.includes('round_ch1s_'))return Response.json({jeongsi:{items:[{n:'1-01',c:id(28),mis:'몰 계산',s:'질량으로 몰수를 계산합니다.',a:'O',w:'질량을 몰 질량으로 나눕니다.'}]}});
    throw Error('Guide source unavailable');
  };
  const answer=await handleApi(new Request('http://local/api/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({questionId:'dt:1:1-01',selected:'X',round:1,mode:'exam'})}),{},transport);
  assert.equal(answer.status,200);
  assert.equal((await answer.json()).correct,false);
});
