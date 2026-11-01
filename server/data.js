import { AppError, canonical, normalizeDt, normalizeExam, extractWeaknesses, parseReportLink } from './core.js';

const DT = 'https://raw.githubusercontent.com/Chemistreal/DT/main/';
const EXAM = 'https://raw.githubusercontent.com/Chemistreal/exam/main/';
const DEFAULT_REPORT = 'https://script.google.com/macros/s/AKfycbzvFaPXgEgCBQ8HowtP8tPTtdiIVFtmZSUf0KFXUOVOh3ektrFMkz4KSR4I52LDBzB8rw/exec';
const cache = new Map();

export async function readJson(url, fetcher = fetch, cacheable = true) {
  const now = Date.now();
  if (cacheable && fetcher === fetch && cache.get(url)?.expires > now) return cache.get(url).value;
  let response;
  try { response = await fetcher(url, { signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } }); }
  catch { throw new AppError('자료 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.', 502); }
  if (!response.ok) throw new AppError('자료 서버가 정상 응답하지 않았습니다. 리포트 연결이라면 관리자에게 API 주소 확인을 요청해 주세요.', 502);
  const text = await response.text();
  if (text.length > 8_000_000) throw new AppError('자료 크기가 너무 큽니다.', 502);
  let data;
  try { data = JSON.parse(text); } catch { throw new AppError('자료 서버가 JSON 대신 다른 화면을 반환했습니다. 연결 주소를 확인해 주세요.', 502); }
  if (cacheable && fetcher === fetch) {
    if (cache.size > 60) cache.delete(cache.keys().next().value);
    cache.set(url, { value: data, expires: now + 300_000 });
  }
  return data;
}

export async function loadPlan(fetcher = fetch) {
  const plan = await readJson(DT + 'appdata/plan_ch1s.json', fetcher);
  if (!plan.rounds || !plan.concepts) throw new AppError('회차별 개념표를 읽지 못했습니다.', 502);
  return plan;
}

export async function loadDt(round, fetcher = fetch) {
  return normalizeDt(await readJson(`${DT}appdata/round_ch1s_${String(round).padStart(2,'0')}.json`, fetcher), round);
}

export async function loadStudyBank(round, source = 'dt', weaknesses = [], fetcher = fetch) {
  if (source === 'dt') {
    const questions = await loadDt(round, fetcher);
    if (!weaknesses.length) return questions;
    const plan = await loadPlan(fetcher);
    const extraRounds = new Set();
    for (const weak of weaknesses) {
      const entry = Object.values(plan.concepts).find(c => canonical(c.m) === canonical(weak.name));
      if (entry?.r && entry.r !== round) extraRounds.add(entry.r);
    }
    const additional = await Promise.all([...extraRounds].slice(0,4).map(r => loadDt(r, fetcher)));
    return [...new Map([...questions, ...additional.flat()].map(q => [q.id,q])).values()];
  }
  if (source !== 'exam') throw new AppError('지원하지 않는 문제 자료입니다.');
  const [plan, index] = await Promise.all([loadPlan(fetcher), readJson(EXAM + 'donghyung/index.json', fetcher)]);
  const concepts = weaknesses.length ? weaknesses.map(w => canonical(w.name)) : Object.values(plan.concepts).filter(c => c.r <= round).map(c => canonical(c.m));
  const wanted = new Set(concepts);
  const matchingEntries = Object.entries(index.concept || {}).filter(([name,refs]) => wanted.has(canonical(name)) && Array.isArray(refs));
  const refs = [...new Set(matchingEntries.flatMap(([,v]) => v))];
  const examIds = [...new Set(refs.map(r => r.split(':')[0]).filter(id => /^[a-zA-Z0-9_-]{1,90}$/.test(id)))].slice(0,4);
  const wantedRefs = new Set(refs);
  const banks = await Promise.all(examIds.map(async id => normalizeExam(await readJson(`${EXAM}donghyung/${id}.json`, fetcher))));
  return banks.flat().filter(q => wantedRefs.has(q.id.slice(5))).map(q => {
    const matchingConcepts=matchingEntries.filter(([,refs])=>refs.includes(q.id.slice(5))).map(([name])=>name);
    return {...q,originalConcept:q.concept,concept:matchingConcepts[0] || q.concept,matchingConcepts};
  });
}

export async function loadQuestion(id, fetcher = fetch) {
  const parts = String(id).split(':');
  if (parts.length !== 3) throw new AppError('문제 번호가 올바르지 않습니다.');
  if (parts[0] === 'dt' && /^([1-9]|10)$/.test(parts[1]) && /^\d{1,2}-\d{1,3}$/.test(parts[2])) {
    const question = (await loadDt(Number(parts[1]), fetcher)).find(q => q.id === id);
    if (question) return question;
  }
  if (parts[0] === 'exam' && /^[a-zA-Z0-9_-]{1,90}$/.test(parts[1]) && /^\d{1,3}$/.test(parts[2])) {
    const [data,index]=await Promise.all([readJson(`${EXAM}donghyung/${parts[1]}.json`, fetcher),readJson(EXAM+'donghyung/index.json',fetcher)]);
    const question = normalizeExam(data).find(q => q.id === id);
    if (question) return {...question,matchingConcepts:Object.entries(index.concept || {}).filter(([,refs])=>Array.isArray(refs)&&refs.includes(id.slice(5))).map(([name])=>name)};
  }
  throw new AppError('원본 자료에서 해당 문제를 찾지 못했습니다.', 404);
}

export async function loadReport(input, env, fetcher = fetch) {
  const parsed = parseReportLink(input);
  let endpoint;
  try { endpoint = new URL(env.REPORT_API_URL || DEFAULT_REPORT); } catch { throw new AppError('서버의 리포트 API 주소가 올바르지 않습니다.', 503); }
  if (endpoint.protocol !== 'https:') throw new AppError('리포트 API는 HTTPS 주소여야 합니다.', 503);
  endpoint.searchParams.set('student', parsed.student);
  if (parsed.course) endpoint.searchParams.set('c', parsed.course);
  const payload = await readJson(endpoint.href, fetcher, false);
  const courses = [...new Set((payload.rows || []).map(r => r.course).filter(Boolean))];
  const course = parsed.course || (courses.includes('ch1s') ? 'ch1s' : courses.includes('ch1') ? 'ch1' : courses[0] || 'ch1s');
  const weaknesses = extractWeaknesses(payload, course);
  return { report_url: parsed.url, snapshot: { weaknesses, sourceCourse: course, rows: payload.rows.filter(r => r.course === course).length }, synced_at: new Date().toISOString() };
}
