import { AppError, canonical, checkedRound, grade, publicQuestion, mergeWeaknesses, selectReview } from './core.js';
import { loadPlan, loadStudyBank, loadQuestion, loadReport } from './data.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff' } });
const configOf = env => ({ url: String(env.SUPABASE_URL || '').trim().replace(/\/+$/,''), key: String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '').trim() });
function requireConfig(env) {
  const cfg = configOf(env);
  if (!cfg.url || !cfg.key) throw new AppError('Supabase 연결 설정이 아직 준비되지 않았습니다.', 503);
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(cfg.url)) throw new AppError('Supabase 프로젝트 주소 설정을 확인해 주세요.', 503);
  return { ...cfg, url: cfg.url.replace(/\/$/,'') };
}
async function authenticate(request, env, fetcher) {
  const token = request.headers.get('Authorization') || '';
  if (!/^Bearer [^\s]+$/.test(token)) throw new AppError('로그인 후 이용해 주세요.', 401);
  const cfg = requireConfig(env);
  let response;
  try { response = await fetcher(cfg.url + '/auth/v1/user', { headers:{apikey:cfg.key,Authorization:token}, signal:AbortSignal.timeout(10000) }); }
  catch { throw new AppError('로그인 상태를 확인하지 못했습니다. 다시 시도해 주세요.', 502); }
  if (!response.ok) throw new AppError('로그인이 만료되었습니다. 다시 로그인해 주세요.', 401);
  const user = await response.json();
  if (!user.id) throw new AppError('로그인 정보를 확인하지 못했습니다.', 401);
  return { ...cfg, token, user };
}
async function db(auth, path, method = 'GET', body, fetcher = fetch, prefer = '') {
  let response;
  try {
    response = await fetcher(auth.url + '/rest/v1/' + path, { method, signal:AbortSignal.timeout(10000), headers:{apikey:auth.key,Authorization:auth.token,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})}, ...(body !== undefined?{body:JSON.stringify(body)}:{}) });
  } catch { throw new AppError('학습 기록 서버에 연결하지 못했습니다.', 502); }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new AppError('이 기록에 접근할 권한이 없습니다.', 403);
    throw new AppError('학습 기록을 읽거나 저장하지 못했습니다. Supabase 테이블과 접근 정책을 확인해 주세요.', 502);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
async function bodyOf(request) {
  if (Number(request.headers.get('Content-Length')) > 10000) throw new AppError('요청 내용이 너무 큽니다.', 413);
  const text = await request.text();
  if (text.length > 10000) throw new AppError('요청 내용이 너무 큽니다.', 413);
  try { return JSON.parse(text); } catch { throw new AppError('요청 내용을 읽지 못했습니다.'); }
}
async function getProgress(auth, fetcher) {
  const uid = encodeURIComponent(auth.user.id);
  const [links, attempts, profiles] = await Promise.all([
    db(auth,`report_links?user_id=eq.${uid}&select=report_url,snapshot,synced_at`, 'GET',undefined,fetcher),
    db(auth,`study_answers?user_id=eq.${uid}&select=*&order=created_at.desc&limit=1000`, 'GET',undefined,fetcher),
    db(auth,`study_profiles?user_id=eq.${uid}&select=target_round`, 'GET',undefined,fetcher)
  ]);
  const report = links?.[0] || null;
  return { report, attempts:attempts || [], targetRound:profiles?.[0]?.target_round || 1, weaknesses:mergeWeaknesses(report?.snapshot?.weaknesses || [], attempts || []) };
}

