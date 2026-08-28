import { supabase } from './_lib/supabase.js';
import { requirePersona, forbiddenForOtherPersona } from './_lib/guard.js';

// KST(Asia/Seoul) 기준 오늘 날짜(YYYY-MM-DD)
function todayKST() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

async function computeAggregate(planId, persona, reviewDate) {
  const { data: todos, error } = await supabase
    .from('todos').select('*').eq('plan_id', planId).eq('persona', persona).is('deleted_at', null);
  if (error) throw new Error(error.message);

  const planCount = todos.length;                                  // C28
  const doneCount = todos.filter(t => t.status === 'done').length;  // C29
  const delayedCount = todos.filter(t =>
    t.status !== 'done' && t.due_date && t.due_date < reviewDate
  ).length;                                                          // C30

  const todoIds = todos.map(t => t.id);
  let blockedCount = 0, expectedSum = 0, actualSum = 0;
  if (todoIds.length) {
    const { data: doLogs, error: doErr } = await supabase
      .from('do_logs').select('*').eq('persona', persona).in('todo_id', todoIds);
    if (doErr) throw new Error(doErr.message);

    const blockedTodoIds = new Set(
      doLogs.filter(d => d.blocked_reason && d.blocked_reason.trim() !== '').map(d => d.todo_id)
    );
    blockedCount = blockedTodoIds.size; // C31

    expectedSum = todos.reduce((s, t) => s + (Number(t.expected_minutes) || 0), 0); // C32
    actualSum = doLogs.reduce((s, d) => s + (Number(d.actual_minutes) || 0), 0);    // C32
  }

  return {
    plan_id: planId,
    review_date: reviewDate,
    plan_count: planCount,
    done_count: doneCount,
    delayed_count: delayedCount,
    blocked_count: blockedCount,
    expected_minutes_sum: expectedSum,
    actual_minutes_sum: actualSum,
    diff_minutes: actualSum - expectedSum,
  };
}

export default async function handler(req, res) {
  const persona = requirePersona(req, res);
  if (!persona) return;

  if (req.method === 'GET') {
    const { plan_id, review_date } = req.query;
    if (!plan_id) return res.status(400).json({ error: 'plan_id 쿼리 파라미터가 필요합니다.' });

    const { data: plan, error: planErr } = await supabase.from('plans').select('persona').eq('id', plan_id).single();
    if (planErr || !plan) return res.status(404).json({ error: 'not found' });
    if (plan.persona !== persona) return res.status(404).json({ error: 'not found' });

    try {
      const aggregate = await computeAggregate(plan_id, persona, review_date || todayKST());
      return res.status(200).json(aggregate);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { plan_id, period_start, period_end, next_plan_note, review_date } = req.body || {};
    if (!plan_id || !period_start || !period_end) {
      return res.status(400).json({ error: 'plan_id, period_start, period_end는 필수입니다.' });
    }
    const { data: plan, error: planErr } = await supabase.from('plans').select('persona').eq('id', plan_id).single();
    if (planErr || !plan) return res.status(404).json({ error: 'not found' });
    if (plan.persona !== persona) return forbiddenForOtherPersona(res);

    let aggregate;
    try {
      aggregate = await computeAggregate(plan_id, persona, review_date || todayKST());
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }

    const { data, error } = await supabase.from('see_snapshots').insert({
      persona, period_start, period_end, aggregate, next_plan_note: next_plan_note || null,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  return res.status(405).json({ error: 'method not allowed' });
}
