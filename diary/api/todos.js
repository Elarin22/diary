import { supabase } from './_lib/supabase.js';

const SORTABLE = ['due_date', 'priority', 'created_at', 'title'];

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { id, plan_id, status, tag, q, sort, order } = req.query;

    if (id) {
      const { data, error } = await supabase.from('todos').select('*').eq('id', id).single();
      if (error || !data) return res.status(404).json({ error: 'not found' });
      return res.status(200).json(data);
    }

    let query = supabase.from('todos').select('*').is('deleted_at', null);
    if (plan_id) query = query.eq('plan_id', plan_id);
    if (status) query = query.eq('status', status);
    if (tag) query = query.contains('tags', [tag]);
    if (q) query = query.ilike('title', `%${q}%`); // 조건 검색 (C18)

    const sortField = SORTABLE.includes(sort) ? sort : 'created_at';
    query = query.order(sortField, { ascending: order !== 'desc' });

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { plan_id, title, due_date, priority, tags, expected_minutes } = req.body || {};
    if (!plan_id || !title) return res.status(400).json({ error: 'plan_id, title은 필수입니다.' });
    const { data, error } = await supabase.from('todos').insert({
      plan_id, title, due_date, priority, tags: tags || [], expected_minutes,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 쿼리 파라미터가 필요합니다.' });
    const patch = { ...req.body, updated_at: new Date().toISOString() };
    delete patch.id; delete patch.plan_id; delete patch.created_at;
    const { data, error } = await supabase.from('todos').update(patch).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'not found' });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 쿼리 파라미터가 필요합니다.' });
    const { error } = await supabase.from('todos').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