export async function handleApi(request, env = process.env, fetcher = fetch) {
  try {
    const url = new URL(request.url);
    const route = url.searchParams.get('route') || url.pathname.replace(/^\/api\/?/,'');
    const method = request.method;
    if (route === 'config' && method === 'GET') {
      const cfg = configOf(env);
      return json({supabaseUrl:cfg.url,publishableKey:cfg.key,configured:!!(cfg.url&&cfg.key)});
    }
    if (route === 'plan' && method === 'GET') {
      const plan = await loadPlan(fetcher);
      return json({rounds:Object.entries(plan.rounds).map(([number,r]) => ({number:Number(number),title:r.title,conceptCount:r.new?.length || 0})), course:plan.name});
    }
    if (route === 'progress' && method === 'GET') return json(await getProgress(await authenticate(request,env,fetcher),fetcher));
    if (route === 'target' && method === 'POST') {
      const auth = await authenticate(request,env,fetcher);
      const body = await bodyOf(request);
      await db(auth,'study_profiles?on_conflict=user_id','POST',{user_id:auth.user.id,target_round:checkedRound(body.round)},fetcher,'resolution=merge-duplicates');
      return json({saved:true});
    }
    if (route === 'report' && method === 'POST') {
      const auth = await authenticate(request,env,fetcher);
      const body = await bodyOf(request);
      const report = await loadReport(body.url,env,fetcher);
      await db(auth,'report_links?on_conflict=user_id','POST',{user_id:auth.user.id,...report},fetcher,'resolution=merge-duplicates');
      return json({report});
    }
    if (route === 'questions' && method === 'GET') {
      const round = checkedRound(url.searchParams.get('round') || 1);
      const mode = url.searchParams.get('mode') || 'exam';
      const source = url.searchParams.get('source') || 'dt';
      const count = Number(url.searchParams.get('count') || 10);
      if (!['exam','review'].includes(mode) || !['dt','exam'].includes(source) || ![5,10,20,60].includes(count)) throw new AppError('문제 선택 조건이 올바르지 않습니다.');
      let weak = [];
      if (mode === 'review') {
        const auth = await authenticate(request,env,fetcher);
        weak = (await getProgress(auth,fetcher)).weaknesses;
        if (!weak.length) return json({questions:[],total:0,message:'현재 복습할 오답 개념이 없습니다. 리포트를 연결하거나 시험 대비 문제를 풀어보세요.'});
      }
      const all = await loadStudyBank(round,source,weak,fetcher);
      const matched = mode === 'review' ? selectReview(all,weak,all.length) : all;
      // Shuffle a copy; answers and explanations remain on the server until submission.
      const shuffled = [...matched];
      for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
      return json({questions:shuffled.slice(0,count).map(publicQuestion),total:matched.length,message:matched.length?'':'이 범위와 정확히 연결되는 문제가 없습니다. 다른 문제 자료를 선택해 주세요.'});
    }
    if (route === 'answer' && method === 'POST') {
      const body = await bodyOf(request);
      const round = checkedRound(body.round);
      if (!['review','exam'].includes(body.mode)) throw new AppError('풀이 방식이 올바르지 않습니다.');
      const auth = request.headers.has('Authorization') ? await authenticate(request,env,fetcher) : null;
      const question = await loadQuestion(body.questionId,fetcher);
      const names=[question.concept,...(question.matchingConcepts || [])];
      const recordConcept=body.concept?names.find(name=>canonical(name)===canonical(body.concept)):question.concept;
      if(!recordConcept)throw new AppError('문제와 연결되지 않은 개념입니다. 문제를 다시 불러와 주세요.');
      const result = grade(question,body.selected);
      if (auth) {
        if (!/^[0-9a-f-]{36}$/i.test(body.sessionId || '')) throw new AppError('풀이 세션 정보가 올바르지 않습니다.');
        await db(auth,'study_answers?on_conflict=user_id,session_id,question_id','POST',{
          user_id:auth.user.id,session_id:body.sessionId,question_id:question.id,concept:recordConcept,
          source:question.source,round,mode:body.mode,selected_answer:String(body.selected),correct:result.correct
        },fetcher,'resolution=ignore-duplicates');
      }
      return json({...result,saved:!!auth});
    }
    return json({error:'요청한 기능을 찾지 못했습니다.'},404);
  } catch (error) {
    return json({error:error instanceof AppError?error.message:'처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'}, error instanceof AppError?error.status:500);
  }
}
