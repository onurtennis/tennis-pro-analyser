export const config = { api: { bodyParser: true } };

// Sport-Keys für The Odds API
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
  return 'tennis_atp_italian_open'; // default
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

    // Versuche Match zu Spieler-Query zu matchen
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

      // Sammle alle bookmakers für Vergleich
      const bookComparisons = (match.bookmakers || []).slice(0, 4).map(bm => {
        const mkt = bm.markets?.find(m => m.key === 'h2h');
        const out = mkt?.outcomes || [];
        const o1 = out.find(o => o.name === match.home_team)?.price?.toFixed(2);
        const o2 = out.find(o => o.name === match.away_team)?.price?.toFixed(2);
        const best = Math.max(parseFloat(o1)||0, parseFloat(o2)||0).toFixed(2);
        return { name: bm.title, p1: o1 || '—', p2: o2 || '—', best };
      }).filter(b => b.p1 !== '—');

      return {
        p1: match.home_team,
        p2: match.away_team,
        commence: match.commence_time,
        sport_key: match.sport_key,
        p1odds: p1odds?.toFixed(2),
        p2odds: p2odds?.toFixed(2),
        bookmaker: bookmaker?.title || 'Bet365',
        bookComparisons
      };
    });
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET = Diagnose
  if (req.method === 'GET') {
    const anthKey = process.env.ANTHROPIC_API_KEY || '';
    const oddsKey = process.env.ODDS_API_KEY || '';
    return res.status(200).json({
      ok: true,
      anthropic_key_set: anthKey.length > 0,
      anthropic_key_prefix: anthKey.length > 0 ? anthKey.slice(0, 14) + '...' : 'NICHT GESETZT',
      odds_api_key_set: oddsKey.length > 0,
      odds_api_key_prefix: oddsKey.length > 0 ? oddsKey.slice(0, 8) + '...' : 'NICHT GESETZT (optional)',
      node: process.version,
      time: new Date().toISOString()
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

  // Echte Live-Quoten holen
  const liveOdds = await fetchLiveOdds(query, ODDS_KEY);
  const today = new Date().toLocaleDateString('de-DE');

  let oddsContext = '';
  if (liveOdds && liveOdds.length > 0) {
    oddsContext = `\n\nECHTE LIVE-QUOTEN von The Odds API (Stand: heute):\n${liveOdds.map(m =>
      `- ${m.p1} vs ${m.p2}: ${m.p1}@${m.p1odds} / ${m.p2}@${m.p2odds} (${m.bookmaker})`
    ).join('\n')}\n\nNutze AUSSCHLIESSLICH diese echten Quoten. Erfinde keine Quoten.`;
  } else if (stakeOdds) {
    oddsContext = `\n\nStake.com Quoten vom Nutzer: ${stakeOdds}. Nutze diese für die EV-Berechnung.`;
  } else {
    oddsContext = `\n\nKeine Live-Quoten verfügbar. Schätze realistische Quoten basierend auf Spielerform und Rankings. WICHTIG: Erfinde keine falschen Turniernamen — nutze nur Informationen die du sicher kennst.`;
  }

  const system = `Du bist ein professioneller Tennis-Wettanalyst. Heute ist: ${today}.

KRITISCHE REGELN:
1. Antworte NUR mit einem validen JSON-Array — kein Text davor/danach, keine Backticks
2. Nutze NUR echte Daten aus dem Kontext. Wenn echte Quoten vorhanden sind, nutze DIESE
3. Schreibe KORREKTE Turniernamen — wenn die Anfrage "Rom" oder "Italian Open" ist, schreibe "ATP Italian Open Rome", NICHT "Roland Garros"
4. Falls du ein Match nicht kennst, schreibe trotzdem korrekte Basis-Infos basierend auf dem Query

JSON-Format (exakt, alle Felder):
[{"p1":"Spieler1","p2":"Spieler2","tournament":"Korrekter Turniername","surface_name":"Clay","round":"QF","type":"ev_positive","odds":1.85,"src":"Bet365","fairodds":1.65,"ev":12.1,"conf":72,"stake":"1-2 Units","rec_player":"Spieler1","reco":"Empfehlung @ Quote — Begründung","analysis":"Analyse: Form, Belag, H2H, Stats","tags":["Tag1","Tag2","Tag3"],"form":82,"surface":75,"h2h":65,"fitness":88,"serve":79,"return":71,"mental":84,"shot":73,"r1":[82,75,65,88,79,71,84,73],"r2":[70,82,80,74,85,68,72,78],"adv":{"fs":68,"ts":214,"ace":8,"rp":43,"bp":38,"win":32,"ue":24,"net":67,"d3":61},"book":[{"name":"Bet365","p1":"1.85","p2":"2.00","best":"1.85"},{"name":"Betway","p1":"1.88","p2":"1.95","best":"1.88"},{"name":"Bwin","p1":"1.82","p2":"2.05","best":"2.05"}]}]

type: "ev_positive"=EV>5%, "safe"=Konfidenz>70%, "risky"=Außenseiter
ev=(conf/100*odds-1)*100
r1/r2=[Form,Belag,H2H,Fitness,Aufschlag,Return,Mental,ShotSel] 0-100`;

  const userMsg = `Analysiere: "${query}"${oddsContext}\n\nGib 3 Wettempfehlungen zurück. Nur JSON-Array.`;

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
    const raw = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const s = clean.indexOf('['), e = clean.lastIndexOf(']');
    if (s < 0 || e < 0) return res.status(500).json({ error: 'Kein JSON', raw: clean.slice(0, 300) });

    let matches = JSON.parse(clean.slice(s, e + 1));

    // Live-Quoten nachträglich einsetzen falls vorhanden
    if (liveOdds && liveOdds.length > 0) {
      matches = matches.map(m => {
        const live = liveOdds.find(lo => {
          const p1 = (lo.p1 || '').toLowerCase();
          const p2 = (lo.p2 || '').toLowerCase();
          const mp1 = (m.p1 || '').toLowerCase().split(' ').pop();
          const mp2 = (m.p2 || '').toLowerCase().split(' ').pop();
          return (p1.includes(mp1) || p2.includes(mp1)) && (p1.includes(mp2) || p2.includes(mp2));
        });
        if (live) {
          const favOdds = parseFloat(live.p1odds) < parseFloat(live.p2odds) ? live.p1odds : live.p2odds;
          return {
            ...m,
            odds: parseFloat(favOdds) || m.odds,
            src: live.bookmaker,
            book: live.bookComparisons.length > 0 ? live.bookComparisons : m.book,
            live_data: true
          };
        }
        return m;
      });
    }

    return res.status(200).json({ matches, live_odds_used: !!(liveOdds && liveOdds.length > 0) });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
