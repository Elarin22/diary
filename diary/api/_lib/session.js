import crypto from 'crypto';

const COOKIE_NAME = 'plando_session';
const SECRET = process.env.SESSION_SECRET;

function sign(value) {
  const h = crypto.createHmac('sha256', SECRET).update(value).digest('hex');
  return `${value}.${h}`;
}

function verify(signed) {
  if (!signed) return null;
  const idx = signed.lastIndexOf('.');
  if (idx < 0) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac('sha256', SECRET).update(value).digest('hex');
  // 타이밍 공격 방지 비교
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header.split(';').filter(Boolean).map(p => {
      const [k, ...v] = p.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    })
  );
}

// 요청에서 현재 세션의 persona('A'|'B')를 읽음. 없으면 null.
// 클라이언트가 헤더/쿼리/바디로 persona를 보내도 절대 신뢰하지 않고,
// 오직 서버가 서명한 쿠키만 신뢰합니다 (C74~C77 대응).
export function getPersonaFromRequest(req) {
  const cookies = parseCookies(req);
  const raw = cookies[COOKIE_NAME];
  const value = verify(raw);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed.persona === 'A' || parsed.persona === 'B') return parsed.persona;
  } catch (_) {}
  return null;
}

// 새 임시 검토 세션을 만들고 Set-Cookie 헤더 값을 반환.
// A 또는 B를 고르는 순간, 그 브라우저 세션은 끝까지 그 persona로 고정됩니다.
export function makeSessionCookie(persona) {
  const value = JSON.stringify({ persona, sid: crypto.randomUUID(), ts: Date.now() });
  const signed = sign(value);
  const maxAge = 60 * 60 * 2; // 2시간짜리 임시 검토 세션
  return `${COOKIE_NAME}=${encodeURIComponent(signed)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}
