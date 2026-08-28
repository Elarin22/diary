import { getPersonaFromRequest, makeSessionCookie, clearSessionCookie } from './_lib/session.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const persona = getPersonaFromRequest(req);
    return res.status(200).json({ persona });
  }

  if (req.method === 'POST') {
    const { persona } = req.body || {};
    if (persona !== 'A' && persona !== 'B') {
      return res.status(400).json({ error: 'persona는 A 또는 B만 가능합니다.' });
    }
    res.setHeader('Set-Cookie', makeSessionCookie(persona));
    return res.status(200).json({ persona });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
