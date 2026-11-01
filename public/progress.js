export function beginProgress(state) {
  return { userId:state.session?.user.id,version:state.progressVersion=(state.progressVersion || 0)+1 };
}
export function isCurrentProgress(state,ticket) {
  return !!ticket.userId && state.session?.user.id===ticket.userId && state.progressVersion===ticket.version;
}
export function applyProgress(state,ticket,data) {
  if(!isCurrentProgress(state,ticket))return false;
  state.report=data.report;
  state.attempts=data.attempts;
  state.weaknesses=data.weaknesses;
  state.progressError='';
  if(state.screen==='home' && !state.sessionId)state.round=data.targetRound;
  return true;
}

const selectionKey=userId=>`chem-study:rounds:${userId || 'guest'}`;
export function readRoundSelection(storage,userId,fallback=1) {
  try {
    const rounds=JSON.parse(storage?.getItem(selectionKey(userId)) ?? 'null');
    if(Array.isArray(rounds) && rounds.length<=10 && rounds.every(r=>Number.isInteger(r)&&r>=1&&r<=10))return [...new Set(rounds)].sort((a,b)=>a-b);
  } catch { /* Storage may be unavailable or cleared by the browser. */ }
  return [fallback];
}
export function saveRoundSelection(storage,userId,rounds) {
  try { storage?.setItem(selectionKey(userId),JSON.stringify(rounds)); } catch { /* Learning still works without local storage. */ }
}
