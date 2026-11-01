import { api, setupAuth, signIn, signUp, resetPassword, updatePassword, signOut, authMessage } from './client.js';
import { beginProgress, applyProgress, isCurrentProgress, readRoundSelection, saveRoundSelection } from './progress.js';
import { renderStudyGuide, renderTeaching, renderWrongAnswers, wrongAnswers, retryQuestions } from './study.js';

const main = document.getElementById('main');
const modal = document.getElementById('modal');
const noticeElement = document.getElementById('notice');
const state = {
  screen:'home',round:1,selectedRounds:[1],rounds:[],source:'dt',count:10,session:null,configured:false,
  report:null,weaknesses:[],attempts:[],progressError:'',planError:'',busy:false,
  questions:[],results:[],index:0,choice:null,feedback:null,mode:'exam',sessionId:'',
  emptyMessage:'',authMode:'signin',booted:false,guide:null,guideReturn:'rounds',isRetry:false
};
let noticeTimer;
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roundLabel = () => state.selectedRounds.length?`${state.selectedRounds.join('·')}회차`:'회차를 선택해 주세요';
const roundTitle = () => state.selectedRounds.length===1 ? state.rounds.find(r=>r.number===state.selectedRounds[0])?.title || roundLabel() : state.selectedRounds.length ? '선택한 회차의 개념을 함께 준비합니다.' : '준비할 범위를 선택해 주세요.';
const selectionStorage = () => {try{return window.localStorage;}catch{return null;}};
function restoreSelection() {
  state.selectedRounds=readRoundSelection(selectionStorage(),state.session?.user.id,state.round);
  state.round=state.selectedRounds.length?Math.max(...state.selectedRounds):1;
}
function navigate(screen) {
  if(state.screen!==screen){state.screen=screen;history.pushState({chemScreen:screen},'',`#${screen}`);window.scrollTo({top:0});}
}
const primary = (action,label,disabled=false) => `<button type="button" class="primary" data-action="${action}"${disabled?' disabled':''}>${label}</button>`;
const back = (action,label) => `<button type="button" class="back" data-action="${action}">← ${label}</button>`;
function notify(message,error=false) {
  clearTimeout(noticeTimer);
  noticeElement.textContent=message;
  noticeElement.classList.toggle('error',error);
  noticeElement.hidden=false;
  noticeTimer=setTimeout(()=>noticeElement.hidden=true,6000);
}
function dateLabel(value) {
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'':date.toLocaleDateString('ko-KR',{month:'long',day:'numeric'});
}
function home() {
  const linked=!!state.report;
  const status = !state.session ? '개인 리포트를 연결해 주세요' : linked ? '개인 리포트 연결됨' : '개인 리포트 연결하기';
  return `<div class="overline">화학Ⅰ 심화 · 나의 학습</div><h1>틀린 개념부터,<br>확실하게.</h1>
    <button type="button" class="report-line" data-action="report"><span class="status-dot ${linked?'':'unlinked'}" aria-hidden="true"></span>${status}<span class="link-text">${linked?'관리':'연결'} →</span></button>
    ${state.progressError?`<div class="error-box" role="alert">${escape(state.progressError)}<button type="button" class="text-button" data-action="refresh">다시 불러오기</button></div>`:''}
    <section class="target" aria-label="준비할 시험 회차"><div class="round-number">${state.selectedRounds.length>1?`${state.selectedRounds.length}개`:state.selectedRounds.length?String(state.round).padStart(2,'0'):'—'}</div><div class="target-info"><p class="sub">준비할 시험 · ${roundLabel()}</p><h2>${escape(roundTitle())}</h2></div><button type="button" class="text-button" data-action="rounds">변경</button></section>
    <button type="button" class="start" data-action="review"><span class="small">나의 오답에서 시작하는 학습</span><span class="start-title">틀린 개념 복습하기</span><span class="start-bottom"><span>${state.session?state.weaknesses.length?`복습할 개념 ${state.weaknesses.length}개`:'리포트와 나의 풀이 기록으로 복습':'로그인하고 나의 오답을 불러오세요'}</span><span class="arrow" aria-hidden="true">→</span></span></button>
    <button type="button" class="secondary" data-action="rounds"><span><strong>다음 시험 준비하기</strong><span class="sub">회차를 고르고 관련 문제를 풀어보세요.</span></span><span aria-hidden="true">→</span></button>
    <button type="button" class="outline" data-action="show-guide"${state.selectedRounds.length?'':' disabled'}>선택한 회차 개념·공식 보기</button>
    <div class="section-title"><h2>다시 살펴볼 개념</h2>${state.weaknesses.length?`<span class="sub">${state.weaknesses.length}개</span>`:''}</div>
    ${state.progressError?'<p class="description">학습 기록을 다시 불러오면 복습할 개념을 확인하실 수 있습니다.</p>':state.weaknesses.length?state.weaknesses.slice(0,5).map((w,i)=>`<div class="concept-row"><span class="concept-number">${String(i+1).padStart(2,'0')}</span><span class="concept-name">${escape(w.name)}</span><span class="tag">복습 필요</span></div>`).join(''):`<p class="description">${state.session?linked?'리포트와 최근 풀이를 기준으로 복습할 개념이 없습니다.':'리포트를 연결하거나 문제를 풀면 복습할 개념이 표시됩니다.':'로그인 후 리포트를 연결하면 나의 오답 개념이 표시됩니다.'}</p>`}
    ${state.report?`<p class="note">리포트 갱신 ${dateLabel(state.report.synced_at)} · <button type="button" class="text-button" data-action="sync-report">새로 불러오기</button></p>`:''}`;
}
function options() {
  return `<div class="study-options"><div><label for="question-source">문제 자료</label><select id="question-source"><option value="dt"${state.source==='dt'?' selected':''}>DT OX</option><option value="exam"${state.source==='exam'?' selected':''}>exam 객관식</option></select></div><div><label for="question-count">문항 수</label><select id="question-count">${[5,10,20,60].map(n=>`<option value="${n}"${state.count===n?' selected':''}>${n}문항</option>`).join('')}</select></div></div>`;
}
function rounds() {
  return `${back('home','홈으로')}<div class="overline">시험 대비</div><h1>어느 회차를<br>준비하실까요?</h1><p class="description">여러 회차를 함께 선택하실 수 있습니다.<br>선택한 회차의 개념별로 문제 수를 고르게 배분합니다.</p>
    <div class="course-label"><span>선수노트</span><span class="tag soft-tag">화학Ⅰ 심화 · 총 10회차</span></div>
    ${state.planError?`<div class="error-box" role="alert">${escape(state.planError)}${primary('reload-plan','다시 불러오기')}</div>`:`<div class="round-list" role="group" aria-label="선수노트 회차 여러 개 선택">${state.rounds.map(r=>`<button type="button" class="round-item" data-round="${r.number}" aria-pressed="${state.selectedRounds.includes(r.number)}"><span class="rn">${String(r.number).padStart(2,'0')}</span><span class="rt">${escape(r.title)}</span>${state.selectedRounds.includes(r.number)?'<span class="selected-label">선택</span>':''}</button>`).join('')}</div><p class="note" role="status">선택한 범위 · ${roundLabel()}</p>${options()}${primary('start-exam',state.selectedRounds.length?`${roundLabel()} 문제 풀기 →`:'준비할 회차를 선택해 주세요',!state.rounds.length || !state.selectedRounds.length)}`}
    <button type="button" class="outline" data-action="show-guide"${!state.rounds.length || !state.selectedRounds.length?' disabled':''}>선택한 회차 개념·공식 보기</button><p class="note">선택한 회차에서 다루는 개념의 DT OX 또는 exam 객관식을 모읍니다. 중복 문제를 제외하고, 문제가 부족한 개념의 몫은 다른 개념에 배분합니다.</p>`;
}
function guide() {
  return `${back(state.guideReturn,'돌아가기')}<div class="overline">시험 전 개념 정리</div><h1>개념을 짚고,<br>공식을 연결하세요.</h1><p class="description">공식의 뜻과 적용 조건, 풀이 순서를 함께 확인해 주세요. 예시는 현재 출제된 문제와 별도의 학습 예시입니다.</p>${state.guide?renderStudyGuide(state.guide):'<p class="description">회차 선택 화면에서 학습할 범위를 선택해 주세요.</p>'}${primary('rounds','문제 풀 회차 고르기 →')}`;
}
function review() {
  return `${back('home','홈으로')}<div class="overline">오답 복습</div><h1>헷갈린 개념을<br>다시 살펴보세요.</h1><p class="description">리포트에서 틀렸던 개념과 이곳에서 틀린 문제를 함께 복습합니다.</p>
    ${state.progressError?`<div class="error-box" role="alert">${escape(state.progressError)}${primary('refresh','다시 불러오기')}</div>`:state.weaknesses.length?`<div class="section-title"><h2>복습할 개념</h2><span class="sub">${state.weaknesses.length}개</span></div>${state.weaknesses.slice(0,15).map(w=>`<div class="concept-row"><span class="concept-name">${escape(w.name)}</span><span class="tag">${w.origin==='app'?'앱 오답':'리포트 오답'}</span></div>`).join('')}${options()}${primary('start-review','개념 복습 시작하기 →')}<p class="note">최근에 맞힌 개념은 복습 대기 목록에서 빠집니다. 전체 개념의 숙달을 판정하는 기능은 아닙니다.</p>`:`<div class="empty"><h2>복습할 오답이 없습니다.</h2><p>${state.report?'시험 대비 문제를 풀며 이해를 확인해 보세요.':'개인 리포트를 연결하거나 시험 대비 문제를 풀어보세요.'}</p>${primary(state.report?'rounds':'report',state.report?'시험 대비 문제 고르기':'리포트 연결하기')}</div>`}`;
}
function practice() {
  if (!state.questions.length) return `${back(state.mode==='review'?'review':'rounds','돌아가기')}<div class="overline">문제 찾기</div><h1>관련 문제를<br>찾지 못했습니다.</h1><p class="description">${escape(state.emptyMessage)}</p>${primary(state.mode==='review'?'review':'rounds','문제 자료 다시 선택하기')}`;
  if (state.index>=state.questions.length) return result();
  const q=state.questions[state.index];
  return `${back(state.mode==='review'?'review':'rounds',state.mode==='review'?'복습 목록으로':'회차 선택으로')}<div class="question-top"><span class="overline">${state.isRetry?'틀린 문제 다시 풀기':state.mode==='review'?'틀린 개념 복습':`선수노트 ${roundLabel()} 대비`}</span><span class="counter">${String(state.index+1).padStart(2,'0')} / ${String(state.questions.length).padStart(2,'0')}</span></div>
    <div class="progress" role="progressbar" aria-label="문제 풀이 진행" aria-valuemin="0" aria-valuemax="${state.questions.length}" aria-valuenow="${state.index}"><div class="progress-fill" style="width:${100*state.index/state.questions.length}%"></div></div>
    <h2>${escape(q.concept)}</h2><div class="question-labels"><span class="tag soft-tag">${escape(q.source)}</span><span class="tag">${q.kind==='ox'?'OX':'객관식'}</span></div>
    <section class="question" aria-label="${state.index+1}번 문제"><div class="question-index">Question ${String(state.index+1).padStart(2,'0')}</div><p class="stem">${escape(q.stem)}</p><div class="source"><a href="${escape(q.sourceUrl)}" target="_blank" rel="noopener noreferrer">자료 출처 · ${escape(q.sourceId)}</a></div></section>
    <div class="answer-options ${q.kind==='choice'?'multiple':''}" role="group" aria-label="정답 선택">${q.choices.map((choice,i)=>{const value=q.kind==='ox'?choice:String(i+1);return `<button type="button" class="answer" data-choice="${value}" aria-pressed="${state.choice===value}"${state.feedback?' disabled':''}>${q.kind==='ox'?`<span class="answer-symbol">${choice}</span><span class="answer-caption">${choice==='O'?'맞습니다':'틀립니다'}</span>`:`<span class="choice-number">${i+1}</span><span>${escape(choice)}</span>`}</button>`;}).join('')}</div>
    ${state.feedback?`<section class="feedback ${state.feedback.correct?'':'incorrect'}" role="status"><h3>${state.feedback.correct?'정답입니다.':`다시 살펴보세요. 정답은 ${escape(state.feedback.answer)}입니다.`}</h3>${renderTeaching(state.feedback.teaching,state.feedback.explanation)}<div class="save-state">${state.feedback.saved?'나의 학습 기록에 저장되었습니다.':'로그인 전 풀이로 기록이 저장되지 않았습니다.'}</div></section>${primary('next',state.index===state.questions.length-1?'풀이 결과 보기 →':'다음 문제 →')}`:primary('submit','정답 확인하기',!state.choice)}
    ${!state.session?'<p class="note">로그인하면 풀이 결과가 저장되어 오답 복습으로 이어집니다.</p>':''}`;
}
function result() {
  const correct=state.results.filter(r=>r.correct).length;
  const wrong=wrongAnswers(state.questions,state.results);
  return `<div class="overline">${state.isRetry?'오답 재풀이 완료':'학습 완료'}</div><h1>한 번 더 살펴본 만큼,<br>개념이 선명해집니다.</h1><div class="result-number">${correct}<small> / ${state.results.length}</small></div><p class="description">${state.results.length}문항 중 ${correct}문항을 맞히셨습니다.</p><div class="result-list">${state.results.map((r,i)=>`<div class="result-row"><span>${i+1}. ${escape(state.questions[i].concept)}</span><span class="${r.correct?'correct':'wrong'}">${r.correct?'정답':'다시 복습'}</span></div>`).join('')}</div>${wrong.length?`<div class="section-title"><h2>틀린 문제 다시 보기</h2><span class="tag">${wrong.length}문항</span></div><p class="description">내 답과 정답을 비교하고, 해설에서 판단과 계산 과정을 확인해 주세요.</p>${renderWrongAnswers(state.questions,state.results)}${primary('retry-wrong',`틀린 ${wrong.length}문제만 다시 풀기 →`)}`:'<section class="empty"><h2>모든 문제를 맞히셨습니다.</h2><p>다른 회차를 선택하거나 개념·공식을 다시 살펴보세요.</p></section>'}${primary('home','홈으로 돌아가기')}<button type="button" class="outline" data-action="${state.session?'review':'account'}">${state.session?'오답 개념 복습하기':'로그인하고 기록 시작하기'}</button>`;
}
function records() {
  const total=state.attempts.length;
  const correct=state.attempts.filter(a=>a.correct).length;
  return `${back('home','홈으로')}<div class="overline">내 기록</div><h1>나의 학습을<br>차곡차곡.</h1>
    ${state.progressError?`<div class="error-box" role="alert">${escape(state.progressError)}${primary('refresh','다시 불러오기')}</div>`:`<div class="metrics"><div><span class="metric-value">${total}</span><span class="sub">푼 문제</span></div><div><span class="metric-value">${total?Math.round(correct/total*100):0}%</span><span class="sub">정답률</span></div><div><span class="metric-value">${state.weaknesses.length}</span><span class="sub">복습할 개념</span></div></div><p class="record-limit">최근 최대 1,000문항의 앱 풀이 기록 기준입니다.</p><div class="section-title"><h2>최근 풀이</h2><button type="button" class="text-button" data-action="refresh">새로고침</button></div>${total?state.attempts.slice(0,30).map(a=>`<div class="record"><div class="record-title"><span>${escape(a.concept)}</span><span class="${a.correct?'correct':'wrong'}">${a.correct?'정답':'오답'}</span></div><p class="sub">${dateLabel(a.created_at)} · ${a.round}회차 ${a.mode==='review'?'복습':'대비'} · ${escape(a.source)}</p></div>`).join(''):'<p class="description">아직 풀이 기록이 없습니다. 첫 문제를 풀어보세요.</p>'}`}`;
}
function render() {
  main.innerHTML = state.busy?'<div class="loading" role="status">잠시만 기다려 주세요.</div>':({home,rounds,guide,review,practice,records}[state.screen] || home)();
  const active=state.screen==='guide'?'rounds':state.screen==='practice'?(state.mode==='review'?'review':'rounds'):state.screen;
  document.querySelectorAll('.bottom-nav button').forEach(b=>{if(b.dataset.action===active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');b.disabled=state.busy;});
  const account=document.getElementById('account-button');
  account.textContent=state.session?'내 계정':'로그인';
  account.disabled=state.busy;
}
async function refreshProgress() {
  if(!state.session)return;
  const ticket=beginProgress(state);
  try {
    const data=await api('progress');
    if(applyProgress(state,ticket,data) && state.screen==='home' && !state.sessionId)restoreSelection();
  } catch(error){if(isCurrentProgress(state,ticket))state.progressError=error.message;}
}
async function run(operation) {
  if(state.busy)return;
  state.busy=true;render();
  try{await operation();}catch(error){notify(error.message,true);}
  finally{state.busy=false;render();}
}
function openModal(content) {
  modal.innerHTML=content;
  if(!modal.open)modal.showModal();
}
const modalHeader = title => `<div class="modal-header"><h2 id="modal-title">${title}</h2><button type="button" class="modal-close" data-action="close-modal">닫기</button></div>`;
function authDialog(mode='signin') {
  state.authMode=mode;
  if(!state.configured){openModal(`${modalHeader('로그인 준비 중')}<p class="modal-sub">로그인 서버 설정이 아직 준비되지 않았습니다. 시험 대비 문제는 로그인 없이도 풀어보실 수 있습니다.</p>`);return;}
  if(state.session && mode!=='recovery') {
    openModal(`${modalHeader('내 계정')}<p class="email">${escape(state.session.user.email)}</p><button type="button" class="primary" data-action="report">개인 리포트 연결 관리</button><button type="button" class="outline" data-action="logout">로그아웃</button>`);return;
  }
  const titles={signin:'다시 만나 반갑습니다.',signup:'나의 학습을 시작하세요.',reset:'비밀번호 재설정',recovery:'새 비밀번호 설정'};
  const buttons={signin:'로그인',signup:'가입하기',reset:'재설정 메일 받기',recovery:'새 비밀번호 저장'};
  openModal(`${modalHeader(titles[mode])}<p class="modal-sub">${mode==='reset'?'가입한 이메일로 재설정 링크를 보내드립니다.':mode==='recovery'?'사용하실 새 비밀번호를 입력해 주세요.':'개인별 리포트와 학습 기록을 연결합니다.'}</p><form id="auth-form" class="auth-form">${mode!=='recovery'?'<label for="auth-email">이메일</label><input id="auth-email" name="email" type="email" autocomplete="email" required maxlength="254">':''}${mode!=='reset'?`<label for="auth-password">비밀번호</label><input id="auth-password" name="password" type="password" autocomplete="${mode==='signin'?'current-password':'new-password'}" minlength="${mode==='signin'?1:8}" required maxlength="128">`:''}<p id="auth-message" class="form-message" role="status"></p><button class="primary" type="submit">${buttons[mode]}</button></form>${mode==='signin'?'<div class="form-links"><button type="button" class="text-button" data-action="signup">처음이신가요? 가입하기</button><button type="button" class="text-button" data-action="reset">비밀번호 재설정</button></div>':mode!=='recovery'?'<button type="button" class="text-button" data-action="signin">로그인으로 돌아가기</button>':''}`);
}
function reportDialog() {
  if(!state.session){authDialog();return;}
  openModal(`${modalHeader('개인 리포트 연결')}<p class="modal-sub">DT 개인 리포트의 전체 링크를 붙여넣어 주세요. 리포트에서 틀렸던 개념을 복습에 활용합니다.</p><form id="report-form"><label for="report-url">리포트 링크</label><input id="report-url" class="report-input" name="url" type="url" required maxlength="600" placeholder="https://chemistreal.github.io/DT/report.html?student=…" value="${escape(state.report?.report_url || '')}"><p id="report-message" class="form-message" role="status"></p><button type="submit" class="primary">리포트 연결하기</button></form>${state.report?`<p class="note">마지막 연결 ${dateLabel(state.report.synced_at)}</p>`:''}`);
}
async function startStudy(mode) {
  if(mode==='review'&&!state.session){authDialog();return;}
  if(mode==='exam'&&!state.selectedRounds.length){notify('준비할 회차를 1개 이상 선택해 주세요.',true);return;}
  await run(async()=>{
    if(state.session) await api('target',{method:'POST',body:{round:state.round}});
    const data=await api('questions',{query:{round:state.round,...(mode==='exam'?{rounds:state.selectedRounds.join(',')}:{}),source:state.source,count:state.count,mode}});
    Object.assign(state,{mode,questions:data.questions,emptyMessage:data.message,index:0,choice:null,feedback:null,results:[],sessionId:crypto.randomUUID(),isRetry:false});
    navigate('practice');
    if(data.questions.length && data.questions.length<state.count)notify(`연결되는 문제 ${data.questions.length}문항으로 시작합니다.`);
  });
}
async function action(name) {
  if(state.busy && name!=='close-modal')return;
  switch(name) {
    case 'home':navigate('home');render();break;
    case 'rounds':navigate('rounds');render();break;
    case 'show-guide':
      if(!state.selectedRounds.length){notify('준비할 회차를 1개 이상 선택해 주세요.',true);break;}
      await run(async()=>{const data=await api('guide',{query:{rounds:state.selectedRounds.join(',')}});state.guideReturn=state.screen;state.guide=data;navigate('guide');});break;
    case 'review':if(!state.session){authDialog();break;}navigate('review');render();break;
    case 'records':if(!state.session){authDialog();break;}navigate('records');await run(refreshProgress);break;
    case 'account':authDialog();break;
    case 'report':reportDialog();break;
    case 'close-modal':modal.close();break;
    case 'signin':authDialog('signin');break;
    case 'signup':authDialog('signup');break;
    case 'reset':authDialog('reset');break;
    case 'logout':{
      const {error}=await signOut();if(error){notify(authMessage(error),true);break;}
      modal.close();Object.assign(state,{session:null,report:null,attempts:[],weaknesses:[],progressError:'',screen:'home',round:1,questions:[],results:[],sessionId:''});restoreSelection();render();break;
    }
    case 'refresh':await run(refreshProgress);break;
    case 'reload-plan':await run(async()=>{try{state.rounds=(await api('plan')).rounds;state.planError='';}catch(error){state.planError=error.message;}});break;
    case 'sync-report':await run(async()=>{await api('report',{method:'POST',body:{url:state.report.report_url}});await refreshProgress();notify('리포트를 다시 불러왔습니다.');});break;
    case 'start-exam':await startStudy('exam');break;
    case 'start-review':await startStudy('review');break;
    case 'retry-wrong':{
      const questions=retryQuestions(state.questions,state.results);
      if(!questions.length)break;
      Object.assign(state,{questions,index:0,choice:null,feedback:null,results:[],sessionId:crypto.randomUUID(),isRetry:true});
      window.scrollTo({top:0});render();break;
    }
    case 'submit':
      if(!state.choice || state.feedback)return;
      await run(async()=>{const q=state.questions[state.index];const result=await api('answer',{method:'POST',body:{questionId:q.id,concept:q.concept,selected:state.choice,sessionId:state.sessionId,round:q.preparationRound || state.round,mode:state.mode}});state.feedback=result;state.results[state.index]={...result,selected:state.choice};});break;
    case 'next':
      if(!state.feedback)return;
      state.index++;state.choice=null;state.feedback=null;
      window.scrollTo({top:0});
      if(state.index>=state.questions.length && state.session)await run(refreshProgress);else render();break;
  }
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button || button.disabled)return;
  if(button.dataset.action){action(button.dataset.action).catch(error=>notify(error.message,true));return;}
  if(button.dataset.round){
    const round=Number(button.dataset.round);
    state.selectedRounds=state.selectedRounds.includes(round)?state.selectedRounds.filter(r=>r!==round):[...state.selectedRounds,round].sort((a,b)=>a-b);
    state.round=state.selectedRounds.length?Math.max(...state.selectedRounds):1;
    saveRoundSelection(selectionStorage(),state.session?.user.id,state.selectedRounds);
    render();return;
  }
  if(button.dataset.choice && !state.feedback){state.choice=button.dataset.choice;render();}
});
document.addEventListener('change',event=>{
  if(event.target.id==='question-source')state.source=event.target.value;
  if(event.target.id==='question-count')state.count=Number(event.target.value);
});
window.addEventListener('popstate',event=>{
  const next=event.state?.chemScreen || 'home';
  state.screen=['home','rounds','guide','review','practice','records'].includes(next)?next:'home';
  if(!state.session && ['review','records'].includes(state.screen))state.screen='home';
  if(modal.open)modal.close();
  render();
});
document.addEventListener('submit',async event=>{
  if(!['auth-form','report-form'].includes(event.target.id))return;
  event.preventDefault();
  const form=event.target;
  const values=new FormData(form);
  const button=form.querySelector('button[type=submit]');
  const message=form.querySelector('.form-message');
  button.disabled=true;message.classList.remove('error');
  message.textContent='처리하고 있습니다.';
  try {
    if(form.id==='report-form') {
      message.textContent='리포트를 불러오고 있습니다.';
      await api('report',{method:'POST',body:{url:values.get('url')}});
      await refreshProgress();modal.close();render();notify('리포트가 연결되었습니다.');
    } else {
      const mode=state.authMode;
      const email=String(values.get('email') || '').trim();
      const password=String(values.get('password') || '');
      const result=mode==='signup'?await signUp(email,password):mode==='reset'?await resetPassword(email):mode==='recovery'?await updatePassword(password):await signIn(email,password);
      if(result.error)throw new Error(authMessage(result.error));
      if(mode==='signup'&&!result.data.session)message.textContent='인증 메일을 보냈습니다. 이메일의 링크를 누른 뒤 로그인해 주세요.';
      else if(mode==='reset')message.textContent='재설정 메일을 요청했습니다. 가입한 이메일의 받은편지함과 스팸함을 확인해 주세요.';
      else {modal.close();notify(mode==='recovery'?'비밀번호를 변경했습니다.':'로그인되었습니다.');}
    }
  } catch(error){message.textContent=error.message;message.classList.add('error');}
  finally{if(button.isConnected)button.disabled=false;}
});
async function boot() {
  const results=await Promise.allSettled([
    api('plan'),
    setupAuth(async(event,session)=>{
      if(event==='PASSWORD_RECOVERY'){state.session=session;state.configured=true;authDialog('recovery');return;}
      const changed=state.session?.user.id!==session?.user.id;
      state.session=session;
      if(!state.booted)return;
      if(changed){state.report=null;state.attempts=[];state.weaknesses=[];state.progressError='';state.screen='home';state.sessionId='';state.questions=[];state.results=[];state.feedback=null;state.round=1;restoreSelection();await refreshProgress();}
      render();
    })
  ]);
  if(results[0].status==='fulfilled')state.rounds=results[0].value.rounds;else state.planError=results[0].reason.message;
  if(results[1].status==='fulfilled'){state.configured=results[1].value.configured;state.session=results[1].value.session;}else notify(results[1].reason.message,true);
  restoreSelection();await refreshProgress();state.booted=true;history.replaceState({chemScreen:'home'},'',location.pathname);render();
}
boot().catch(error=>{main.innerHTML=`<div class="error-box" role="alert">${escape(error.message)}<p>브라우저를 새로고침해 주세요.</p></div>`;});
