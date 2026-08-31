import { supabase } from './_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { id } = req.query;
    if (id) {
      const { data, error } = await supabase.from('plans').select('*').eq('id', id).single();
      if (error || !data) return res.status(404).json({ error: 'not found' });
      return res.status(200).json(data);
    }
    const { data, error } = await supabase.from('plans').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { title, period_start, period_end, success_criteria, priority, expected_hours } = req.body || {};
    if (!title || !period_start || !period_end) {
      return res.status(400).json({ error: 'title, period_start, period_end는 필수입니다.' });
    }
    const { data, error } = await supabase.from('plans').insert({
      title, period_start, period_end, success_criteria, priority, expected_hours,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 쿼리 파라미터가 필요합니다.' });

    const { data: existing, error: findErr } = await supabase.from('plans').select('*').eq('id', id).single();
    if (findErr || !existing) return res.status(404).json({ error: 'not found' });

    // 고치기 "전" 값을 이력에 스냅샷으로 남긴다 (C08)
    const { count } = await supabase.from('plan_history').select('*', { count: 'exact', head: true }).eq('plan_id', id);
    await supabase.from('plan_history').insert({ plan_id: id, version: (count || 0) + 1, snapshot: existing });

    const patch = { ...req.body, updated_at: new Date().toISOString() };
    delete patch.id; delete patch.created_at;
    const { data, error } = await supabase.from('plans').update(patch).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 쿼리 파라미터가 필요합니다.' });
    const { error } = await supabase.from('plans').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
