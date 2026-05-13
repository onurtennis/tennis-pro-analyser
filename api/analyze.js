export const config = { api: { bodyParser: true } };

// ── Tournament mapping ────────────────────────────────────────────────────────
const TMATCH = {
  'rom':{'name':'ATP Italian Open (Rom)','surface':'Clay','oddsKey':'tennis_atp_italian_open','atpId':'418'},
  'rome':{'name':'ATP Italian Open (Rom)','surface':'Clay','oddsKey':'tennis_atp_italian_open','atpId':'418'},
  'italian':{'name':'ATP Italian Open (Rom)','surface':'Clay','oddsKey':'tennis_atp_italian_open','atpId':'418'},
  'internazionali':{'name':'ATP Italian Open (Rom)','surface':'Clay','oddsKey':'tennis_atp_italian_open','atpId':'418'},
  'french open':{'name':'Roland Garros','surface':'Clay','oddsKey':'tennis_atp_french_open','atpId':'520'},
  'roland garros':{'name':'Roland Garros','surface':'Clay','oddsKey':'tennis_atp_french_open','atpId':'520'},
  'wimbledon':{'name':'Wimbledon','surface':'Grass','oddsKey':'tennis_atp_wimbledon','atpId':'540'},
  'us open':{'name':'US Open','surface':'Hard','oddsKey':'tennis_atp_us_open','atpId':'560'},
  'australian open':{'name':'Australian Open','surface':'Hard','oddsKey':'tennis_atp_aus_open_singles','atpId':'580'},
  'madrid':{'name':'Mutua Madrid Open','surface':'Clay','oddsKey':'tennis_atp_madrid_open','atpId':'410'},
  'monte carlo':{'name':'Rolex Monte-Carlo Masters','surface':'Clay','oddsKey':'tennis_atp_monte_carlo_masters','atpId':'404'},
  'wta rome':{'name':'WTA Italian Open (Rom)','surface':'Clay','oddsKey':'tennis_wta_italian_open','atpId':'wta418'},
  'wta french':{'name':'Roland Garros (WTA)','surface':'Clay','oddsKey':'tennis_wta_french_open','atpId':'wta520'},
};
function detectT(q){const ql=(q||'').toLowerCase();for(const[k,v]of Object.entries(TMATCH))if(ql.includes(k))return v;return TMATCH['rom'];}

