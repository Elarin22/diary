import { supabase } from './_lib/supabase.js';

async function exportAll() {
  const [plans, todos, doLogs, seeSnaps] = await Promise.all([
    supabase.from('plans').select('*'),
    supabase.from('todos').select('*'),
    supabase.from('do_logs').select('*'),
    supabase.from('see_snapshots').select('*'),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 2,
    plans: plans.data || [],
    todos: todos.data || [],
    do_logs: doLogs.data || [],
    see_snapshots: seeSnaps.data || [],
  };
}

function validateShape(payload) {
  const errs = [];
  if (typeof payload !== 'object' || payload === null) { errs.push('파일 형식이 올바르지 않습니다.'); return errs; }
  for (const key of ['plans', 'todos', 'do_logs']) {
    if (!Array.isArray(payload[key])) errs.push(`${key} 배열이 없습니다.`);
  }
  return errs;
}

export default async function handler(req, res) {
  const action = req.query.action;

  if (req.method === 'GET' && action === 'export') {
    const payload = await exportAll();
    return res.status(200).json(payload);
  }

  if (req.method === 'POST' && action === 'reset') {
    await supabase.from('see_snapshots').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('plans').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'POST' && action === 'import') {
    const payload = req.body;
    const shapeErrs = validateShape(payload);
    if (shapeErrs.length) return res.status(400).json({ error: '가져오기 실패: 문법/필수값 오류', details: shapeErrs });

    const result = { plans: { added: 0, dup: 0, invalid: 0 }, todos: { added: 0, dup: 0, invalid: 0 }, do_logs: { added: 0, dup: 0, invalid: 0 } };

    const [{ data: existingPlans }, { data: existingTodos }, { data: existingDo }] = await Promise.all([
      supabase.from('plans').select('id'),
      supabase.from('todos').select('id'),
      supabase.from('do_logs').select('id'),
    ]);
    const planIds = new Set((existingPlans || []).map(r => r.id));
    const todoIds = new Set((existingTodos || []).map(r => r.id));
    const doIds = new Set((existingDo || []).map(r => r.id));

    for (const p of payload.plans) {
      if (!p.id || !p.title || !p.period_start || !p.period_end) { result.plans.invalid++; continue; }
      if (planIds.has(p.id)) { result.plans.dup++; continue; }
      const { error } = await supabase.from('plans').insert(p);
      if (error) { result.plans.invalid++; continue; }
      planIds.add(p.id); result.plans.added++;
    }
    for (const t of payload.todos) {
      if (!t.id || !t.plan_id || !t.title) { result.todos.invalid++; continue; }
      if (todoIds.has(t.id)) { result.todos.dup++; continue; }
      if (!planIds.has(t.plan_id)) { result.todos.invalid++; continue; }
      const { error } = await supabase.from('todos').insert(t);
      if (error) { result.todos.invalid++; continue; }
      todoIds.add(t.id); result.todos.added++;
    }
    for (const d of payload.do_logs) {
      if (!d.id || !d.todo_id || !d.idempotency_key) { result.do_logs.invalid++; continue; }
      if (doIds.has(d.id)) { result.do_logs.dup++; continue; }
      if (!todoIds.has(d.todo_id)) { result.do_logs.invalid++; continue; }
      const { error } = await supabase.from('do_logs').insert(d);
      if (error) { result.do_logs.invalid++; continue; }
      doIds.add(d.id); result.do_logs.added++;
    }

    return res.status(200).json({ ok: true, result });
  }

  return res.status(400).json({ error: '알 수 없는 action입니다. export | reset | import 중 하나를 지정하세요.' });
}
