export const config = { api: { bodyParser: true } };

// ─── Turnier-Mapping ────────────────────────────────────────────────────────
const TOURNAMENT_MAP = {
  'rom': { name: 'ATP Italian Open (Rom)', surface: 'Clay', oddsKey: 'tennis_atp_italian_open', atp_id: '0416' },
  'rome': { name: 'ATP Italian Open (Rom)', surface: 'Clay', oddsKey: 'tennis_atp_italian_open', atp_id: '0416' },
  'italian open': { name: 'ATP Italian Open (Rom)', surface: 'Clay', oddsKey: 'tennis_atp_italian_open', atp_id: '0416' },
  'internazionali': { name: 'ATP Italian Open (Rom)', surface: 'Clay', oddsKey: 'tennis_atp_italian_open', atp_id: '0416' },
  'french open': { name: 'Roland Garros', surface: 'Clay', oddsKey: 'tennis_atp_french_open', atp_id: '0520' },
  'roland garros': { name: 'Roland Garros', surface: 'Clay', oddsKey: 'tennis_atp_french_open', atp_id: '0520' },
  'paris': { name: 'Roland Garros', surface: 'Clay', oddsKey: 'tennis_atp_french_open', atp_id: '0520' },
  'wimbledon': { name: 'Wimbledon', surface: 'Grass', oddsKey: 'tennis_atp_wimbledon', atp_id: '0540' },
  'us open': { name: 'US Open', surface: 'Hard', oddsKey: 'tennis_atp_us_open', atp_id: '0560' },
  'australian open': { name: 'Australian Open', surface: 'Hard', oddsKey: 'tennis_atp_aus_open_singles', atp_id: '0580' },
  'madrid': { name: 'Mutua Madrid Open', surface: 'Clay', oddsKey: 'tennis_atp_madrid_open', atp_id: '0410' },
  'monte carlo': { name: 'Rolex Monte-Carlo Masters', surface: 'Clay', oddsKey: 'tennis_atp_monte_carlo_masters', atp_id: '0404' },
  'indian wells': { name: 'BNP Paribas Open (Indian Wells)', surface: 'Hard', oddsKey: 'tennis_atp_indian_wells', atp_id: '0404' },
  'miami': { name: 'Miami Open', surface: 'Hard', oddsKey: 'tennis_atp_miami_open', atp_id: '0421' },
  'barcelona': { name: 'Barcelona Open Banc Sabadell', surface: 'Clay', oddsKey: 'tennis_atp_barcelona_open', atp_id: '0425' },
  'hamburg': { name: 'Hamburg Open', surface: 'Clay', oddsKey: 'tennis_atp_hamburg_open', atp_id: '0500' },
  'wta rom': { name: 'WTA Italian Open (Rom)', surface: 'Clay', oddsKey: 'tennis_wta_italian_open', atp_id: 'wta_0416' },
  'wta rome': { name: 'WTA Italian Open (Rom)', surface: 'Clay', oddsKey: 'tennis_wta_italian_open', atp_id: 'wta_0416' },
  'wta french': { name: 'Roland Garros (WTA)', surface: 'Clay', oddsKey: 'tennis_wta_french_open', atp_id: 'wta_0520' },
  'wta wimbledon': { name: 'Wimbledon (WTA)', surface: 'Grass', oddsKey: 'tennis_wta_wimbledon', atp_id: 'wta_0540' },
};

function detectTournament(query) {
  const q = query.toLowerCase();
  for (const [kw, info] of Object.entries(TOURNAMENT_MAP)) {
    if (q.includes(kw)) return info;
  }
  return { name: 'ATP Italian Open (Rom)', surface: 'Clay', oddsKey: 'tennis_atp_italian_open', atp_id: '0416' };
}

