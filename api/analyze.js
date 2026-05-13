const TMATCH = {
  'rom':{'name':'ATP Italian Open (Rom)','surface':'Clay','oddsKey':'tennis_atp_italian_open'},
  'rome':{'name':'ATP Italian Open (Rom)','surface':'Clay','oddsKey':'tennis_atp_italian_open'},
  'italian':{'name':'ATP Italian Open (Rom)','surface':'Clay','oddsKey':'tennis_atp_italian_open'},
  'internazionali':{'name':'ATP Italian Open (Rom)','surface':'Clay','oddsKey':'tennis_atp_italian_open'},
  'french open':{'name':'Roland Garros','surface':'Clay','oddsKey':'tennis_atp_french_open'},
  'roland garros':{'name':'Roland Garros','surface':'Clay','oddsKey':'tennis_atp_french_open'},
  'wimbledon':{'name':'Wimbledon','surface':'Grass','oddsKey':'tennis_atp_wimbledon'},
  'us open':{'name':'US Open','surface':'Hard','oddsKey':'tennis_atp_us_open'},
  'australian open':{'name':'Australian Open','surface':'Hard','oddsKey':'tennis_atp_aus_open_singles'},
  'madrid':{'name':'Mutua Madrid Open','surface':'Clay','oddsKey':'tennis_atp_madrid_open'},
  'monte carlo':{'name':'Rolex Monte-Carlo Masters','surface':'Clay','oddsKey':'tennis_atp_monte_carlo_masters'},
  'wta rome':{'name':'WTA Italian Open (Rom)','surface':'Clay','oddsKey':'tennis_wta_italian_open'},
  'wta french':{'name':'Roland Garros (WTA)','surface':'Clay','oddsKey':'tennis_wta_french_open'},
};

function detectT(q) {
  const ql = (q||'').toLowerCase();
  for (const [k,v] of Object.entries(TMATCH)) if (ql.includes(k)) return v;
  return TMATCH['rom'];
}

// Fetch h2h + spreads + totals from The Odds API
async function fetchAllOdds(tournament, query, key) {
  if (!key) return null;
  try {
    const markets = 'h2h,spreads,totals';
    const url = `https://api.the-odds-api.com/v4/sports/${tournament.oddsKey}/odds/?apiKey=${key}&regions=eu&markets=${markets}&oddsFormat=decimal`;
    const r = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null;
    const data = await r.json();
    if (!Array.isArray(data) || !data.length) return null;

    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const matched = data.filter(m => {
      const h=(m.home_team||'').toLowerCase(), a=(m.away_team||'').toLowerCase();
      return words.some(w => h.includes(w) || a.includes(w));
    });
    const source = matched.length ? matched : data;

    return source.slice(0, 6).map(m => {
      // Aggregate best odds per market across all bookmakers
      let bestP1Win=0, bestP2Win=0, bestP1WinBook='', bestP2WinBook='';
      let bestSpreadFav=0, bestSpreadFavBook='', spreadFavPoint=0;
      let bestOverOdds=0, bestOverBook='', overLine=0;
      let bestUnderOdds=0, bestUnderBook='', underLine=0;

      const bookComps = [];

      (m.bookmakers||[]).forEach(bm => {
        let o1=0, o2=0;
        (bm.markets||[]).forEach(mkt => {
          if (mkt.key === 'h2h') {
            const p1o = mkt.outcomes?.find(o=>o.name===m.home_team)?.price||0;
            const p2o = mkt.outcomes?.find(o=>o.name===m.away_team)?.price||0;
            if (p1o > bestP1Win) { bestP1Win=p1o; bestP1WinBook=bm.title; }
            if (p2o > bestP2Win) { bestP2Win=p2o; bestP2WinBook=bm.title; }
            o1=p1o; o2=p2o;
          }
          if (mkt.key === 'spreads') {
            // Spread for favorite (negative point = favorite)
            mkt.outcomes?.forEach(o => {
              if (o.point < 0 && o.price > bestSpreadFav) {
                bestSpreadFav = o.price;
                bestSpreadFavBook = bm.title;
                spreadFavPoint = o.point;
              }
            });
          }
          if (mkt.key === 'totals') {
            mkt.outcomes?.forEach(o => {
              if (o.name==='Over' && o.price > bestOverOdds) {
                bestOverOdds=o.price; bestOverBook=bm.title; overLine=o.point;
              }
              if (o.name==='Under' && o.price > bestUnderOdds) {
                bestUnderOdds=o.price; bestUnderBook=bm.title; underLine=o.point;
              }
            });
          }
        });
        if (o1||o2) bookComps.push({name:bm.title, p1:o1?o1.toFixed(2):'—', p2:o2?o2.toFixed(2):'—'});
      });

      const favIsP1 = bestP1Win > 0 && bestP2Win > 0 && bestP1Win < bestP2Win;
      return {
        p1: m.home_team, p2: m.away_team,
        // Win odds
        p1WinOdds: bestP1Win>0 ? bestP1Win.toFixed(2) : null,
        p2WinOdds: bestP2Win>0 ? bestP2Win.toFixed(2) : null,
        p1WinBook: bestP1WinBook, p2WinBook: bestP2WinBook,
        favWinOdds: favIsP1 ? bestP1Win.toFixed(2) : bestP2Win.toFixed(2),
        undWinOdds: favIsP1 ? bestP2Win.toFixed(2) : bestP1Win.toFixed(2),
        favName: favIsP1 ? m.home_team : m.away_team,
        undName: favIsP1 ? m.away_team : m.home_team,
        favWinBook: favIsP1 ? bestP1WinBook : bestP2WinBook,
        undWinBook: favIsP1 ? bestP2WinBook : bestP1WinBook,
        // Spread (handicap)
        spreadFavOdds: bestSpreadFav>0 ? bestSpreadFav.toFixed(2) : null,
        spreadFavBook: bestSpreadFavBook,
        spreadFavPoint: spreadFavPoint,
        // Totals
        overOdds: bestOverOdds>0 ? bestOverOdds.toFixed(2) : null,
        overBook: bestOverBook, overLine,
        underOdds: bestUnderOdds>0 ? bestUnderOdds.toFixed(2) : null,
        underBook: bestUnderBook, underLine,
        // Book table
        books: bookComps
      };
    });
  } catch(e) { return null; }
}

