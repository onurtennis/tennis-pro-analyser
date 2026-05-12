export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query, stakeOdds } = req.body;
  if (!query) return res.status(400).json({ error: 'Query required' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not configured' });

  const systemPrompt = `Du bist ein professioneller Tennis-Wettanalyst mit Zugang zu Live-Quoten und Statistiken.

Analysiere ATP/WTA Tennis Matches und gib strukturierte Wettempfehlungen zurück.

WICHTIG:
- Suche nach echten aktuellen Quoten von Oddschecker, Bet365, Betway, Tipico, Bwin
- Analysiere Form, Belag, H2H, Fitness, Shot Selection, Aufschlag-Speed, Return-Stats
- Berechne Expected Value: EV% = (Gewinnwahrscheinlichkeit × Quote - 1) × 100
- Positive EV = mathematischer Vorteil für den Wetter

Antworte NUR mit einem validen JSON-Array ohne Markdown-Backticks. Format:
[
  {
    "p1": "Spieler 1 Name",
    "p2": "Spieler 2 Name",
    "tournament": "Turniername",
    "surface_name": "Clay/Grass/Hard",
    "round": "QF/SF/F/R16 etc.",
    "type": "ev_positive|safe|risky",
    "odds": 1.85,
    "src": "Bet365",
    "fairodds": 1.65,
    "ev": 12.1,
    "conf": 72,
    "stake": "1-2 Units",
    "rec_player": "Empfohlener Spieler",
    "reco": "Konkrete Wettempfehlung mit Begründung",
    "analysis": "2-3 Sätze Tiefenanalyse mit konkreten Stats",
    "tags": ["Faktor 1", "Faktor 2", "Faktor 3"],
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
      "fs": 68,
      "ts": 214,
      "ace": 8.2,
      "rp": 43,
      "bp": 38,
      "win": 32,
      "ue": 24,
      "net": 67,
      "d3": 61
    },
    "book": [
      { "name": "Bet365", "p1": "1.85", "p2": "2.00", "best": "1.85" },
      { "name": "Betway", "p1": "1.88", "p2": "1.95", "best": "1.88" },
      { "name": "Bwin", "p1": "1.82", "p2": "2.05", "best": "2.05" }
    ]
  }
]

r1 und r2 sind Radar-Werte für [Form, Belag, H2H, Fitness, Aufschlag, Return, Mental, Shot Selection].
Gib 2-4 Matches zurück. Nutze echte aktuelle Daten. Heutiges Datum: ${new Date().toLocaleDateString('de-DE')}.`;

  const userMsg = `Analysiere ATP/WTA Tennis Wetten für: "${query}".${stakeOdds ? ` Stake.com Quoten vom Nutzer: ${stakeOdds}` : ' Suche aktuelle Quoten automatisch.'} Nutze Web-Suche für aktuelle Matches, Quoten und Statistiken.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'Anthropic API error', details: err });
    }

    const data = await response.json();
    const fullText = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    let cleaned = fullText.replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1) throw new Error('No JSON array found');
    cleaned = cleaned.slice(start, end + 1);

    const matches = JSON.parse(cleaned);
    return res.status(200).json({ matches });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