// ─── Live-Quoten von The Odds API ───────────────────────────────────────────
async function fetchLiveOdds(tournament, query, oddsApiKey) {
  if (!oddsApiKey) return null;
  const url = `https://api.the-odds-api.com/v4/sports/${tournament.oddsKey}/odds/?apiKey=${oddsApiKey}&regions=eu&markets=h2h&oddsFormat=decimal`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    if (!Array.isArray(data)) return null;

    const q = query.toLowerCase();
    const words = q.split(/[\s\-vs]+/).filter(w => w.length > 3);

    const matched = data.filter(m => {
      const home = (m.home_team || '').toLowerCase();
      const away = (m.away_team || '').toLowerCase();
      return words.some(w => home.includes(w) || away.includes(w));
    });

    const source = matched.length > 0 ? matched : data;

    return source.slice(0, 8).map(match => {
      const allBooks = (match.bookmakers || []);
      const bookComparisons = allBooks.slice(0, 5).map(bm => {
        const mkt = bm.markets?.find(m => m.key === 'h2h');
        const out = mkt?.outcomes || [];
        const o1 = out.find(o => o.name === match.home_team)?.price;
        const o2 = out.find(o => o.name === match.away_team)?.price;
        return {
          name: bm.title,
          p1: o1 ? o1.toFixed(2) : '—',
          p2: o2 ? o2.toFixed(2) : '—',
          best: Math.max(o1||0, o2||0).toFixed(2)
        };
      }).filter(b => b.p1 !== '—');

      // Bestes Angebot über alle Bücher
      let bestP1 = 0, bestP2 = 0, bestP1Book = '', bestP2Book = '';
      allBooks.forEach(bm => {
        const mkt = bm.markets?.find(m => m.key === 'h2h');
        const out = mkt?.outcomes || [];
        const o1 = out.find(o => o.name === match.home_team)?.price || 0;
        const o2 = out.find(o => o.name === match.away_team)?.price || 0;
        if (o1 > bestP1) { bestP1 = o1; bestP1Book = bm.title; }
        if (o2 > bestP2) { bestP2 = o2; bestP2Book = bm.title; }
      });

      return {
        p1: match.home_team, p2: match.away_team,
        p1odds: bestP1 > 0 ? bestP1.toFixed(2) : null,
        p2odds: bestP2 > 0 ? bestP2.toFixed(2) : null,
        p1book: bestP1Book, p2book: bestP2Book,
        commence: match.commence_time,
        bookComparisons
      };
    });
  } catch (e) { return null; }
}

