# MjamOrga

Mobile-first Webapp für Rezepte, Wochenplan und Einkaufsliste.
HTML, CSS, JavaScript, JSON – kein PHP, keine Datenbank, kein Build-Schritt.

## Starten

Die App braucht einen (beliebigen) Webserver, weil `localStorage` unter `file://`
je nach Browser blockiert wird:

```bash
python3 -m http.server 8000
# danach http://localhost:8000/ öffnen
```

## Aufbau

```
index.html          Markup aller Seiten
manifest.json       PWA-Manifest
css/style.css       Design-System und alle Modul-Styles
js/storage.js       Persistenz (localStorage) + Datums-/Wochenlogik
js/app.js           Anwendungslogik, Rendering, Events
icons/              App-Icons
docs/               Konzept je Modul
```

## Dokumentation

| Datei | Inhalt |
|---|---|
| [docs/00-architektur.md](docs/00-architektur.md) | Stack, Datenmodell, Persistenz, Sicherheit |
| [docs/01-dashboard.md](docs/01-dashboard.md) | Dashboard |
| [docs/02-rezepte.md](docs/02-rezepte.md) | Rezepte |
| [docs/03-wochenplan.md](docs/03-wochenplan.md) | Wochenplan |
| [docs/04-einkaufsliste.md](docs/04-einkaufsliste.md) | Einkaufsliste |

## Daten

Alles liegt im `localStorage` des Browsers, unter drei Schlüsseln:
`mjamorga_rezepte`, `mjamorga_wochenplan`, `mjamorga_einkaufsliste`.
Ein Export/Import ist noch nicht umgesetzt – ein geleerter Browser-Speicher
bedeutet aktuell Datenverlust.
