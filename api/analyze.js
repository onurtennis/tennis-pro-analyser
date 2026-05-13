export const config = { api: { bodyParser: true } };

const TOURNAMENT_MAP = {
  'rom': { name: 'ATP Italian Open (Rom)', surface: 'Clay', oddsKey: 'tennis_atp_italian_open' },
  'rome': { name: 'ATP Italian Open (Rom)', surface: 'Clay', oddsKey: 'tennis_atp_italian_open' },
  'italian': { name: 'ATP Italian Open (Rom)', surface: 'Clay', oddsKey: 'tennis_atp_italian_open' },
  'internazionali': { name: 'ATP Italian Open (Rom)', surface: 'Clay', oddsKey: 'tennis_atp_italian_open' },
  'french open': { name: 'Roland Garros', surface: 'Clay', oddsKey: 'tennis_atp_french_open' },
  'roland garros': { name: 'Roland Garros', surface: 'Clay', oddsKey: 'tennis_atp_french_open' },
  'wimbledon': { name: 'Wimbledon', surface: 'Grass', oddsKey: 'tennis_atp_wimbledon' },
  'us open': { name: 'US Open', surface: 'Hard', oddsKey: 'tennis_atp_us_open' },
  'australian open': { name: 'Australian Open', surface: 'Hard', oddsKey: 'tennis_atp_aus_open_singles' },
  'madrid': { name: 'Mutua Madrid Open', surface: 'Clay', oddsKey: 'tennis_atp_madrid_open' },
  'monte carlo': { name: 'Rolex Monte-Carlo Masters', surface: 'Clay', oddsKey: 'tennis_atp_monte_carlo_masters' },
  'indian wells': { name: 'BNP Paribas Open', surface: 'Hard', oddsKey: 'tennis_atp_indian_wells' },
  'miami': { name: 'Miami Open', surface: 'Hard', oddsKey: 'tennis_atp_miami_open' },
  'wta rome': { name: 'WTA Italian Open (Rom)', surface: 'Clay', oddsKey: 'tennis_wta_italian_open' },
  'wta french': { name: 'Roland Garros (WTA)', surface: 'Clay', oddsKey: 'tennis_wta_french_open' },
  'wta wimbledon': { name: 'Wimbledon (WTA)', surface: 'Grass', oddsKey: 'tennis_wta_wimbledon' },
};

function detectTournament(q) {
  const ql = q.toLowerCase();
  for (const [k, v] of Object.entries(TOURNAMENT_MAP)) {
    if (ql.includes(k)) return v;
  }
  return { name: 'ATP Italian Open (Rom)', surface: 'Clay', oddsKey: 'tennis_atp_italian_open' };
}