// ─── TennisMyLife Statistiken ────────────────────────────────────────────────
async function fetchPlayerStats(playerName) {
  const encoded = encodeURIComponent(playerName.toLowerCase().replace(/\s+/g, '-'));
  try {
    const r = await fetch(`https://stats.tennismylife.org/api/player/${encoded}/stats`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ─── Tennis Abstract H2H ─────────────────────────────────────────────────────
async function fetchH2H(p1, p2) {
  try {
    const p1enc = encodeURIComponent(p1);
    const p2enc = encodeURIComponent(p2);
    const r = await fetch(`https://www.tennisabstract.com/cgi-bin/player.cgi?p=${p1enc}&p2=${p2enc}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!r.ok) return null;
    const text = await r.text();
    const match = text.match(/H2H.*?(\d+)-(\d+)/i);
    if (match) return { p1wins: parseInt(match[1]), p2wins: parseInt(match[2]) };
    return null;
  } catch { return null; }
}

// ─── Main Handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const ak = process.env.ANTHROPIC_API_KEY || '';
    const ok = process.env.ODDS_API_KEY || '';
    return res.status(200).json({
      ok: true,
      anthropic_key_set: ak.length > 0,
      anthropic_key_prefix: ak ? ak.slice(0,14)+'...' : 'NICHT GESETZT',
      odds_api_key_set: ok.length > 0,
      odds_api_key_prefix: ok ? ok.slice(0,8)+'...' : 'NICHT GESETZT (optional)',
      time: new Date().toISOString()
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });

  const body = req.body || {};
  const { query = '', stakeOdds = '', customBet = '' } = body;
  if (!query && !customBet) return res.status(400).json({ error: 'Query oder customBet fehlt' });

  const AKEY = process.env.ANTHROPIC_API_KEY || '';
  const OKEY = process.env.ODDS_API_KEY || '';
  if (!AKEY || AKEY.length < 20) return res.status(500).json({ error: 'ANTHROPIC_API_KEY fehlt' });

  const tournament = detectTournament(query || customBet);
  const today = new Date().toLocaleDateString('de-DE');

  // Live-Quoten holen
  const liveOdds = await fetchLiveOdds(tournament, query || customBet, OKEY);

  // Kontext aufbauen
  let oddsCtx = '';
  if (liveOdds && liveOdds.length > 0) {
    oddsCtx = `\nECHTE LIVE-QUOTEN (The Odds API, Stand heute):\n` +
      liveOdds.map(m => `• ${m.p1} vs ${m.p2}: ${m.p1}@${m.p1odds}(${m.p1book}) / ${m.p2}@${m.p2odds}(${m.p2book})`).join('\n') +
      `\n→ Nutze AUSSCHLIESSLICH diese Quoten. Jede Wette MUSS eine andere Quote haben.`;
  } else if (stakeOdds) {
    oddsCtx = `\nStake.com Quoten: ${stakeOdds}`;
  } else {
    oddsCtx = `\nKeine Live-Quoten verfügbar. Schätze realistische, UNTERSCHIEDLICHE Quoten für jede Wette.\nTurnier: ${tournament.name} | Belag: ${tournament.surface}`;
  }

  const today_str = today;

  // ── CUSTOM BET BEWERTUNG ──────────────────────────────────────────────────
  if (customBet && !query) {
    const system = `Du bist ein professioneller Tennis-Wettanalyst. Heute: ${today_str}.
Bewerte die vom Nutzer eingereichte Wette objektiv und detailliert.
Antworte NUR mit einem JSON-Objekt (kein Array, keine Backticks):
{
  "bet_description": "Exakte Beschreibung der Wette",
  "verdict": "STARK" | "SOLIDE" | "GRENZWERTIG" | "RISKANT" | "VERMEIDEN",
  "verdict_color": "green" | "blue" | "amber" | "red",
  "confidence": 72,
  "fair_odds": 1.65,
  "ev_percent": 8.5,
  "pros": ["Vorteil 1", "Vorteil 2", "Vorteil 3"],
  "cons": ["Risiko 1", "Risiko 2"],
  "analysis": "Detaillierte Analyse in 4-5 Sätzen mit konkreten Stats, H2H, Form, Belag",
  "recommendation": "Empfehlung: ja/nein und warum",
  "stake_suggestion": "1-2 Units",
  "key_stat": "Wichtigste Statistik die das Ergebnis entscheidet"
}`;
    const userMsg = `Bewerte diese Wette: "${customBet}"${oddsCtx}`;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type':'application/json','x-api-key':AKEY,'anthropic-version':'2023-06-01' },
        body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:2000, system, messages:[{role:'user',content:userMsg}] })
      });
      if (!r.ok) { const t=await r.text(); throw new Error(JSON.parse(t)?.error?.message||`API ${r.status}`); }
      const data = await r.json();
      const raw = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
      const clean = raw.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').trim();
      const s=clean.indexOf('{'), e=clean.lastIndexOf('}');
      if(s<0||e<0) throw new Error('Kein JSON');
      const evaluation = JSON.parse(clean.slice(s,e+1));
      return res.status(200).json({ type:'custom_evaluation', evaluation });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── STANDARD ANALYSE ─────────────────────────────────────────────────────
  const system = `Du bist ein professioneller Tennis-Wettanalyst. Heute: ${today_str}.
Turnier: ${tournament.name} | Belag: ${tournament.surface}

PFLICHT-REGELN:
1. Antworte NUR mit einem JSON-Array — kein Text, keine Backticks
2. Schreibe den KORREKTEN Turniernamen: "${tournament.name}" — NIEMALS einen anderen
3. Jede der 3 Wetten MUSS eine ANDERE Quote haben — keine doppelten Quoten!
4. Nutze echte aktuelle Spielerstatistiken aus deinem Wissen für ${today_str}
5. Berechne Radar-Werte auf Basis echter Stats — nicht erfinden

WETT-KATEGORIEN (genau einhalten):
• Wette 1 — "safe": Quote 1.20–1.40, Konfidenz 75–90%, Einsatz "3-5 Units"
• Wette 2 — "value_play": Quote 1.41–1.90, Konfidenz 58–74%, Einsatz "2-3 Units"  
• Wette 3 — "value_bet": Quote 1.91–4.50, Konfidenz 35–57%, Einsatz "1 Unit"

EV = (conf/100 × odds - 1) × 100 — muss für alle 3 positiv sein

Stats-Qualität: Nutze echte Turnier-Stats (1. Aufschlag %, Asse, Return-Punkte %, Break-Conversion) aus dem laufenden Turnier oder aktuellen Saison-Daten auf ${tournament.surface}.

JSON-Format:
[
  {
    "p1": "Vorname Nachname",
    "p2": "Vorname Nachname",
    "tournament": "${tournament.name}",
    "surface_name": "${tournament.surface}",
    "round": "QF",
    "type": "safe",
    "category_label": "🔒 Sichere Wette",
    "odds": 1.28,
    "src": "Bet365",
    "fairodds": 1.18,
    "ev": 8.5,
    "conf": 82,
    "stake": "3-5 Units",
    "rec_player": "Spieler Name",
    "reco": "Spieler X Sieg @ 1.28 — konkreter Grund",
    "analysis": "4-5 Sätze mit echten Stats: aktuelle Form (X-Y in diesem Turnier), Belag-Bilanz (X% Gewinnrate auf Clay), H2H (X-Y Bilanz), Aufschlag-Stats (X% 1.Aufschlag diese Woche), Break-Stats",
    "tags": ["15-2 Clay 2026", "H2H 3-1", "Keine Satzverluste in Rom"],
    "form": 88,
    "surface": 85,
    "h2h": 72,
    "fitness": 90,
    "serve": 82,
    "return": 79,
    "mental": 88,
    "shot": 81,
    "r1": [88, 85, 72, 90, 82, 79, 88, 81],
    "r2": [65, 70, 78, 72, 75, 68, 70, 65],
    "adv": {
      "fs": 71, "ts": 218, "ace": 9, "rp": 46,
      "bp": 44, "win": 34, "ue": 17, "net": 73, "d3": 69
    },
    "book": [
      {"name": "Bet365", "p1": "1.28", "p2": "3.75", "best": "1.28"},
      {"name": "Betway", "p1": "1.30", "p2": "3.60", "best": "1.30"},
      {"name": "Bwin",   "p1": "1.27", "p2": "3.80", "best": "1.27"}
    ]
  },
  { "type": "value_play", "odds": ANDERE_QUOTE_1.41_bis_1.90, ... },
  { "type": "value_bet",  "odds": ANDERE_QUOTE_1.91_plus, ... }
]`;

  const userMsg = `Analysiere Tennis-Wetten für: "${query}"${oddsCtx}\n\nGib genau 3 Wetten zurück mit VERSCHIEDENEN Quoten (safe 1.20-1.40, value_play 1.41-1.90, value_bet 1.91+). Turniername MUSS "${tournament.name}" sein. Nur JSON-Array.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type':'application/json','x-api-key':AKEY,'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:3500, system, messages:[{role:'user',content:userMsg}] })
    });
    if (!r.ok) {
      const t = await r.text();
      let msg = `Anthropic ${r.status}`;
      try { msg = JSON.parse(t).error?.message || msg; } catch(_) {}
      return res.status(500).json({ error: msg });
    }
    const data = await r.json();
    const raw = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
    const clean = raw.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').trim();
    const s=clean.indexOf('['), e=clean.lastIndexOf(']');
    if(s<0||e<0) return res.status(500).json({ error:'Kein JSON-Array', raw:clean.slice(0,300) });

    let matches = JSON.parse(clean.slice(s,e+1));

    // Live-Quoten einsetzen wenn vorhanden
    if (liveOdds && liveOdds.length > 0) {
      matches = matches.map((m, idx) => {
        const live = liveOdds.find(lo => {
          const lp1 = (lo.p1||'').toLowerCase();
          const lp2 = (lo.p2||'').toLowerCase();
          const mp1 = (m.p1||'').toLowerCase().split(' ').pop();
          const mp2 = (m.p2||'').toLowerCase().split(' ').pop();
          return (lp1.includes(mp1)||lp2.includes(mp1)) && (lp1.includes(mp2)||lp2.includes(mp2));
        });
        if (live) {
          const useP1 = m.type === 'safe'
            ? parseFloat(live.p1odds) < parseFloat(live.p2odds)
            : m.type === 'value_bet'
            ? parseFloat(live.p1odds) > parseFloat(live.p2odds)
            : true;
          const realOdds = useP1 ? live.p1odds : live.p2odds;
          const realBook = useP1 ? live.p1book : live.p2book;
          return {
            ...m,
            tournament: tournament.name,
            surface_name: tournament.surface,
            odds: parseFloat(realOdds) || m.odds,
            src: realBook || m.src,
            book: live.bookComparisons.length > 0 ? live.bookComparisons : m.book
          };
        }
        return { ...m, tournament: tournament.name, surface_name: tournament.surface };
      });
    } else {
      matches = matches.map(m => ({ ...m, tournament: tournament.name, surface_name: tournament.surface }));
    }

    return res.status(200).json({ matches, live_odds_used: !!(liveOdds&&liveOdds.length>0), tournament: tournament.name });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
