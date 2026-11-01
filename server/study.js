import { canonical } from './core.js';
import { studyTopics } from './study-content.js';

const numberOf=id=>Number(/^CH1S-(\d+)$/.exec(String(id))?.[1]);
const topicFor=id=>studyTopics.find(t=>numberOf(id)>=t.range[0] && numberOf(id)<=t.range[1]);

export function buildStudyGuide(plan,rounds) {
  return {rounds:rounds.map(number=>{
    const concepts=Object.entries(plan.concepts || {}).filter(([,c])=>Number(c.r)===number).map(([id,c])=>({id,name:c.m,unit:plan.units?.[c.u] || c.u}));
    const topics=studyTopics.filter(t=>t.round===number).map(t=>({...t,concepts:concepts.filter(c=>topicFor(c.id)?.id===t.id)}));
    const unlinked=concepts.filter(c=>!topicFor(c.id));
    return {number,title:plan.rounds?.[number]?.title || `선수노트 ${number}회차`,conceptCount:concepts.length,topics,unlinked};
  }),sourceUrl:'https://github.com/Chemistreal/DT/blob/main/appdata/plan_ch1s.json'};
}

export function buildTeaching(question,selected,recordConcept,plan={}) {
  const entries=Object.entries(plan.concepts || {});
  const conceptId=question.conceptId || entries.find(([,c])=>canonical(c.m)===canonical(recordConcept))?.[0];
  const topic=topicFor(conceptId) || null;
  const text=`${question.stem || ''} ${question.learningPoint || ''}`;
  const calculation=/계산|얼마|몇\s*(?:개|배|몰|mol|g|L|J|일|초|분)|구하|구한|질량비|부피비/.test(text)
    || /\d[^\n。]{0,60}\s[÷×/]\s[^\n。]{0,60}\d/.test(question.explanation || '');
  const originalMistake=question.misconceptions?.[String(selected)];
  const mistake=String(selected)!==String(question.answer) && typeof originalMistake==='string' ? originalMistake : '';
  return {
    kind:calculation?'calculation':'concept',
    explanation:question.explanation || '',
    mistake,
    topic,
    concept:recordConcept,
    sourceUrl:question.sourceUrl
  };
}
