# MjamOrga

Mobile-first Webapp für Rezepte, Wochenplan, Einkaufsliste und freie Listen.
HTML, CSS, JavaScript, JSON – kein PHP, kein Build-Schritt.
Optional: Live-Sync zwischen Geräten über Firebase Firestore (kostenloser Tarif).

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
js/storage.js       Persistenz (localStorage) + Sync-Drehscheibe + Datums-/Wochen-/Listenlogik
js/app.js           Anwendungslogik, Rendering, Events
js/sync.js          Live-Sync über Firestore (ES-Modul, optional)
js/pwa.js           Service-Worker-Registrierung, Installieren, Update-Hinweis
sw.js               Service Worker: App-Hülle offline, Cache-Version je Release
js/firebase-config.js  Firebase-Projektdaten (leer = Sync aus)
firestore.rules     Sicherheitsregeln für die Firebase-Konsole
icons/              App-Icons (SVG-Quelle und gerasterte PNGs)
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
| [docs/05-sync.md](docs/05-sync.md) | Live-Sync: Einrichtung in Firebase, Bedienung, Grenzen |
| [docs/06-roadmap.md](docs/06-roadmap.md) | Geplantes Modul Kalender, Google-Kopplung, offene Punkte |
| [docs/07-listen.md](docs/07-listen.md) | Listen |
| [docs/08-navigation.md](docs/08-navigation.md) | Navigation mit zwei Ebenen |
| [docs/09-datensicherung.md](docs/09-datensicherung.md) | Export/Import, Schema-Version, Migrationskette |
| [docs/10-pwa.md](docs/10-pwa.md) | Installation als App, Offline-Betrieb, Startanimation |

## Daten

Alles liegt im `localStorage` des Browsers, unter fünf Schlüsseln:
`mjamorga_rezepte`, `mjamorga_wochenplan`, `mjamorga_einkaufsliste`, `mjamorga_listen`, `mjamorga_kategorien`.
Mit eingerichtetem Live-Sync werden dieselben fünf Bereiche zusätzlich in Firestore gehalten.
Jeder Bereich trägt eine Schema-Version; ältere Daten werden beim Laden migriert.
Über 💾 auf dem Dashboard lassen sich alle Daten als JSON sichern und wieder laden.
