# PWA: Installation, Offline-Betrieb, Startanimation

MjamOrga lässt sich auf Android, iPhone und Desktop wie eine App installieren,
startet mit eigenem Icon und eigener Startanimation und funktioniert auch ohne
Netz. Es bleibt dabei eine Website auf GitHub Pages: neue Versionen werden
gepusht, nicht in einem Store veröffentlicht.

---

## Funktionen und technische Umsetzung

### Bausteine

| Datei | Aufgabe |
|---|---|
| `manifest.json` | beschreibt die App: Name, Farben, Startadresse, Icons |
| `sw.js` | Service Worker: hält die App-Hülle offline vor, meldet neue Versionen |
| `js/pwa.js` | registriert den Worker, kümmert sich um Installieren-Knopf und Update-Hinweis |
| `icons/` | ein SVG als Quelle, daraus PNGs in 192, 512 und 180 Pixel |
| `#splash` in `index.html` | Startanimation, inline als SVG |

### Icons

Die Grafik (Teller, Gabel links, Messer rechts) ist eine Vektorzeichnung in
`icons/icon.svg`. Das Emoji der ersten Version ist weg, weil sein Aussehen vom
System abhing und iOS es für den Home-Bildschirm ohnehin ignoriert hat.

| Datei | Größe | Zweck |
|---|---|---|
| `icon-192.png`, `icon-512.png` | 192 / 512 | Android, Desktop, Installationsdialog |
| `icon-maskable-512.png` | 512 | Android-Startbildschirm mit Form-Maske; die Grafik sitzt kleiner in der sicheren Zone |
| `apple-touch-icon.png` | 180 | iPhone-Home-Bildschirm (`<link rel="apple-touch-icon">`) |
| `icon.svg` | beliebig | Browser-Tab, Manifest-Rückfall |

Neu rastern nach Änderung der SVG (ImageMagick, unter WSL über die Windows-Installation):

```bash
magick -background none -density 384 icons/icon.svg -resize 512x512 -depth 8 -strip PNG32:icons/icon-512.png
```

### Service Worker

Strategie **„erst Netz, dann Cache"**: Online kommt immer die aktuelle Version
von GitHub Pages, der Cache greift nur ohne Netz. Das passt zum Abwärtsschutz in
[09-datensicherung.md](09-datensicherung.md): Eine veraltete Hülle wird nie
bevorzugt.

Der Worker behandelt ausschließlich GET-Anfragen an die eigene Herkunft und an
das Firebase-SDK auf `www.gstatic.com`. **Firestore und die Anmeldung laufen am
Worker vorbei**, sie haben ihren eigenen Offline-Puffer in IndexedDB. Fremde
Rezeptbilder ebenfalls.

Beim Installieren lädt er die App-Hülle vor (`HUELLE` in `sw.js`); das SDK vom
CDN nur nach Möglichkeit, damit eine Installation ohne Netz daran nicht
scheitert. Beim Aktivieren räumt er alle Caches mit anderem Namen weg.

Ohne Netz und ohne Cache-Treffer bei einer Navigation liefert er `index.html`
aus dem Cache. Die App startet damit immer, die Daten kommen aus `localStorage`.

**Bei jeder Veröffentlichung `CACHE_VERSION` in `sw.js` erhöhen.** Der Browser
erkennt den neuen Worker am geänderten Dateiinhalt; die neue Nummer sorgt dafür,
dass die Hülle frisch vorgeladen und der alte Cache gelöscht wird. Vergisst man
das, funktioniert online weiterhin alles (Netz zuerst), nur der Offline-Stand
bleibt älter.

### Neue Version

Eine installierte PWA bleibt oft tagelang geöffnet. Damit sie nicht auf einem
alten Stand hängen bleibt:

1. Bei jeder Rückkehr in die App (`visibilitychange`) fragt `pwa.js` nach einem
   neuen Worker.
2. Hat ein neuer Worker installiert, während noch ein alter die Seite steuert,
   erscheint oben das gelbe Banner **„Eine neue Version von MjamOrga ist da"**
   mit dem Knopf **Jetzt laden**.
3. Der Knopf lädt die Seite neu, der neue Worker ist dann aktiv.

Beim allerersten Besuch gibt es keinen alten Worker, also auch kein Banner.

### Installation

**Android und Desktop (Chrome, Edge):** Der Browser meldet `beforeinstallprompt`.
`pwa.js` fängt das ab und meldet `installierbar`; das Dashboard zeigt dann eine
Karte mit dem Knopf **App installieren**. Nach der Installation verschwindet die
Karte (`appinstalled`).

**iPhone und iPad:** Es gibt keine Schnittstelle dafür. Das Dashboard zeigt
stattdessen die Anleitung „Teilen, dann Zum Home-Bildschirm". Das ist auf dem
iPhone mehr als Komfort: Safari löscht Website-Daten nach sieben Tagen ohne
Nutzung, installierte Apps sind davon ausgenommen.

Läuft die App bereits installiert (`display-mode: standalone`), erscheint keine
Karte.

### Startanimation

Beim Laden liegt ein Vollbild in Gelb über der App: der Teller mit Besteck,
darunter der Schriftzug. Gabel und Messer wandern zur Tellermitte, kreuzen sich
dort (±30°), verharren kurz und kehren an ihren Platz zurück. Der Name blendet
währenddessen ein. Nach etwa 1,9 Sekunden blendet das Vollbild aus, ein Tipp
darauf beendet es sofort.

Umsetzung rein in CSS: Die Besteck-Gruppen im inline-SVG tragen
`transform-box: fill-box` und `transform-origin: center`, damit sie sich um ihre
eigene Mitte drehen; die Keyframes verschieben sie um 66 Pixel im SVG-Raster zur
Tellermitte. Das gleiche SVG dient als Vorlage für die Icons.

Bei `prefers-reduced-motion` gibt es keine Bewegung, das Vollbild verschwindet
nach einer halben Sekunde.

### Ablauf beim Start

```
index.html ──▶ storage.js ──▶ app.js (Splash startet, Dashboard rendert)
                                  │
firebase-config.js ──▶ sync.js (Modul, vom CDN)     pwa.js (Worker, Installations-Zustand)
                                  │                       │
                                  └── beiSyncStatus ──────┴── "pwa-status" ──▶ app.js rendert Dashboard-Karten
```

`app.js` kennt keine Browser-Schnittstellen der PWA. Es hört nur auf das
DOM-Ereignis `pwa-status` und liest `window.MjamPwa.zustand`. So bleibt es
testbar ohne Service Worker.

---

## Verbesserungen

**Vorschau der Startanimation ohne Neuladen.** Für Feinschliff an Dauer und
Kurve wäre ein verstecktes Auslösen (etwa fünfmal auf den Schriftzug tippen)
praktisch. Nicht gebaut, weil es nur bei der Entwicklung hilft.

**Cache-Version aus der Git-Revision.** Ein Pre-Commit-Hook könnte
`CACHE_VERSION` automatisch setzen. Bis dahin ist es ein Punkt auf der
Veröffentlichungs-Checkliste.

**Push-Benachrichtigungen.** Der Worker wäre die Grundlage dafür („Einkaufsliste
wurde geändert"). Braucht einen Server für den Versand und ist deshalb im
gleichen Topf wie die Google-Kopplung in der Roadmap.
