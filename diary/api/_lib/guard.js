import { getPersonaFromRequest } from './session.js';

// persona가 없으면(A/B를 아직 안 골랐으면) 401.
// 있으면 persona 문자열을 리턴 — 이후 모든 쿼리에 .eq('persona', persona) 필수로 붙여야 함.
export function requirePersona(req, res) {
  const persona = getPersonaFromRequest(req);
  if (!persona) {
    res.status(401).json({ error: '검토 세션이 없습니다. 먼저 A 또는 B를 선택하세요.' });
    return null;
  }
  return persona;
}

// 다른 persona의 자료를 "읽으려" 하면 존재를 숨기고 404.
export function notFoundForOtherPersona(res) {
  res.status(404).json({ error: 'not found' });
}

// 다른 persona의 자료를 "고치거나 지우려" 하면 403.
export function forbiddenForOtherPersona(res) {
  res.status(403).json({ error: 'forbidden' });
}
