import { supabase } from './_lib/supabase.js';
import { requirePersona, notFoundForOtherPersona, forbiddenForOtherPersona } from './_lib/guard.js';

const SORTABLE = ['due_date', 'priority', 'created_at', 'title'];

export default async function handler(req, res) {
  const persona = requirePersona(req, res);
  if (!persona) return;

  if (req.method === 'GET') {
    const { id, plan_id, status, tag, q, sort, order } = req.query;

    if (id) {
      const { data, error } = await supabase.from('todos').select('*').eq('id', id).single();
      if (error || !data) return notFoundForOtherPersona(res);
      if (data.persona !== persona) return notFoundForOtherPersona(res);
      return res.status(200).json(data);
    }

    let query = supabase.from('todos').select('*').eq('persona', persona).is('deleted_at', null);
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

    const { data: plan, error: planErr } = await supabase.from('plans').select('persona').eq('id', plan_id).single();
    if (planErr || !plan) return res.status(400).json({ error: '존재하지 않는 plan_id입니다.' });
    if (plan.persona !== persona) return forbiddenForOtherPersona(res);

    const { data, error } = await supabase.from('todos').insert({
      plan_id, persona, title, due_date, priority, tags: tags || [], expected_minutes,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 쿼리 파라미터가 필요합니다.' });
    const { data: existing, error: findErr } = await supabase.from('todos').select('*').eq('id', id).single();
    if (findErr || !existing) return notFoundForOtherPersona(res);
    if (existing.persona !== persona) return forbiddenForOtherPersona(res);

    const patch = { ...req.body, updated_at: new Date().toISOString() };
    delete patch.id; delete patch.persona; delete patch.plan_id; delete patch.created_at;
    const { data, error } = await supabase.from('todos').update(patch).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 쿼리 파라미터가 필요합니다.' });
    const { data: existing, error: findErr } = await supabase.from('todos').select('persona').eq('id', id).single();
    if (findErr || !existing) return notFoundForOtherPersona(res);
    if (existing.persona !== persona) return forbiddenForOtherPersona(res);
    const { error } = await supabase.from('todos').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
