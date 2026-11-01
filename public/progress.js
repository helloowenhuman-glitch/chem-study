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
