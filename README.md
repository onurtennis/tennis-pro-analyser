# 🎾 Tennis Pro Analyser

KI-gestütztes Tennis Wett-Analyse Tool mit Live-Quoten, EV-Berechnung und erweiterten Statistiken.

## Features

- **Live-Quoten** automatisch von Oddschecker, Bet365, Protipster
- **Expected Value (EV)** Berechnung für jede Wette
- **Radar-Charts** für direkten Spielervergleich
- **Erweiterte Stats:** Shot Selection, Top-Speed, Return%, Break Conversion, Mental Index
- **Stake.com Quoten** manuell eintragbar
- **Filter** nach EV, Belag, Aufschlag, Return, Mental, Shot Selection
- **ATP & WTA** Unterstützung

---

## Setup auf Vercel (kostenlos, öffentlich zugänglich)

### 1. Repository auf GitHub erstellen

1. Gehe zu [github.com](https://github.com) → **New repository**
2. Name: `tennis-pro-analyser`
3. Visibility: **Public** (für kostenloses GitHub Pages) oder Private
4. Klicke **Create repository**
5. Lade alle Dateien hoch (index.html, api/analyze.js, vercel.json, README.md)

### 2. Anthropic API Key besorgen

1. Gehe zu [console.anthropic.com](https://console.anthropic.com)
2. API Keys → **Create Key**
3. Key kopieren und sicher aufbewahren

### 3. Vercel verbinden

1. Gehe zu [vercel.com](https://vercel.com) → kostenlos mit GitHub anmelden
2. **New Project** → dein GitHub Repository importieren
3. Bei **Environment Variables** hinzufügen:
   - Name: `ANTHROPIC_API_KEY`
   - Value: dein API Key (sk-ant-...)
4. **Deploy** klicken

✅ Fertig! Deine Website ist unter `dein-projekt.vercel.app` erreichbar.

---

## Lokaler Test (optional)

```bash
# Node.js installieren: nodejs.org

# Im Projektordner:
npm install -g vercel
vercel dev
```

Dann `.env` Datei erstellen:
```
ANTHROPIC_API_KEY=sk-ant-dein-key-hier
```

Öffne `http://localhost:3000`

---

## Dateistruktur

```
tennis-pro-analyser/
├── index.html          # Haupt-Interface
├── api/
│   └── analyze.js      # Serverless API (Vercel)
├── vercel.json         # Vercel Konfiguration
└── README.md           # Diese Datei
```

---

## Nutzung

1. Match oder Turnier eingeben, z.B. `"Sinner vs Alcaraz"` oder `"French Open 2026"`
2. Optional: Stake.com Quoten manuell eintragen
3. **Analysieren** klicken
4. Karte aufklappen für Radar-Chart, Stats und Quellen-Vergleich
5. Filter nutzen für gezielte Suche

---

## Wichtiger Hinweis

⚠️ Alle Analysen dienen nur zu Informationszwecken. Sportwetten sind mit finanziellem Risiko verbunden. Spiele verantwortungsvoll. 18+
