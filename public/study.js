const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=items=>`<ul>${items.map(item=>`<li>${escape(item)}</li>`).join('')}</ul>`;
const steps=items=>`<ol>${items.map(item=>`<li>${escape(item)}</li>`).join('')}</ol>`;
function formulas(items) {
  return items.length?items.map(f=>`<div class="formula"><p class="formula-expression">${escape(f.expression)}</p><p>${escape(f.symbols)}</p><p class="formula-condition"><strong>적용 조건</strong> ${escape(f.conditions)}</p></div>`).join(''):'<p>이 주제는 공식을 대입하기보다 아래 원리와 판단 순서를 기억해 주세요.</p>';
}
function example(item) {
  return `<aside class="study-example"><h4>별도 학습 예시</h4><p>${escape(item.prompt)}</p>${steps(item.steps)}<p><strong>${escape(item.answer)}</strong></p></aside>`;
}
function sourceLinks(topic) {
  return `<div class="study-sources">${topic.sources.map((s,i)=>`<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">관련 개념 강의 ${i+1}</a> <a href="${escape(s.referenceUrl)}" target="_blank" rel="noopener noreferrer">원문 자료</a>`).join(' · ')}</div>`;
}

export function renderStudyGuide(guide) {
  return guide.rounds.map(round=>`<section class="guide-round"><div class="section-title"><h2>${round.number}회차 · ${escape(round.title)}</h2><span class="tag soft-tag">${round.conceptCount}개 개념</span></div>${round.topics.map((topic,i)=>`<details class="study-topic"${i===0?' open':''}><summary>${escape(topic.title)}</summary><div class="study-body"><h3>이 회차에서 확인할 개념</h3><p class="topic-concepts">${topic.concepts.map(c=>escape(c.name)).join(' · ')}</p><h3>핵심 개념</h3>${list(topic.rules)}<h3>외워 둘 공식과 적용 조건</h3>${formulas(topic.formulas)}<h3>풀이 순서</h3>${steps(topic.method)}${example(topic.example)}<h3>자주 헷갈리는 점</h3>${list(topic.pitfalls)}${sourceLinks(topic)}</div></details>`).join('')}${round.unlinked?.length?`<div class="error-box">새로 추가된 개념으로 정리 안내가 아직 없습니다: ${round.unlinked.map(c=>escape(c.name)).join(' · ')}</div>`:''}</section>`).join('');
}

export function renderTeaching(teaching,explanation='') {
  const topic=teaching?.topic;
  const calculation=teaching?.kind==='calculation';
  const original=teaching?.explanation || explanation;
  return `<div class="teaching"><h4>${calculation?'이 문제의 계산과 해설':'정답의 근거'}</h4><p class="original-explanation">${escape(original || '이 문항에는 원문 해설이 없습니다. 아래 관련 개념과 원문 자료를 확인해 주세요.')}</p>${teaching?.mistake?`<div class="mistake-reason"><h4>선택한 답의 오류</h4><p>${escape(teaching.mistake)}</p></div>`:''}${topic?`<details class="teaching-support"><summary>${calculation?'계산 방법과 관련 공식':'관련 개념 더 살펴보기'} · ${escape(topic.title)}</summary><div class="study-body">${list(topic.rules)}${topic.formulas.length?`<h4>관련 공식과 조건</h4>${formulas(topic.formulas)}`:''}<h4>풀이를 시작하는 순서</h4>${steps(topic.method)}${example(topic.example)}<h4>주의할 점</h4>${list(topic.pitfalls)}${sourceLinks(topic)}</div></details>`:''}</div>`;
}

export function wrongAnswers(questions,results) {
  return results.flatMap((result,index)=>result && !result.correct && questions[index] ? [{question:questions[index],result,number:index+1}] : []);
}
export function reviewAnswers(questions,results,stars=new Set()) {
  return results.flatMap((result,index)=>result && questions[index] && (!result.correct || stars.has(questions[index].id)) ? [{question:questions[index],result,number:index+1}] : []);
}
export function retryQuestions(questions,results,stars=new Set()) {
  return reviewAnswers(questions,results,stars).map(item=>item.question);
}
export function starButton(id,marked) {
  return `<button type="button" class="star-button" data-star-id="${escape(id)}" aria-label="${marked?'별표 해제':'별표 표시'}" aria-pressed="${marked}"><svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><path d="M12 2.5 15 8.6 21.7 9.6 16.9 14.3 18 21 12 17.8 6 21 7.1 14.3 2.3 9.6 9 8.6Z"/></svg><span>별표</span></button>`;
}
export function renderWrongAnswers(questions,results,stars=new Set()) {
  return reviewAnswers(questions,results,stars).map(({question:q,result:r,number})=>`<article class="wrong-card"><div class="question-heading"><div class="question-labels"><span class="tag">${number}번 ${r.correct?'정답 · 별표':stars.has(q.id)?'오답 · 별표':'오답'}</span><span class="tag soft-tag">${escape(q.concept)}</span></div>${starButton(q.id,stars.has(q.id))}</div><p class="wrong-stem">${escape(q.stem)}</p><ul class="wrong-choices">${q.choices.map((choice,i)=>{const value=q.kind==='ox'?choice:String(i+1);return `<li class="${value===r.answer?'is-correct':value===r.selected?'is-selected':''}"><span>${q.kind==='ox'?'':`${i+1}. `}${escape(choice)}</span>${value===r.selected?'<strong>내 답</strong>':''}${value===r.answer?'<strong>정답</strong>':''}</li>`;}).join('')}</ul><p class="answer-comparison">내 답 <strong>${escape(r.selected ?? '기록 없음')}</strong> · 정답 <strong>${escape(r.answer)}</strong></p>${renderTeaching(r.teaching,r.explanation)}<div class="source"><a href="${escape(q.sourceUrl || '#')}" target="_blank" rel="noopener noreferrer">문제 원문 · ${escape(q.sourceId || q.id)}</a></div></article>`).join('');
}