async function fetchRapidStats(playerName, key) {
  if (!key||!playerName) return null;
  try {
    const url = `https://api-tennis.p.rapidapi.com/player/?search=${encodeURIComponent(playerName)}&tour_code=atp`;
    const r = await fetch(url, {
      headers:{'X-RapidAPI-Key':key,'X-RapidAPI-Host':'api-tennis.p.rapidapi.com'},
      signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) return null;
    const sd = await r.json();
    const p = (sd?.result||[])[0];
    if (!p) return null;
    return {rank:p.ranking||null, country:p.player_country||null, hand:p.player_hand||null};
  } catch { return null; }
}

// Build bet recommendations from real odds — market names include actual player names
function buildBetsFromOdds(oddsData) {
  if (!oddsData?.length) return null;
  const m = oddsData[0];
  const favOdds = parseFloat(m.favWinOdds)||0;
  const undOdds = parseFloat(m.undWinOdds)||0;
  if (!favOdds || !undOdds) return null;

  // Shorten names for market labels: "Casper Ruud" → "Ruud"
  const favShort = m.favName?.split(' ').pop() || m.favName || 'Favorit';
  const undShort = m.undName?.split(' ').pop() || m.undName || 'Außenseiter';

  const bets = [];

  // SAFE (1.20–1.40)
  if (favOdds >= 1.20 && favOdds <= 1.40) {
    bets.push({
      type: 'safe',
      bet_odds: favOdds,
      bet_market: `${favShort} Sieg`,
      bet_src: m.favWinBook
    });
  } else if (m.spreadFavOdds) {
    const so = parseFloat(m.spreadFavOdds);
    if (so >= 1.20 && so <= 1.40) {
      bets.push({
        type: 'safe',
        bet_odds: so,
        bet_market: `${favShort} ${Math.abs(m.spreadFavPoint)} Games Handicap`,
        bet_src: m.spreadFavBook
      });
    }
  }

  // VALUE_PLAY (1.41–1.90) — pick best EV option
  const vpCandidates = [];
  if (favOdds >= 1.41 && favOdds <= 1.90)
    vpCandidates.push({ bet_odds: favOdds, bet_market: `${favShort} Sieg`, bet_src: m.favWinBook });
  if (m.spreadFavOdds) {
    const so = parseFloat(m.spreadFavOdds);
    if (so >= 1.41 && so <= 1.90)
      vpCandidates.push({ bet_odds: so, bet_market: `${favShort} ${Math.abs(m.spreadFavPoint)} Games Handicap`, bet_src: m.spreadFavBook });
  }
  if (m.overOdds) {
    const oo = parseFloat(m.overOdds);
    if (oo >= 1.41 && oo <= 1.90)
      vpCandidates.push({ bet_odds: oo, bet_market: `${favShort} vs ${undShort}: Over ${m.overLine} Games`, bet_src: m.overBook });
  }
  if (m.underOdds) {
    const uo = parseFloat(m.underOdds);
    if (uo >= 1.41 && uo <= 1.90)
      vpCandidates.push({ bet_odds: uo, bet_market: `${favShort} vs ${undShort}: Under ${m.underLine} Games`, bet_src: m.underBook });
  }
  if (vpCandidates.length)
    bets.push({ type: 'value_play', ...vpCandidates.sort((a,b) => b.bet_odds - a.bet_odds)[0] });

  // VALUE_BET (1.91+)
  const vbCandidates = [];
  if (undOdds >= 1.91)
    vbCandidates.push({ bet_odds: undOdds, bet_market: `${undShort} Sieg`, bet_src: m.undWinBook });
  if (m.overOdds) {
    const oo = parseFloat(m.overOdds);
    if (oo >= 1.91)
      vbCandidates.push({ bet_odds: oo, bet_market: `${favShort} vs ${undShort}: Over ${m.overLine} Games`, bet_src: m.overBook });
  }
  if (m.underOdds) {
    const uo = parseFloat(m.underOdds);
    if (uo >= 1.91)
      vbCandidates.push({ bet_odds: uo, bet_market: `${favShort} vs ${undShort}: Under ${m.underLine} Games`, bet_src: m.underBook });
  }
  if (vbCandidates.length)
    bets.push({ type: 'value_bet', ...vbCandidates.sort((a,b) => b.bet_odds - a.bet_odds)[0] });

  return bets.length >= 2 ? { bets, match: m } : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const ak=process.env.ANTHROPIC_API_KEY||'';
    const ok=process.env.ODDS_API_KEY||'';
    const rk=process.env.RAPIDAPI_KEY||'';
    return res.status(200).json({
      ok:true,
      anthropic_key_set:ak.length>10, anthropic_key_prefix:ak?ak.slice(0,14)+'...':'NICHT GESETZT',
      odds_key_set:ok.length>5, rapidapi_key_set:rk.length>5,
      apis:{
        'Anthropic Claude':ak?'✅ Aktiv':'❌ Fehlt → ANTHROPIC_API_KEY',
        'The Odds API':ok?'✅ Aktiv (Live-Quoten: h2h + spreads + totals)':'❌ Fehlt → the-odds-api.com → ODDS_API_KEY',
        'RapidAPI Tennis':rk?'✅ Aktiv (Spieler-Stats)':'❌ Fehlt → rapidapi.com → API-Tennis → RAPIDAPI_KEY',
      }
    });
  }

  if (req.method !== 'POST') return res.status(405).json({error:'Only POST'});

  const body = req.body||{};
  const query = (body.query||'').trim();
  const customBet = (body.customBet||'').trim();
  const manualStats = body.playerStats||null;

  const AKEY=process.env.ANTHROPIC_API_KEY||'';
  const OKEY=process.env.ODDS_API_KEY||'';
  const RKEY=process.env.RAPIDAPI_KEY||'';
  if (!AKEY||AKEY.length<10) return res.status(500).json({error:'ANTHROPIC_API_KEY fehlt'});

  const tournament = detectT(query||customBet);
  const today = new Date().toLocaleDateString('de-DE');
  const vsMatch = (query||customBet).match(/(.+?)\s+vs\.?\s+(.+?)(?:\s+atp|\s+wta|\s+beim|\s+@|$)/i);
  const p1name = vsMatch?vsMatch[1].trim():'';
  const p2name = vsMatch?vsMatch[2].trim():'';

  // Fetch everything in parallel
  const [liveOdds, p1Api, p2Api] = await Promise.all([
    fetchAllOdds(tournament, query||customBet, OKEY),
    p1name?fetchRapidStats(p1name,RKEY):Promise.resolve(null),
    p2name?fetchRapidStats(p2name,RKEY):Promise.resolve(null),
  ]);

  // Build real bets from live odds
  const realBets = liveOdds ? buildBetsFromOdds(liveOdds) : null;
  const liveMatch = realBets?.match;

  // Build contexts
  let oddsCtx = '';
  if (liveOdds?.length) {
    const m = liveOdds[0];
    oddsCtx = `\nECHTE LIVE-QUOTEN (The Odds API):
• ${m.p1} Sieg: BESTE Quote = ${m.p1WinOdds} (${m.p1WinBook})
• ${m.p2} Sieg: BESTE Quote = ${m.p2WinOdds} (${m.p2WinBook})
${m.spreadFavOdds?`• Favorit Handicap ${m.spreadFavPoint} Games: ${m.spreadFavOdds} (${m.spreadFavBook})`:''}
${m.overOdds?`• Over ${m.overLine} Games: ${m.overOdds} (${m.overBook})`:''}
${m.underOdds?`• Under ${m.underLine} Games: ${m.underOdds} (${m.underBook})`:''}
FAVORIT: ${m.favName} @ ${m.favWinOdds} | AUSSENSEITER: ${m.undName} @ ${m.undWinOdds}`;
  }

  let betsCtx = '';
  if (realBets) {
    betsCtx = `\nWETT-EMPFEHLUNGEN BASIEREND AUF ECHTEN QUOTEN (PFLICHT zu verwenden):
${realBets.bets.map(b=>`• ${b.type.toUpperCase()}: "${b.bet_market}" @ ${b.bet_odds} (${b.bet_src})`).join('\n')}
Diese bet_odds und bet_market Werte EXAKT so übernehmen!`;
  }

  let statsCtx = '';
  if (manualStats) statsCtx=`\nNUTZER-STATS:\n${JSON.stringify(manualStats,null,2)}`;
  else if (p1Api||p2Api) {
    statsCtx='\nAPI-STATS:';
    if(p1Api) statsCtx+=`\n${p1name}: Rank #${p1Api.rank||'?'}, ${p1Api.country||''}, ${p1Api.hand||''}`;
    if(p2Api) statsCtx+=`\n${p2name}: Rank #${p2Api.rank||'?'}, ${p2Api.country||''}, ${p2Api.hand||''}`;
  }

  // CUSTOM BET
  if (customBet) {
    const sys=`Du bist Tennis-Wettanalyst. Heute: ${today}. Antworte NUR mit JSON-Objekt, keine Backticks.
{"bet_description":"...","verdict":"STARK|SOLIDE|GRENZWERTIG|RISKANT|VERMEIDEN","verdict_color":"green|blue|amber|red","confidence":72,"fair_odds":1.65,"ev_percent":8.5,"pros":["p1","p2","p3"],"cons":["c1","c2"],"analysis":"Detaillierte Analyse","recommendation":"Klare Empfehlung","stake_suggestion":"1-2 Units","key_stat":"Wichtigste Stat"}`;
    try {
      const r=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',headers:{'content-type':'application/json','x-api-key':AKEY,'anthropic-version':'2023-06-01'},
        body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:1500,system:sys,
          messages:[{role:'user',content:`Bewerte: "${customBet}"${oddsCtx}${statsCtx}`}]}),
        signal:AbortSignal.timeout(25000)
      });
      if(!r.ok) throw new Error(`API ${r.status}`);
      const d=await r.json();
      const raw=(d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
      const clean=raw.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').trim();
      const s=clean.indexOf('{'),e=clean.lastIndexOf('}');
      if(s<0||e<0) throw new Error('Kein JSON');
      return res.status(200).json({type:'custom_evaluation',evaluation:JSON.parse(clean.slice(s,e+1))});
    } catch(err){return res.status(500).json({error:err.message});}
  }

  if (!query) return res.status(400).json({error:'Query fehlt'});

  const sys=`Du bist Tennis-Wettanalyst. Heute: ${today}. Turnier: ${tournament.name} (${tournament.surface}).

WICHTIGSTE REGEL: Falls "WETT-EMPFEHLUNGEN BASIEREND AUF ECHTEN QUOTEN" im Kontext vorhanden sind,
übernimm diese bet_odds und bet_market EXAKT. Ändere sie nicht.

REGELN:
1. NUR JSON-Array, keine Backticks
2. Turniername IMMER: "${tournament.name}"
3. 3 Wetten: safe(1.20-1.40), value_play(1.41-1.90), value_bet(1.91+)
4. Falls keine echten Quoten: bet_odds mathematisch korrekt für den Markt
5. EINE Richtung: ein Spieler, ein Markt
6. Analysiere Form, H2H, Belag, Stats ausführlich

JSON:
[{"p1":"Name","p2":"Name","p1_country":"NOR","p2_country":"RUS","p1_rank":8,"p2_rank":21,
"tournament":"${tournament.name}","surface_name":"${tournament.surface}","round":"QF",
"type":"safe","odds":1.29,"bet_odds":1.29,"bet_market":"Ruud Sieg","bet_src":"Bet365","src":"Bet365",
"fairodds":1.18,"ev":9.3,"conf":83,"stake":"3-5 Units","rec_player":"Casper Ruud","h2h_label":"2-1",
"reco":"Ruud Sieg @ 1.29 — Begründung",
"analysis":"5 Sätze konkrete Analyse",
"tags":["16-2 Clay 2026","H2H 2-1"],
"form":88,"surface":91,"h2h":68,"fitness":85,"serve":78,"return":82,"mental":87,"shot":84,
"form2":62,"surface2":48,"fitness2":70,"mental2":65,
"r1":[88,91,68,85,78,82,87,84],"r2":[62,48,72,70,74,65,68,60],
"adv":{"fs":71,"ts":210,"ace":7,"rp":47,"bp":43,"win":31,"ue":19,"net":68,"d3":67},
"adv2":{"fs":65,"ts":215,"ace":9,"rp":39,"bp":28,"win":33,"ue":31,"net":52,"d3":48},
"book":[{"name":"Bet365","p1":"1.29","p2":"3.50","best":"1.29"},{"name":"Betway","p1":"1.31","p2":"3.40","best":"1.31"}]},
{"type":"value_play","bet_odds":ECHTE_QUOTE,"bet_market":"ECHTER_MARKT",...},
{"type":"value_bet","bet_odds":ECHTE_QUOTE,"bet_market":"ECHTER_MARKT",...}]`;

  try {
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'content-type':'application/json','x-api-key':AKEY,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:3000,system:sys,
        messages:[{role:'user',content:`Analysiere: "${query}"${oddsCtx}${betsCtx}${statsCtx}\n3 Wetten, nur JSON.`}]}),
      signal:AbortSignal.timeout(25000)
    });
    if(!r.ok){
      const t=await r.text(); let msg=`Anthropic ${r.status}`;
      try{msg=JSON.parse(t).error?.message||msg;}catch(_){}
      return res.status(500).json({error:msg});
    }
    const d=await r.json();
    const raw=(d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
    const clean=raw.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').trim();
    const s=clean.indexOf('['),e=clean.lastIndexOf(']');
    if(s<0||e<0) return res.status(500).json({error:'Kein JSON',raw:clean.slice(0,200)});
    let matches=JSON.parse(clean.slice(s,e+1));

    // HARD OVERRIDE: inject real odds directly
    if (realBets) {
      const order = {safe:0,value_play:1,value_bet:2};
      matches.sort((a,b)=>(order[a.type]||0)-(order[b.type]||0));
      realBets.bets.forEach(realBet => {
        const m = matches.find(x=>x.type===realBet.type);
        if (m) {
          m.bet_odds = parseFloat(realBet.bet_odds);
          m.bet_market = realBet.bet_market;
          m.bet_src = realBet.bet_src;
          m.src = realBet.bet_src;
          m.ev = parseFloat(((m.conf/100 * m.bet_odds - 1)*100).toFixed(1));
        }
      });
    }

    // Inject player data + tournament name + book data
    matches = matches.map(m => {
      const lm = liveOdds?.find(lo=>{
        const lp1=(lo.p1||'').toLowerCase(),lp2=(lo.p2||'').toLowerCase();
        const mp1=(m.p1||'').toLowerCase().split(' ').pop(),mp2=(m.p2||'').toLowerCase().split(' ').pop();
        return (lp1.includes(mp1)||lp2.includes(mp1))&&(lp1.includes(mp2)||lp2.includes(mp2));
      });
      if(p1Api&&m.p1?.toLowerCase().includes((p1name||'').toLowerCase().split(' ').pop())){
        m.p1_rank=p1Api.rank||m.p1_rank; m.p1_country=p1Api.country||m.p1_country;
      }
      if(p2Api&&m.p2?.toLowerCase().includes((p2name||'').toLowerCase().split(' ').pop())){
        m.p2_rank=p2Api.rank||m.p2_rank; m.p2_country=p2Api.country||m.p2_country;
      }
      return {...m, tournament:tournament.name, surface_name:tournament.surface, book:lm?.books||m.book};
    });

    return res.status(200).json({
      matches,
      live_odds_used:!!(liveOdds?.length),
      real_bets_injected:!!(realBets),
      tournament:tournament.name
    });
  } catch(err){
    return res.status(500).json({error:err.message});
  }
};
