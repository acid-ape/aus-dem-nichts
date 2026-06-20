# Aus dem Nichts

Ein Browser-Aufbauspiel (Idle / Village-Builder) im Tiny-Swords-Pixel-Look.
Man läuft durch die Welt, sammelt Ressourcen, bringt sie ins Dorf, kauft Upgrades
(Held- und Dorf-Pfad) und steigt durch die Zeitalter auf (Bäuerliches Gut → Dorf →
Burg → Manufaktur → Dampfzeit). Reines Vanilla-JS auf einem `<canvas>`, kein Build-Schritt.

## Vision: Tag/Nacht (geplant)
Das Spiel wird in zwei Phasen wachsen:
- **Tag (Idle):** sammeln, upgraden, Verteidigungstürme bauen/aufrüsten.
- **Nacht (Tower-Defense):** Monster-Wellen abwehren.

Erst wird die **Tag-Phase** voll fertig (Idle/Upgrade-Teil), **dann** die Nacht-Phase —
die Architektur wird aber schon jetzt darauf vorbereitet. Details & Roadmap:
[`docs/research-round-2.md`](docs/research-round-2.md) (Abschnitt 8).

## Spielen / Starten
- Einfach `index.html` in einem Browser öffnen — keine Abhängigkeiten, kein Build.
- Oder über einen beliebigen statischen Webserver ausliefern (das Spiel lädt seine
  Assets relativ aus `ts/`).

## Struktur
```
index.html            Das ganze Spiel (HTML + CSS + JS in einer Datei)
ts/                   Grafik-Assets (Tiny Swords) + abgeleitete Sprites/Icons/Texturen
ts/icons/             Ressourcen-/Gebäude-Icons für die UI
docs/                 Recherche- & Design-Dokumente (Genre-Analyse, Roadmap)
tools/gametest/       Headless-Screenshot-Test (Puppeteer gegen Chrome)
```

## Tests
Headless-Browser-Test, der das laufende Spiel lädt, verschiedene Zustände anfährt,
Screenshots schiesst und JS-Fehler/404s abfängt:
```
cd tools/gametest
npm install            # puppeteer-core (nutzt installiertes Chrome)
node shoot.js [url] [phone|desktop]
```

## Credits / Lizenz
Grafik: **"Tiny Swords" von Pixel Frog** (https://pixelfrog-assets.itch.io/tiny-swords),
frei nutzbar inkl. kommerziell. Siehe [`ts/CREDITS.txt`](ts/CREDITS.txt).
Spiel-Code: privat.
