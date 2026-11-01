const key=userId=>`chem-study:local:${userId || 'guest'}`;
export function readLocalStudy(storage,userId) {
  try {
    const data=JSON.parse(storage?.getItem(key(userId)) || 'null');
    if(Array.isArray(data?.bookmarks) && Array.isArray(data?.outbox))return data;
  } catch { /* A cleared or damaged store starts empty. */ }
  return {bookmarks:[],outbox:[]};
}
export function writeLocalStudy(storage,userId,data) {
  if(!storage)throw Error('이 기기의 임시 저장 공간을 사용할 수 없습니다.');
  storage.setItem(key(userId),JSON.stringify(data));
}
export function putJob(local,job) {
  return {...local,outbox:[...local.outbox.filter(old=>old.id!==job.id),job]};
}
export function acknowledgeJob(local,job) {
  return {...local,outbox:local.outbox.filter(old=>old.id!==job.id || old.version!==job.version)};
}
export function createSyncGate() {
  const running=new Map();
  return (owner,operation)=>{
    if(running.has(owner))return running.get(owner);
    const work=Promise.resolve().then(operation).finally(()=>running.delete(owner));
    running.set(owner,work);return work;
  };
}
export async function drainOutbox({getJobs,isCurrent,send,ack,onError}) {
  const attempted=new Set();let blockedAnswers=false,wroteAnswers=false;
  while(isCurrent()) {
    const job=getJobs().find(job=>!attempted.has(job.version) && !(blockedAnswers && job.route==='answer'));
    if(!job)break;
    attempted.add(job.version);
    try {
      const reply=await send(job);
      if(!isCurrent())break;
      ack(job,reply);if(job.route==='answer')wroteAnswers=true;
    } catch(error){
      if(job.route==='answer')blockedAnswers=true;
      if(isCurrent())onError(error);
    }
  }
  return {attempted,wroteAnswers,blockedAnswers};
}
export function mergeBookmarks(local,remote) {
  const items=new Map(remote.map(item=>[item.question_id,item]));
  for(const job of local.outbox.filter(job=>job.route==='bookmark')) {
    const b=job.body;
    if(b.marked)items.set(b.questionId,{question_id:b.questionId,concept:b.concept,round:b.round});
    else items.delete(b.questionId);
  }
  return {...local,bookmarks:[...items.values()]};
}
export function hydrateQuestions(payload) {
  return payload.questions.map(q=>q.solution?{...q,solution:{...q.solution,teaching:{...q.solution.teaching,topic:payload.topics?.[q.solution.teaching.topicId] || null}}}:q);
}
export function instantGrade(question,selected) {
  const solution=question.solution;
  if(!solution)throw Error('정답 정보를 다시 불러와 주세요.');
  const choices=question.kind==='ox'?['O','X']:question.choices.map((_,i)=>String(i+1));
  if(!choices.includes(String(selected)))throw Error('선택한 답이 올바르지 않습니다.');
  const correct=String(selected)===String(solution.answer);
  return {correct,answer:solution.answer,explanation:solution.explanation,teaching:{...solution.teaching,mistake:correct?'':solution.mistakes?.[selected] || ''},selected:String(selected),saved:false};
}
