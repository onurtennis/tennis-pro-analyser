export const config = { api: { bodyParser: true } };

const SPORT_KEYS = {
  'italian open': 'tennis_atp_italian_open',
  'rome': 'tennis_atp_italian_open',
  'rom': 'tennis_atp_italian_open',
  'french open': 'tennis_atp_french_open',
  'roland garros': 'tennis_atp_french_open',
  'wimbledon': 'tennis_atp_wimbledon',
  'us open': 'tennis_atp_us_open',
  'australian open': 'tennis_atp_aus_open_singles',
  'madrid': 'tennis_atp_madrid_open',
  'monte carlo': 'tennis_atp_monte_carlo_masters',
  'indian wells': 'tennis_atp_indian_wells',
  'miami': 'tennis_atp_miami_open',
  'wta rome': 'tennis_wta_italian_open',
  'wta italian': 'tennis_wta_italian_open',
  'wta french': 'tennis_wta_french_open',
  'wta wimbledon': 'tennis_wta_wimbledon',
};

function detectSportKey(query) {
  const q = query.toLowerCase();
  for (const [keyword, key] of Object.entries(SPORT_KEYS)) {
    if (q.includes(keyword)) return key;
  }
  return 'tennis_atp_italian_open';
}

async function fetchLiveOdds(query, oddsApiKey) {
  if (!oddsApiKey) return null;
  const sportKey = detectSportKey(query);
  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${oddsApiKey}&regions=eu&markets=h2h&oddsFormat=decimal`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const q = query.toLowerCase();
    const words = q.split(/\s+/).filter(w => w.length > 3);
    const matched = data.filter(match => {
      const home = (match.home_team || '').toLowerCase();
      const away = (match.away_team || '').toLowerCase();
      return words.some(w => home.includes(w) || away.includes(w));
    });
    return (matched.length > 0 ? matched : data).slice(0, 6).map(match => {
      const bookmaker = match.bookmakers?.[0];
      const market = bookmaker?.markets?.find(m => m.key === 'h2h');
      const outcomes = market?.outcomes || [];
      const p1odds = outcomes.find(o => o.name === match.home_team)?.price;
      const p2odds = outcomes.find(o => o.name === match.away_team)?.price;
      const bookComparisons = (match.bookmakers || []).slice(0, 4).map(bm => {
        const mkt = bm.markets?.find(m => m.key === 'h2h');
        const out = mkt?.outcomes || [];
        const o1 = out.find(o => o.name === match.home_team)?.price?.toFixed(2);
        const o2 = out.find(o => o.name === match.away_team)?.price?.toFixed(2);
        const best = Math.max(parseFloat(o1)||0, parseFloat(o2)||0).toFixed(2);
        return { name: bm.title, p1: o1||'—', p2: o2||'—', best };
      }).filter(b => b.p1 !== '—');
      return {
        p1: match.home_team, p2: match.away_team,
        commence: match.commence_time, sport_key: match.sport_key,
        p1odds: p1odds?.toFixed(2), p2odds: p2odds?.toFixed(2),
        bookmaker: bookmaker?.title || 'Bet365', bookComparisons
      };
    });
  } catch (e) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const anthKey = process.env.ANTHROPIC_API_KEY || '';
    const oddsKey = process.env.ODDS_API_KEY || '';
    return res.status(200).json({
      ok: true,
      anthropic_key_set: anthKey.length > 0,
      anthropic_key_prefix: anthKey.length > 0 ? anthKey.slice(0,14)+'...' : 'NICHT GESETZT',
      odds_api_key_set: oddsKey.length > 0,
      odds_api_key_prefix: oddsKey.length > 0 ? oddsKey.slice(0,8)+'...' : 'NICHT GESETZT (optional)',
      node: process.version, time: new Date().toISOString()
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST allowed' });

  const body = req.body || {};
  const query = body.query || '';
  const stakeOdds = body.stakeOdds || '';
  if (!query) return res.status(400).json({ error: 'Kein Query' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
  const ODDS_KEY = process.env.ODDS_API_KEY || '';
  if (!ANTHROPIC_KEY || ANTHROPIC_KEY.length < 20) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY fehlt in Vercel Environment Variables' });
  }

  const liveOdds = await fetchLiveOdds(query, ODDS_KEY);
  const today = new Date().toLocaleDateString('de-DE');

  let oddsContext = '';
  if (liveOdds && liveOdds.length > 0) {
    oddsContext = `\n\nECHTE LIVE-QUOTEN von The Odds API:\n${liveOdds.map(m =>
      `- ${m.p1} vs ${m.p2}: ${m.p1}@${m.p1odds} / ${m.p2}@${m.p2odds} (${m.bookmaker})`
    ).join('\n')}\n\nNutze AUSSCHLIESSLICH diese echten Quoten.`;
  } else if (stakeOdds) {
    oddsContext = `\n\nStake.com Quoten: ${stakeOdds}`;
  } else {
    oddsContext = `\n\nKeine Live-Quoten verfügbar. Schätze realistische Quoten. Nutze KORREKTE Turniernamen.`;
  }

  const system = `Du bist ein professioneller Tennis-Wettanalyst. Heute ist: ${today}.

WETT-KATEGORIEN (ZWINGEND einhalten):
Du gibst genau 3 Wettempfehlungen zurück — eine pro Kategorie:

1. SICHERE WETTE (type: "safe")
   - Quote: 1.20 – 1.40
   - Konfidenz: 75-90%
   - Klarer Favorit, dominante Form, starkes H2H
   - Beispiel: Top-3-Spieler gegen Qualifier auf Lieblingsbelag

2. SPIELBARE WETTE (type: "value_play")  
   - Quote: 1.41 – 1.90
   - Konfidenz: 58-74%
   - Solider Favorit mit gutem EV, etwas Risiko möglich
   - Beispiel: Formstarker Spieler auf passendem Belag

3. VALUE WETTE (type: "value_bet")
   - Quote: 1.91 – 4.00+
   - Konfidenz: 35-57%
   - Echter Außenseiter mit konkretem statistischen Vorteil
   - Nur wenn klarer Grund: Belag, H2H, Fitness, Form-Delle des Favoriten
   - Beispiel: Clay-Spezialist gegen Hartplatz-Spieler bei Quote 2.50

EV-Berechnung: ev = (conf/100 * odds - 1) * 100
Alle 3 Kategorien MÜSSEN positiven EV haben.

KRITISCHE REGELN:
- Antworte NUR mit JSON-Array, kein Text davor/danach, keine Backticks
- KORREKTE Turniernamen — "Rom" = "ATP Italian Open", nicht "Roland Garros"
- Nutze echte Quoten aus dem Kontext wenn vorhanden

JSON-Format:
[
  {
    "p1": "Spieler 1",
    "p2": "Spieler 2",
    "tournament": "Korrekter Turniername",
    "surface_name": "Clay",
    "round": "QF",
    "type": "safe",
    "category_label": "🔒 Sichere Wette",
    "odds": 1.28,
    "src": "Bet365",
    "fairodds": 1.18,
    "ev": 8.5,
    "conf": 82,
    "stake": "3-5 Units",
    "rec_player": "Spieler 1",
    "reco": "Spieler 1 Sieg @ 1.28 — Begründung",
    "analysis": "Tiefenanalyse mit Form, Belag, H2H, konkreten Stats",
    "tags": ["Tag1", "Tag2", "Tag3"],
    "form": 88,
    "surface": 85,
    "h2h": 75,
    "fitness": 90,
    "serve": 82,
    "return": 78,
    "mental": 88,
    "shot": 80,
    "r1": [88,85,75,90,82,78,88,80],
    "r2": [65,70,60,72,68,62,70,65],
    "adv": {
      "fs": 71, "ts": 218, "ace": 10, "rp": 45,
      "bp": 42, "win": 35, "ue": 18, "net": 72, "d3": 68
    },
    "book": [
      {"name": "Bet365", "p1": "1.28", "p2": "3.75", "best": "1.28"},
      {"name": "Betway", "p1": "1.30", "p2": "3.60", "best": "1.30"},
      {"name": "Bwin",   "p1": "1.27", "p2": "3.80", "best": "1.27"}
    ]
  },
  { ... zweite Wette type:"value_play" Quote 1.41-1.90 ... },
  { ... dritte Wette type:"value_bet" Quote 1.91+ ... }
]

stake-Empfehlung nach Kategorie:
- safe: "3-5 Units"
- value_play: "2-3 Units"  
- value_bet: "1 Unit"`;

  const userMsg = `Analysiere Tennis-Wetten für: "${query}"${oddsContext}\n\nGib genau 3 Wetten zurück (safe 1.20-1.40, value_play 1.41-1.90, value_bet 1.91+). Nur JSON-Array.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
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
      return res.status(500).json({ error: msg });
    }

    const data = await r.json();
    const raw = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
    const clean = raw.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').trim();
    const s = clean.indexOf('['), e = clean.lastIndexOf(']');
    if (s<0||e<0) return res.status(500).json({ error: 'Kein JSON', raw: clean.slice(0,300) });

    let matches = JSON.parse(clean.slice(s, e+1));

    if (liveOdds && liveOdds.length > 0) {
      matches = matches.map(m => {
        const live = liveOdds.find(lo => {
          const p1 = (lo.p1||'').toLowerCase();
          const p2 = (lo.p2||'').toLowerCase();
          const mp1 = (m.p1||'').toLowerCase().split(' ').pop();
          const mp2 = (m.p2||'').toLowerCase().split(' ').pop();
          return (p1.includes(mp1)||p2.includes(mp1)) && (p1.includes(mp2)||p2.includes(mp2));
        });
        if (live) {
          const favOdds = parseFloat(live.p1odds) < parseFloat(live.p2odds) ? live.p1odds : live.p2odds;
          return { ...m, odds: parseFloat(favOdds)||m.odds, src: live.bookmaker, book: live.bookComparisons.length>0?live.bookComparisons:m.book };
        }
        return m;
      });
    }

    return res.status(200).json({ matches, live_odds_used: !!(liveOdds&&liveOdds.length>0) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
