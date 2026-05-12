export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: Diagnose-Endpunkt
  if (req.method === 'GET') {
    const key = process.env.ANTHROPIC_API_KEY || '';
    return res.status(200).json({
      ok: true,
      key_set: key.length > 0,
      key_starts_with: key.length > 0 ? key.slice(0, 14) : 'LEER',
      key_length: key.length,
      node: process.version
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST allowed' });

  const key = process.env.ANTHROPIC_API_KEY || '';
  if (!key || key.length < 20) {
    return res.status(500).json({ error: 'API Key fehlt oder ungültig. Vercel → Settings → Environment Variables → ANTHROPIC_API_KEY setzen → Redeploy.' });
  }

  const body = req.body || {};
  const query = body.query || '';
  const stakeOdds = body.stakeOdds || '';
  if (!query) return res.status(400).json({ error: 'Kein Query übergeben' });

  const today = new Date().toLocaleDateString('de-DE');

  const system = `Du bist ein professioneller Tennis-Wettanalyst. Antworte AUSSCHLIESSLICH mit einem JSON-Array, ohne jeden anderen Text, ohne Markdown-Backticks.

Gib genau 3 Wettempfehlungen zurück. Heutiges Datum: ${today}.

JSON-Schema (alle Felder pflicht):
[
  {
    "p1": "Spieler 1",
    "p2": "Spieler 2",
    "tournament": "Turniername",
    "surface_name": "Clay",
    "round": "QF",
    "type": "ev_positive",
    "odds": 1.85,
    "src": "Bet365",
    "fairodds": 1.65,
    "ev": 12.1,
    "conf": 72,
    "stake": "1-2 Units",
    "rec_player": "Spieler 1",
    "reco": "Spieler 1 Sieg @ 1.85 - Begründung",
    "analysis": "Analyse mit Form, Belag, H2H, Stats",
    "tags": ["Tag1", "Tag2", "Tag3"],
    "form": 82,
    "surface": 75,
    "h2h": 65,
    "fitness": 88,
    "serve": 79,
    "return": 71,
    "mental": 84,
    "shot": 73,
    "r1": [82, 75, 65, 88, 79, 71, 84, 73],
    "r2": [70, 82, 80, 74, 85, 68, 72, 78],
    "adv": {
      "fs": 68, "ts": 214, "ace": 8, "rp": 43,
      "bp": 38, "win": 32, "ue": 24, "net": 67, "d3": 61
    },
    "book": [
      {"name": "Bet365", "p1": "1.85", "p2": "2.00", "best": "1.85"},
      {"name": "Betway", "p1": "1.88", "p2": "1.95", "best": "1.88"},
      {"name": "Bwin",   "p1": "1.82", "p2": "2.05", "best": "2.05"}
    ]
  }
]

type-Werte: "ev_positive" (EV>5%), "safe" (Konfidenz>70%), "risky" (Außenseiter)
ev = (conf/100 * odds - 1) * 100
r1/r2 = Radar-Scores für p1/p2: [Form, Belag, H2H, Fitness, Aufschlag, Return, Mental, ShotSel] je 0-100`;

  const userMsg = `Tennis-Wettanalyse für: "${query}".${stakeOdds ? ` Stake.com Quoten: ${stakeOdds}.` : ''} Antworte nur mit dem JSON-Array.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        system,
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    if (!r.ok) {
      const txt = await r.text();
      let msg = `Anthropic ${r.status}`;
      try { msg = JSON.parse(txt).error?.message || msg; } catch (_) {}
      return res.status(500).json({ error: msg, hint: r.status === 401 ? 'API Key ungültig oder abgelaufen' : r.status === 429 ? 'Rate limit — kurz warten' : '' });
    }

    const data = await r.json();
    const raw = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const s = clean.indexOf('['), e = clean.lastIndexOf(']');
    if (s < 0 || e < 0) return res.status(500).json({ error: 'Kein JSON gefunden', raw: clean.slice(0, 400) });

    const matches = JSON.parse(clean.slice(s, e + 1));
    return res.status(200).json({ matches });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
