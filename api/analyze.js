export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query, stakeOdds } = req.body || {};
  if (!query) return res.status(400).json({ error: 'Query required' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured. Add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables.' });
  }

  const today = new Date().toLocaleDateString('de-DE');

  const systemPrompt = `Du bist ein professioneller Tennis-Wettanalyst. Analysiere ATP/WTA Tennis Matches und gib strukturierte Wettempfehlungen zurück.

Nutze dein Wissen über aktuelle Spielerform, Rankings, H2H-Bilanzen, Belagstatistiken, Shot Selection, Aufschlag-Stats, Return-Stats, mentale Stärke und typische Marktquoten.

KRITISCH: Antworte NUR mit einem validen JSON-Array. Absolut kein Text davor oder danach, keine Markdown-Backticks, kein Kommentar.

Format (exakt so):
[{"p1":"Name1","p2":"Name2","tournament":"Turnier","surface_name":"Clay","round":"QF","type":"ev_positive","odds":1.85,"src":"Bet365","fairodds":1.65,"ev":12.1,"conf":72,"stake":"1-2 Units","rec_player":"Name1","reco":"Spieler X Sieg @ 1.85 — kurze Begründung","analysis":"Tiefenanalyse mit Form, Belag, H2H, Stats in 3-4 Sätzen","tags":["Tag1","Tag2","Tag3"],"form":82,"surface":75,"h2h":65,"fitness":88,"serve":79,"return":71,"mental":84,"shot":73,"r1":[82,75,65,88,79,71,84,73],"r2":[70,82,80,74,85,68,72,78],"adv":{"fs":68,"ts":214,"ace":8,"rp":43,"bp":38,"win":32,"ue":24,"net":67,"d3":61},"book":[{"name":"Bet365","p1":"1.85","p2":"2.00","best":"1.85"},{"name":"Betway","p1":"1.88","p2":"1.95","best":"1.88"},{"name":"Bwin","p1":"1.82","p2":"2.05","best":"2.05"}]}]

Feldbeschreibungen:
- type: "ev_positive" (EV>5%), "safe" (Konfidenz>70%), "risky" (Außenseiter/hohes Risiko)
- ev = (conf/100 * odds - 1) * 100
- r1/r2: Radar [Form,Belag,H2H,Fitness,Aufschlag,Return,Mental,ShotSelection] 0-100 für p1 bzw p2
- adv: Stats des empfohlenen Spielers: fs=1.Aufschlag%, ts=TopSpeed km/h, ace=Asse/Match, rp=Return%, bp=BreakConv%, win=Winner/Match, ue=UnforcedErrors, net=Netz%, d3=3.SatzWin%
- book: 3 Bookmaker mit realistischen Quoten

Gib genau 3 Wettempfehlungen zurück. Heutiges Datum: ${today}.`;

  const userMsg = `Analysiere ATP/WTA Tennis Wetten für: "${query}".${stakeOdds ? ` Stake.com Quoten: ${stakeOdds}` : ' Nutze realistische aktuelle Marktquoten.'} Antworte nur mit dem JSON-Array.`;

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      let msg = `Anthropic API Fehler ${apiRes.status}`;
      try { msg = JSON.parse(errText)?.error?.message || msg; } catch(_) {}
      return res.status(500).json({ error: msg });
    }

    const data = await apiRes.json();
    const fullText = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    if (!fullText) return res.status(500).json({ error: 'Leere Modellantwort' });

    const cleaned = fullText.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1) {
      return res.status(500).json({ error: 'Kein JSON-Array gefunden', raw: cleaned.slice(0,300) });
    }

    const matches = JSON.parse(cleaned.slice(start, end + 1));
    return res.status(200).json({ matches });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
