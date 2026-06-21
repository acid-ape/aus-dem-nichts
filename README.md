# Aus dem Nichts

Ein Browser-Aufbauspiel (Idle / Village-Builder + leichte Tower-Defense) im
Tiny-Swords-Pixel-Look. Man läuft durch die Welt, sammelt Ressourcen, bringt sie ins
Dorf, kauft Upgrades (Held- und Dorf-Pfad), steigt durch **7 Stufen** auf, baut
Kampf-Türme und verteidigt das Dorf in **Nacht-Wellen**. Reines Vanilla-JS auf einem
`<canvas>`, kein Build-Schritt — das ganze Spiel steckt in `index.html`.

## Spielablauf
- **Onboarding:** Titel → Story-Intro (der „Älteste") → Klassenwahl (Krieger / Bogen­
  schütze / Lanzenträger, je ein Bonus) → 4-Buchstaben-Namenskürzel → interaktives
  Tutorial.
- **Tag (Idle):** sammeln, abladen, Held & Dorf upgraden, Gebäude (Holzfäller,
  Steinbruch, Schmiede, Juwelier, Goldmine, Waffenkammer) und Außenposten-Sammler
  (Kürbis, Pilze, Beeren) bauen, Stufen aufsteigen, Türme bauen/aufrüsten.
- **Nacht (Tower-Defense):** ab Stufe 4 verlangt jeder gating-relevante Aufstieg eine
  überstandene Nacht. Gegner-Wellen stürmen das Hauptgebäude; Held + Türme verteidigen,
  sonst sinkt die Dorf-Lebensleiste. Dorf heilen mit Pilzen.

## Spielen / Starten
- `index.html` in einem Browser öffnen — keine Abhängigkeiten, kein Build.
- Oder über einen statischen Webserver ausliefern (Assets laden relativ aus `ts/`).
- Live via GitHub Pages.

## Struktur
```
index.html            Das ganze Spiel (HTML + CSS + JS in einer Datei)
ts/                   Tiny-Swords-Assets + abgeleitete Sprites + 3 BGM-Tracks (CC0)
ts/icons/             Ressourcen-/Gebäude-Icons für die UI
ts/u/                 Animierte Unit-Strips + Charakter-Portraits
tools/gametest/       Headless-Screenshot-Test (Puppeteer gegen Chrome)
```

## Tests
Headless-Browser-Test, der das laufende Spiel lädt, Zustände anfährt, Screenshots
schießt und JS-Fehler/404s sowie ~87 Asserts prüft:
```
cd tools/gametest
npm install            # puppeteer-core (nutzt installiertes Chrome)
node shoot.js [url] [phone|desktop]
```

## Credits / Lizenz
Grafik: **„Tiny Swords" von Pixel Frog** (https://pixelfrog-assets.itch.io/tiny-swords),
frei nutzbar inkl. kommerziell. Titel-Schrift: **MedievalSharp** (Google Fonts, OFL).
Musik: 3 CC0-Tracks. Siehe [`ts/CREDITS.txt`](ts/CREDITS.txt). Spiel-Code: privat.
