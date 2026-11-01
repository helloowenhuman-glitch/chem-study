let client = null;
let configuration = null;

export async function setupAuth(onChange) {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('앱 설정을 불러오지 못했습니다.');
  configuration = await response.json();
  if (!configuration.configured) return { configured:false, session:null };
  let createClient;
  try { ({ createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm')); }
  catch { throw new Error('로그인 기능을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
  client = createClient(configuration.supabaseUrl, configuration.publishableKey, {
    auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
  });
  client.auth.onAuthStateChange((event, session) => { setTimeout(() => onChange(event,session), 0); });
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error('로그인 상태를 읽지 못했습니다. 다시 로그인해 주세요.');
  return { configured:true, session:data.session };
}

export async function api(route, { method='GET', body, query={}, userId } = {}) {
  const params = new URLSearchParams(query);
  const headers = new Headers();
  if (body !== undefined) headers.set('Content-Type','application/json');
  if (client) {
    const { data, error } = await client.auth.getSession();
    if (error) throw new Error('로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.');
    if (userId && data.session?.user.id!==userId)throw new Error('계정이 변경되어 이전 계정의 저장을 중단했습니다.');
    if (data.session) headers.set('Authorization','Bearer ' + data.session.access_token);
  }
  if(userId && !headers.has('Authorization'))throw new Error('로그인 후 저장을 다시 시도해 주세요.');
  let response;
  try { response = await fetch('/api/' + route + (params.size ? '?' + params : ''), {method,headers,signal:AbortSignal.timeout(45000),...(body!==undefined?{body:JSON.stringify(body)}:{})}); }
  catch { throw new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
  let payload;
  try { payload = await response.json(); } catch { throw new Error('서버 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
  if (!response.ok) throw new Error(payload.error || '요청을 처리하지 못했습니다.');
  return payload;
}

function requireClient() {
  if (!client) throw new Error('로그인 연결 설정이 아직 준비되지 않았습니다.');
  return client;
}
export async function signIn(email,password) { return requireClient().auth.signInWithPassword({email,password}); }
export async function signUp(email,password) { return requireClient().auth.signUp({email,password,options:{emailRedirectTo:location.origin + '/'}}); }
export async function resetPassword(email) { return requireClient().auth.resetPasswordForEmail(email,{redirectTo:location.origin + '/'}); }
export async function updatePassword(password) { return requireClient().auth.updateUser({password}); }
export async function signOut() { return requireClient().auth.signOut(); }

export function authMessage(error) {
  const message = error?.message || '';
  if (/invalid login credentials/i.test(message)) return '이메일 또는 비밀번호를 확인해 주세요.';
  if (/email not confirmed/i.test(message)) return '이메일의 인증 링크를 누른 뒤 다시 로그인해 주세요.';
  if (/already registered/i.test(message)) return '이미 가입된 이메일입니다. 로그인해 주세요.';
  if (/rate limit|too many/i.test(message)) return '요청이 많습니다. 잠시 후 다시 시도해 주세요.';
  if (/password/i.test(message)) return '비밀번호 조건을 확인해 주세요. 최소 8자 이상을 입력해 주세요.';
  if (/fetch|network/i.test(message)) return '인증 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.';
  return '인증 요청을 처리하지 못했습니다. 입력 내용과 이메일 인증 여부를 확인해 주세요.';
}
