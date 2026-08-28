import { supabase } from './_lib/supabase.js';
import { requirePersona, notFoundForOtherPersona, forbiddenForOtherPersona } from './_lib/guard.js';

export default async function handler(req, res) {
  const persona = requirePersona(req, res);
  if (!persona) return;

  if (req.method === 'GET') {
    const { id } = req.query;
    if (id) {
      const { data, error } = await supabase.from('plans').select('*').eq('id', id).single();
      if (error || !data) return notFoundForOtherPersona(res);
      if (data.persona !== persona) return notFoundForOtherPersona(res); // 다른 persona 것이면 존재 자체를 숨김
      return res.status(200).json(data);
    }
    const { data, error } = await supabase.from('plans').select('*').eq('persona', persona).order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { title, period_start, period_end, success_criteria, priority, expected_hours } = req.body || {};
    if (!title || !period_start || !period_end) {
      return res.status(400).json({ error: 'title, period_start, period_end는 필수입니다.' });
    }
    const { data, error } = await supabase.from('plans').insert({
      persona, title, period_start, period_end, success_criteria, priority, expected_hours,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 쿼리 파라미터가 필요합니다.' });

    const { data: existing, error: findErr } = await supabase.from('plans').select('*').eq('id', id).single();
    if (findErr || !existing) return notFoundForOtherPersona(res);
    if (existing.persona !== persona) return forbiddenForOtherPersona(res);

    // 수정 "전" 값을 이력 테이블에 스냅샷으로 남긴다 (C08)
    const { count } = await supabase.from('plan_history').select('*', { count: 'exact', head: true }).eq('plan_id', id);
    await supabase.from('plan_history').insert({
      plan_id: id, persona, version: (count || 0) + 1, snapshot: existing,
    });

    const patch = { ...req.body, updated_at: new Date().toISOString() };
    delete patch.id; delete patch.persona; delete patch.created_at;
    const { data, error } = await supabase.from('plans').update(patch).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 쿼리 파라미터가 필요합니다.' });
    const { data: existing, error: findErr } = await supabase.from('plans').select('persona').eq('id', id).single();
    if (findErr || !existing) return notFoundForOtherPersona(res);
    if (existing.persona !== persona) return forbiddenForOtherPersona(res);
    const { error } = await supabase.from('plans').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
