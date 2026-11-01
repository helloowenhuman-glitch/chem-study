export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function canonical(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s·ㆍ・.,:;()\[\]{}\-–—_]/g, '');
}

export function parseReportLink(input) {
  let url;
  try { url = new URL(String(input).trim()); } catch { throw new AppError('올바른 리포트 주소를 입력해 주세요.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'chemistreal.github.io' || url.port || url.username || url.password || url.pathname !== '/DT/report.html') {
    throw new AppError('DT의 개인 리포트 링크를 입력해 주세요.');
  }
  const student = url.searchParams.get('student') || '';
  const course = url.searchParams.get('c') || '';
  if (!/^[a-zA-Z0-9_-]{6,128}$/.test(student)) throw new AppError('리포트 주소에 유효한 student 값이 없습니다.');
  if (course && !['ch1', 'ch1s', 'ch2', 'gc'].includes(course)) throw new AppError('지원하지 않는 리포트 과목입니다.');
  const clean = new URL('https://chemistreal.github.io/DT/report.html');
  clean.searchParams.set('student', student);
  if (course) clean.searchParams.set('c', course);
  return { student, course, url: clean.href };
}

export function normalizeDt(data, round) {
  if (!Array.isArray(data?.jeongsi?.items)) throw new AppError('DT 문제 자료의 형식이 올바르지 않습니다.', 502);
  return data.jeongsi.items.filter(q => !q.excluded && q.s && ['O', 'X'].includes(q.a)).map(q => ({
    id: `dt:${round}:${q.n}`, kind: 'ox', source: 'DT', sourceId: String(q.n), round,
    conceptId: String(q.c || ''), concept: String(q.mis || q.u || '개념 확인'),
    stem: String(q.s), choices: ['O', 'X'], answer: q.a, explanation: String(q.w || ''),
    sourceUrl: `https://github.com/Chemistreal/DT/blob/main/appdata/round_ch1s_${String(round).padStart(2, '0')}.json`
  }));
}

export function normalizeExam(data) {
  if (!data?.examId || !data.questions || typeof data.questions !== 'object') throw new AppError('exam 문제 자료의 형식이 올바르지 않습니다.', 502);
  return Object.entries(data.questions).filter(([,q]) => !q.excluded && q.stem && Array.isArray(q.choices) && q.choices.length === 4 && Number.isInteger(q.answer) && q.answer >= 1 && q.answer <= 4).map(([n,q]) => ({
    id: `exam:${data.examId}:${n}`, kind: 'choice', source: 'exam', sourceId: `${data.examId} ${n}번`, round: null,
    conceptId: '', concept: String(q.concept || q.area || '개념 확인'), stem: String(q.stem),
    choices: q.choices.map(String), answer: String(q.answer), explanation: String(q.explanation || ''),
    sourceUrl: `https://github.com/Chemistreal/exam/blob/main/donghyung/${data.examId}.json`
  }));
}

export function extractWeaknesses(payload, course = '') {
  if (!Array.isArray(payload?.rows) || payload.error) throw new AppError('리포트 데이터를 읽지 못했습니다. 리포트 링크와 서버 설정을 확인해 주세요.', 502);
  const weak = new Map();
  for (const row of payload.rows) {
    if (!row || (course && row.course !== course) || !Array.isArray(row.wrongMis)) continue;
    for (const name of new Set(row.wrongMis.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()))) {
      const key = canonical(name);
      const value = weak.get(key) || { name, count: 0, round: 0, origin: 'report' };
      value.count++;
      value.round = Math.max(value.round, Number(row.round) || 0);
      weak.set(key, value);
    }
  }
  return [...weak.values()].sort((a,b) => b.count - a.count || b.round - a.round);
}

export function mergeWeaknesses(imported = [], attempts = []) {
  const map = new Map(imported.map(w => [canonical(w.name), { ...w }]));
  // The latest answer adjusts the review queue; it is not a mastery diagnosis.
  for (const row of [...attempts].sort((a,b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    const key = canonical(row.concept);
    if (!key) continue;
    if (row.correct) map.delete(key);
    else map.set(key, { name: row.concept, count: (map.get(key)?.count || 0) + 1, round: row.round || 0, origin: 'app' });
  }
  return [...map.values()].sort((a,b) => b.count - a.count);
}

export function selectReview(questions, weaknesses, count = 10) {
  const names = new Set(weaknesses.map(w => canonical(w.name)));
  const ids = new Set(weaknesses.map(w => w.conceptId).filter(Boolean));
  return questions.filter(q => names.has(canonical(q.concept)) || ids.has(q.conceptId)).slice(0, count);
}

export function grade(question, selected) {
  const answer = String(selected);
  const isOx = question.kind === 'ox' || question.choices?.join('|') === 'O|X';
  const valid = isOx ? ['O','X'] : question.choices.map((_,i) => String(i+1));
  if (!valid.includes(answer)) throw new AppError('선택한 답이 올바르지 않습니다.');
  return { correct: answer === String(question.answer), answer: String(question.answer), explanation: question.explanation || '' };
}

export function publicQuestion(q) {
  const { answer, explanation, ...visible } = q;
  return visible;
}

export function checkedRound(value) {
  const round = Number(value);
  if (!Number.isInteger(round) || round < 1 || round > 10) throw new AppError('1회차부터 10회차 중에서 선택해 주세요.');
  return round;
}