async function getOdds(t, q, key) {
  if (!key) return null;
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${t.oddsKey}/odds/?apiKey=${key}&regions=eu&markets=h2h&oddsFormat=decimal`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const data = await r.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const matched = data.filter(m => {
      const h = (m.home_team||'').toLowerCase();
      const a = (m.away_team||'').toLowerCase();
      return words.some(w => h.includes(w) || a.includes(w));
    });
    const src = matched.length > 0 ? matched : data;
    return src.slice(0, 6).map(m => {
      let bestP1 = 0, bestP2 = 0, bestBook = '';
      const books = (m.bookmakers||[]).slice(0, 5).map(bm => {
        const mkt = bm.markets?.find(x => x.key === 'h2h');
        const o1 = mkt?.outcomes?.find(o => o.name === m.home_team)?.price || 0;
        const o2 = mkt?.outcomes?.find(o => o.name === m.away_team)?.price || 0;
        if (o1 > bestP1) { bestP1 = o1; }
        if (o2 > bestP2) { bestP2 = o2; }
        if (!bestBook && bm.title) bestBook = bm.title;
        return { name: bm.title, p1: o1 ? o1.toFixed(2) : '—', p2: o2 ? o2.toFixed(2) : '—', best: Math.max(o1,o2).toFixed(2) };
      }).filter(b => b.p1 !== '—');
      return { p1: m.home_team, p2: m.away_team, p1odds: bestP1 > 0 ? bestP1.toFixed(2) : null, p2odds: bestP2 > 0 ? bestP2.toFixed(2) : null, book: bestBook, books };
    });
  } catch { return null; }
}

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
      anthropic_key_set: ak.length > 10,
      anthropic_key_prefix: ak ? ak.slice(0, 14) + '...' : 'NICHT GESETZT',
      odds_api_key_set: ok.length > 5,
      odds_api_key_prefix: ok ? ok.slice(0, 8) + '...' : 'NICHT GESETZT (optional)',
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });

  const body = req.body || {};
  const query = (body.query || '').trim();
  const stakeOdds = (body.stakeOdds || '').trim();
  const customBet = (body.customBet || '').trim();

  const AKEY = process.env.ANTHROPIC_API_KEY || '';
  const OKEY = process.env.ODDS_API_KEY || '';
  if (!AKEY || AKEY.length < 10) return res.status(500).json({ error: 'ANTHROPIC_API_KEY fehlt in Vercel Environment Variables' });

  const tournament = detectTournament(query || customBet);
  const today = new Date().toLocaleDateString('de-DE');

  // ── CUSTOM BET ─────────────────────────────────────────────────────────────
  if (customBet) {
    const sys = `Du bist Tennis-Wettanalyst. Heute: ${today}. Antworte NUR mit JSON-Objekt, keine Backticks:
{"bet_description":"...","verdict":"STARK|SOLIDE|GRENZWERTIG|RISKANT|VERMEIDEN","verdict_color":"green|blue|amber|red","confidence":72,"fair_odds":1.65,"ev_percent":8.5,"pros":["p1","p2","p3"],"cons":["c1","c2"],"analysis":"4-5 Sätze Analyse","recommendation":"Empfehlung","stake_suggestion":"1-2 Units","key_stat":"Wichtigste Stat"}`;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': AKEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, system: sys, messages: [{ role: 'user', content: `Bewerte: "${customBet}"` }] }),
        signal: AbortSignal.timeout(25000)
      });
      if (!r.ok) throw new Error(`API ${r.status}`);
      const d = await r.json();
      const raw = (d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
      const clean = raw.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').trim();
      const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
      if (s < 0 || e < 0) throw new Error('Kein JSON');
      return res.status(200).json({ type: 'custom_evaluation', evaluation: JSON.parse(clean.slice(s, e+1)) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!query) return res.status(400).json({ error: 'Query fehlt' });

  // Live-Quoten holen (mit Timeout)
  const liveOdds = await getOdds(tournament, query, OKEY);

  let oddsCtx = '';
  if (liveOdds && liveOdds.length > 0) {
    oddsCtx = '\nECHTE LIVE-QUOTEN:\n' + liveOdds.map(m => `• ${m.p1} vs ${m.p2}: ${m.p1}@${m.p1odds} / ${m.p2}@${m.p2odds} (${m.book})`).join('\n') + '\nNutze diese Quoten!';
  } else if (stakeOdds) {
    oddsCtx = `\nStake.com Quoten: ${stakeOdds}`;
  } else {
    oddsCtx = `\nKeine Live-Quoten. Schätze realistische Quoten. Turnier: ${tournament.name}`;
  }

  const sys = `Du bist Tennis-Wettanalyst. Heute: ${today}. Turnier: ${tournament.name} (${tournament.surface}).

REGELN:
1. Antworte NUR mit JSON-Array, keine Backticks, kein anderer Text
2. Turniername IMMER: "${tournament.name}"
3. 3 Wetten mit VERSCHIEDENEN bet_odds: safe=1.20-1.40, value_play=1.41-1.90, value_bet=1.91+
4. bet_odds = die Quote auf den spezifischen Wettmarkt (nicht immer Siegquote!)
5. adv und adv2 = echte realistische Stats beider Spieler auf ${tournament.surface}
6. r1 und r2 = Percentile 0-100 je Kategorie — müssen die echten Stärken/Schwächen zeigen!

JSON-Format (exakt, alle Felder):
[{"p1":"Name","p2":"Name","p1_country":"ITA","p2_country":"NOR","p1_rank":1,"p2_rank":25,"tournament":"${tournament.name}","surface_name":"${tournament.surface}","round":"QF","type":"safe","odds":1.28,"bet_odds":1.28,"bet_market":"Sieg Favorit","bet_src":"Bet365","src":"Bet365","fairodds":1.18,"ev":8.5,"conf":82,"stake":"3-5 Units","rec_player":"Name","h2h_label":"3-1","reco":"Name Sieg @ 1.28 — Grund","analysis":"Analyse mit echten Stats","tags":["Tag1","Tag2","Tag3"],"form":88,"surface":85,"h2h":72,"fitness":90,"serve":82,"return":79,"mental":88,"shot":81,"form2":65,"surface2":70,"fitness2":72,"mental2":68,"r1":[88,85,72,90,82,79,88,81],"r2":[65,70,28,72,75,68,70,60],"adv":{"fs":71,"ts":218,"ace":9,"rp":46,"bp":44,"win":34,"ue":17,"net":73,"d3":69},"adv2":{"fs":63,"ts":207,"ace":6,"rp":41,"bp":31,"win":28,"ue":32,"net":54,"d3":51},"book":[{"name":"Bet365","p1":"1.28","p2":"3.75","best":"1.28"},{"name":"Betway","p1":"1.30","p2":"3.60","best":"1.30"},{"name":"Bwin","p1":"1.27","p2":"3.80","best":"1.27"}]},{"type":"value_play","bet_odds":1.65,"bet_market":"Handicap -2.5 Games",...},{"type":"value_bet","bet_odds":3.20,"bet_market":"Sieg Außenseiter",...}]`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': AKEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 3000, system: sys, messages: [{ role: 'user', content: `Analysiere: "${query}"${oddsCtx}\n3 Wetten zurückgeben. Nur JSON.` }] }),
      signal: AbortSignal.timeout(25000)
    });

    if (!r.ok) {
      const t = await r.text();
      let msg = `Anthropic ${r.status}`;
      try { msg = JSON.parse(t).error?.message || msg; } catch(_) {}
      return res.status(500).json({ error: msg });
    }

    const d = await r.json();
    const raw = (d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
    const clean = raw.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').trim();
    const s = clean.indexOf('['), e = clean.lastIndexOf(']');
    if (s < 0 || e < 0) return res.status(500).json({ error: 'Kein JSON-Array', raw: clean.slice(0,200) });

    let matches = JSON.parse(clean.slice(s, e+1));

    // Live-Quoten einsetzen
    if (liveOdds && liveOdds.length > 0) {
      matches = matches.map(m => {
        const live = liveOdds.find(lo => {
          const lp1 = (lo.p1||'').toLowerCase(), lp2 = (lo.p2||'').toLowerCase();
          const mp1 = (m.p1||'').toLowerCase().split(' ').pop();
          const mp2 = (m.p2||'').toLowerCase().split(' ').pop();
          return (lp1.includes(mp1)||lp2.includes(mp1)) && (lp1.includes(mp2)||lp2.includes(mp2));
        });
        if (live) {
          return { ...m, tournament: tournament.name, surface_name: tournament.surface, book: live.books?.length > 0 ? live.books : m.book };
        }
        return { ...m, tournament: tournament.name, surface_name: tournament.surface };
      });
    } else {
      matches = matches.map(m => ({ ...m, tournament: tournament.name, surface_name: tournament.surface }));
    }

    return res.status(200).json({ matches, live_odds_used: !!(liveOdds?.length), tournament: tournament.name });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