// ── API-Tennis (RapidAPI) ─────────────────────────────────────────────────────
async function fetchPlayerStats(playerName, rapidKey) {
  if (!rapidKey) return null;
  try {
    // Search player
    const searchUrl = `https://api-tennis.p.rapidapi.com/player/?search=${encodeURIComponent(playerName)}&tour_code=atp`;
    const s = await fetch(searchUrl, {
      headers: { 'X-RapidAPI-Key': rapidKey, 'X-RapidAPI-Host': 'api-tennis.p.rapidapi.com' },
      signal: AbortSignal.timeout(5000)
    });
    if (!s.ok) return null;
    const sd = await s.json();
    const players = sd?.result || [];
    if (!players.length) return null;
    const player = players[0];
    const pid = player.player_key || player.id;
    if (!pid) return null;

    // Get stats
    const statsUrl = `https://api-tennis.p.rapidapi.com/player/?player_key=${pid}`;
    const r = await fetch(statsUrl, {
      headers: { 'X-RapidAPI-Key': rapidKey, 'X-RapidAPI-Host': 'api-tennis.p.rapidapi.com' },
      signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) return null;
    const rd = await r.json();
    const stats = rd?.result?.[0] || {};

    return {
      name: stats.player_name || playerName,
      rank: stats.ranking || null,
      country: stats.player_country || null,
      age: stats.player_age || null,
      height: stats.player_height || null,
      weight: stats.player_weight || null,
      hand: stats.player_hand || null,
      rank_points: stats.ranking_points || null,
      prize_money: stats.prize_money || null,
    };
  } catch { return null; }
}

// ── Ultimate Tennis Statistics (UTS) — surface & career stats ─────────────────
async function fetchUTSStats(playerName) {
  try {
    const encoded = encodeURIComponent(playerName.replace(/\s+/g, '+'));
    const url = `https://www.ultimatetennisstatistics.com/playerProfile?name=${encoded}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) return null;
    const html = await r.text();
    // Extract win rates
    const clayMatch = html.match(/Clay[^%]*?(\d{1,3})%/i);
    const grassMatch = html.match(/Grass[^%]*?(\d{1,3})%/i);
    const hardMatch = html.match(/Hard[^%]*?(\d{1,3})%/i);
    return {
      clay_win_pct: clayMatch ? parseInt(clayMatch[1]) : null,
      grass_win_pct: grassMatch ? parseInt(grassMatch[1]) : null,
      hard_win_pct: hardMatch ? parseInt(hardMatch[1]) : null,
    };
  } catch { return null; }
}

// ── The Odds API ──────────────────────────────────────────────────────────────
async function fetchOdds(tournament, query, key) {
  if (!key) return null;
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${tournament.oddsKey}/odds/?apiKey=${key}&regions=eu&markets=h2h&oddsFormat=decimal`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const data = await r.json();
    if (!Array.isArray(data) || !data.length) return null;
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const matched = data.filter(m => {
      const h=(m.home_team||'').toLowerCase(), a=(m.away_team||'').toLowerCase();
      return words.some(w => h.includes(w) || a.includes(w));
    });
    return (matched.length ? matched : data).slice(0, 8).map(m => {
      let bestP1=0, bestP2=0, bestP1Book='', bestP2Book='';
      const books=(m.bookmakers||[]).slice(0,5).map(bm=>{
        const mkt=bm.markets?.find(x=>x.key==='h2h');
        const o1=mkt?.outcomes?.find(o=>o.name===m.home_team)?.price||0;
        const o2=mkt?.outcomes?.find(o=>o.name===m.away_team)?.price||0;
        if(o1>bestP1){bestP1=o1;bestP1Book=bm.title;}
        if(o2>bestP2){bestP2=o2;bestP2Book=bm.title;}
        return {name:bm.title,p1:o1?o1.toFixed(2):'—',p2:o2?o2.toFixed(2):'—'};
      }).filter(b=>b.p1!=='—');
      return {p1:m.home_team,p2:m.away_team,p1odds:bestP1>0?bestP1.toFixed(2):null,p2odds:bestP2>0?bestP2.toFixed(2):null,p1book:bestP1Book,p2book:bestP2Book,books};
    });
  } catch { return null; }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const ak = process.env.ANTHROPIC_API_KEY||'';
    const ok = process.env.ODDS_API_KEY||'';
    const rk = process.env.RAPIDAPI_KEY||'';
    return res.status(200).json({
      ok: true,
      anthropic_key_set: ak.length>10, anthropic_key_prefix: ak?ak.slice(0,14)+'...':'NICHT GESETZT',
      odds_key_set: ok.length>5, odds_key_prefix: ok?ok.slice(0,8)+'...':'nicht gesetzt (optional)',
      rapidapi_key_set: rk.length>5, rapidapi_key_prefix: rk?rk.slice(0,8)+'...':'nicht gesetzt (optional)',
      apis: {
        'The Odds API': ok?'✅ Aktiv':'❌ Nicht konfiguriert — the-odds-api.com → Free Plan → ODDS_API_KEY',
        'RapidAPI Tennis': rk?'✅ Aktiv':'❌ Nicht konfiguriert — rapidapi.com → "API-Tennis" → Free Plan → RAPIDAPI_KEY',
        'Anthropic Claude': ak?'✅ Aktiv':'❌ Nicht konfiguriert'
      }
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });

  const body = req.body || {};
  const query = (body.query||'').trim();
  const customBet = (body.customBet||'').trim();
  const manualStats = body.playerStats || null;

  const AKEY = process.env.ANTHROPIC_API_KEY||'';
  const OKEY = process.env.ODDS_API_KEY||'';
  const RKEY = process.env.RAPIDAPI_KEY||'';

  if (!AKEY||AKEY.length<10) return res.status(500).json({ error: 'ANTHROPIC_API_KEY fehlt in Vercel Environment Variables' });

  const tournament = detectT(query||customBet);
  const today = new Date().toLocaleDateString('de-DE');

  // Extract player names from query
  const vsMatch = (query||customBet).match(/(.+?)\s+vs\.?\s+(.+?)(?:\s+atp|\s+wta|\s+beim|\s+@|$)/i);
  const p1name = vsMatch ? vsMatch[1].trim() : '';
  const p2name = vsMatch ? vsMatch[2].trim() : '';

  // Fetch all data in parallel
  const [liveOdds, p1ApiStats, p2ApiStats] = await Promise.all([
    fetchOdds(tournament, query||customBet, OKEY),
    p1name && RKEY ? fetchPlayerStats(p1name, RKEY) : Promise.resolve(null),
    p2name && RKEY ? fetchPlayerStats(p2name, RKEY) : Promise.resolve(null),
  ]);

  // Build context
  let oddsCtx = '';
  if (liveOdds?.length) {
    oddsCtx = '\nECHTE LIVE-QUOTEN (The Odds API):\n' +
      liveOdds.map(m=>`• ${m.p1} vs ${m.p2}: ${m.p1}@${m.p1odds}(${m.p1book}) / ${m.p2}@${m.p2odds}(${m.p2book})`).join('\n');
  }

  let statsCtx = '';
  if (manualStats) {
    statsCtx = `\nNUTZER-STATS (manuell eingegeben, höchste Priorität):\n${JSON.stringify(manualStats,null,2)}`;
  } else if (p1ApiStats || p2ApiStats) {
    statsCtx = '\nAPI-STATS (RapidAPI Tennis):';
    if (p1ApiStats) statsCtx += `\n${p1name}: Ranking #${p1ApiStats.rank||'?'}, ${p1ApiStats.country||''}, ${p1ApiStats.hand||''}-händig`;
    if (p2ApiStats) statsCtx += `\n${p2name}: Ranking #${p2ApiStats.rank||'?'}, ${p2ApiStats.country||''}, ${p2ApiStats.hand||''}-händig`;
  }

  // ── CUSTOM BET ─────────────────────────────────────────────────────────────
  if (customBet) {
    const sys = `Du bist Tennis-Wettanalyst. Heute: ${today}. Antworte NUR mit JSON-Objekt, keine Backticks.
{"bet_description":"...","verdict":"STARK|SOLIDE|GRENZWERTIG|RISKANT|VERMEIDEN","verdict_color":"green|blue|amber|red","confidence":72,"fair_odds":1.65,"ev_percent":8.5,"pros":["p1","p2","p3"],"cons":["c1","c2"],"analysis":"Detaillierte Analyse mit konkreten Stats","recommendation":"Klare Empfehlung","stake_suggestion":"1-2 Units","key_stat":"Wichtigste Stat"}`;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST', headers:{'content-type':'application/json','x-api-key':AKEY,'anthropic-version':'2023-06-01'},
        body: JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:1500,system:sys,messages:[{role:'user',content:`Bewerte: "${customBet}"${statsCtx}`}]}),
        signal: AbortSignal.timeout(25000)
      });
      if (!r.ok) throw new Error(`API ${r.status}`);
      const d = await r.json();
      const raw=(d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
      const clean=raw.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').trim();
      const s=clean.indexOf('{'),e=clean.lastIndexOf('}');
      if(s<0||e<0) throw new Error('Kein JSON');
      return res.status(200).json({type:'custom_evaluation',evaluation:JSON.parse(clean.slice(s,e+1))});
    } catch(err){ return res.status(500).json({error:err.message}); }
  }

  if (!query) return res.status(400).json({ error: 'Query fehlt' });

  // ── MAIN ANALYSIS ──────────────────────────────────────────────────────────
  const sys = `Du bist Tennis-Wettanalyst. Heute: ${today}. Turnier: ${tournament.name} (${tournament.surface}).

REGELN:
1. NUR JSON-Array, keine Backticks, kein anderer Text
2. Turniername IMMER: "${tournament.name}"
3. 3 Wetten: safe(1.20-1.40), value_play(1.41-1.90), value_bet(1.91+)
4. bet_odds MUSS in der richtigen Range liegen — alle 3 VERSCHIEDENE Quoten!
5. EINE Richtung: entscheide dich für EINEN Spieler und EINEN Markt. NICHT "Spieler A -X aber Spieler B +Y"
6. bet_market = konkreter einzelner Markt: z.B. "Ruud Sieg", "Ruud Sieg in 2 Sätzen", "Over 22.5 Games", "Khachanov Sieg"
7. r1/r2 = Percentile 0-100 — zeige ECHTE Unterschiede basierend auf den Stats!

JSON (alle Felder pflicht):
[{"p1":"Name","p2":"Name","p1_country":"NOR","p2_country":"RUS","p1_rank":8,"p2_rank":21,
"tournament":"${tournament.name}","surface_name":"${tournament.surface}","round":"QF",
"type":"safe","odds":1.29,"bet_odds":1.29,"bet_market":"Ruud Sieg","bet_src":"Bet365","src":"Bet365",
"fairodds":1.18,"ev":9.3,"conf":83,"stake":"3-5 Units","rec_player":"Casper Ruud","h2h_label":"2-1",
"reco":"Ruud Sieg @ 1.29 — klare Begründung",
"analysis":"5 Sätze mit echten konkreten Stats",
"tags":["16-2 Clay 2026","H2H 2-1","0 Satzverluste Rom"],
"form":88,"surface":91,"h2h":68,"fitness":85,"serve":78,"return":82,"mental":87,"shot":84,
"form2":62,"surface2":48,"fitness2":70,"mental2":65,
"r1":[88,91,68,85,78,82,87,84],"r2":[62,48,72,70,74,65,68,60],
"adv":{"fs":71,"ts":210,"ace":7,"rp":47,"bp":43,"win":31,"ue":19,"net":68,"d3":67},
"adv2":{"fs":65,"ts":215,"ace":9,"rp":39,"bp":28,"win":33,"ue":31,"net":52,"d3":48},
"book":[{"name":"Bet365","p1":"1.29","p2":"3.50","best":"1.29"},{"name":"Betway","p1":"1.31","p2":"3.40","best":"1.31"},{"name":"Bwin","p1":"1.28","p2":"3.55","best":"1.28"}]},
{"type":"value_play","bet_odds":1.58,"bet_market":"Ruud Sieg in 2 Sätzen",...},
{"type":"value_bet","bet_odds":3.50,"bet_market":"Khachanov Sieg",...}]`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'content-type':'application/json','x-api-key':AKEY,'anthropic-version':'2023-06-01'},
      body: JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:3000,system:sys,
        messages:[{role:'user',content:`Analysiere: "${query}"${oddsCtx}${statsCtx}\nGib 3 Wetten zurück. Nur JSON.`}]}),
      signal: AbortSignal.timeout(25000)
    });
    if (!r.ok) {
      const t=await r.text(); let msg=`Anthropic ${r.status}`;
      try{msg=JSON.parse(t).error?.message||msg;}catch(_){}
      return res.status(500).json({error:msg});
    }
    const d = await r.json();
    const raw=(d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
    const clean=raw.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').trim();
    const s=clean.indexOf('['),e=clean.lastIndexOf(']');
    if(s<0||e<0) return res.status(500).json({error:'Kein JSON-Array',raw:clean.slice(0,200)});
    let matches=JSON.parse(clean.slice(s,e+1));

    // Inject correct data
    matches=matches.map(m=>{
      const live=liveOdds?.find(lo=>{
        const lp1=(lo.p1||'').toLowerCase(),lp2=(lo.p2||'').toLowerCase();
        const mp1=(m.p1||'').toLowerCase().split(' ').pop(),mp2=(m.p2||'').toLowerCase().split(' ').pop();
        return (lp1.includes(mp1)||lp2.includes(mp1))&&(lp1.includes(mp2)||lp2.includes(mp2));
      });
      // Inject ranking from API
      if(p1ApiStats&&m.p1?.toLowerCase().includes(p1name.toLowerCase().split(' ').pop())) {
        m.p1_rank=p1ApiStats.rank||m.p1_rank;
        m.p1_country=p1ApiStats.country||m.p1_country;
      }
      if(p2ApiStats&&m.p2?.toLowerCase().includes(p2name.toLowerCase().split(' ').pop())) {
        m.p2_rank=p2ApiStats.rank||m.p2_rank;
        m.p2_country=p2ApiStats.country||m.p2_country;
      }
      return {...m,tournament:tournament.name,surface_name:tournament.surface,book:live?.books||m.book};
    });

    return res.status(200).json({
      matches,
      live_odds_used:!!(liveOdds?.length),
      api_stats_used:!!(p1ApiStats||p2ApiStats||manualStats),
      tournament:tournament.name
    });
  } catch(err){
    return res.status(500).json({error:err.message});
  }
}
