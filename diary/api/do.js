import { supabase } from './_lib/supabase.js';
import { requirePersona, forbiddenForOtherPersona } from './_lib/guard.js';

export default async function handler(req, res) {
  const persona = requirePersona(req, res);
  if (!persona) return;

  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { todo_id, started_at, ended_at, actual_minutes, blocked_reason, idempotency_key } = req.body || {};
  if (!todo_id || !started_at || !ended_at || actual_minutes == null || !idempotency_key) {
    return res.status(400).json({ error: 'todo_id, started_at, ended_at, actual_minutes, idempotency_key는 필수입니다.' });
  }

  const { data: todo, error: todoErr } = await supabase.from('todos').select('*').eq('id', todo_id).single();
  if (todoErr || !todo) return res.status(400).json({ error: '존재하지 않는 todo_id입니다.' });
  if (todo.persona !== persona) return forbiddenForOtherPersona(res);

  // 먼저 같은 idempotency_key가 이미 있는지 확인 (재시도된 같은 요청)
  const { data: already } = await supabase.from('do_logs').select('*').eq('idempotency_key', idempotency_key).maybeSingle();
  if (already) {
    // 이미 처리된 요청 → 새로 만들지도, 카운트를 다시 올리지도 않고 기존 결과만 반환 (C21, C22)
    return res.status(200).json({ do_log: already, duplicate: true });
  }

  const { data: doLog, error: insertErr } = await supabase.from('do_logs').insert({
    todo_id, persona, started_at, ended_at, actual_minutes, blocked_reason: blocked_reason || null, idempotency_key,
  }).select().single();

  if (insertErr) {
    // 동시에 같은 요청 두 개가 레이스로 들어온 경우 unique violation 발생 가능 → 그때도 기존 것 반환
    if (insertErr.code === '23505') {
      const { data: raced } = await supabase.from('do_logs').select('*').eq('idempotency_key', idempotency_key).single();
      return res.status(200).json({ do_log: raced, duplicate: true });
    }
    return res.status(500).json({ error: insertErr.message });
  }

  // Do 기록 저장은 Plan 원본 값을 덮어쓰지 않음 (C27) — todos 테이블은 status만 갱신
  await supabase.from('todos').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', todo_id);

  return res.status(201).json({ do_log: doLog, duplicate: false });
}
