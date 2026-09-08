# MjamOrga – Architektur & Datenhaltung

Übergreifende Grundlage für alle Module. Jedes Modul hat zusätzlich eine eigene Datei
in diesem Ordner.

---

## Funktionen und technische Umsetzung

### Technologiestack

| Bereich | Umsetzung |
|---|---|
| Markup | HTML5, eine einzige `index.html` (Single-Page, keine Seitenwechsel) |
| Styling | Reines CSS mit Custom Properties (`:root`-Variablen), mobile-first |
| Logik | Vanilla JavaScript (ES2020+), keine Frameworks, keine Build-Tools |
| Daten | JSON-Strukturen, persistiert in `localStorage` |
| Backend | keines für die App selbst; optional Firebase Firestore als Datenspeicher für den Geräte-Sync (siehe [05-sync.md](05-sync.md)) |

Kein PHP, keine Datenbank, kein Bundler. Die App ist durch simples Öffnen der
`index.html` bzw. über einen beliebigen Static-Webserver lauffähig.

### Dateistruktur

```
mjamorga/
├── index.html          Gesamtes Markup aller Seiten (Sections)
├── manifest.json       PWA-Manifest (Home-Screen, vorbereitet)
├── css/
│   └── style.css       Design-System + alle Modul-Styles
├── firestore.rules     Sicherheitsregeln für den optionalen Sync
├── js/
│   ├── storage.js      Persistenz-Layer + Sync-Drehscheibe + Datums-/Wochenlogik
│   ├── app.js          Anwendungslogik, Rendering, Events
│   ├── sync.js         Firestore-Adapter (ES-Modul, optional)
│   └── firebase-config.js  Projektdaten aus der Firebase-Konsole
└── docs/               Diese Konzeptdokumentation
```

Die Trennung `storage.js` / `app.js` ist bewusst: `storage.js` kennt nur Daten,
`app.js` kennt nur die Oberfläche. Der Geräte-Sync ist genau so eingehängt:
`sync.js` registriert sich bei `storage.js`, `app.js` hört nur auf
`beiExternerAenderung()` und `beiSyncStatus()`, ohne Firebase zu kennen.

### Persistenz

Drei getrennte `localStorage`-Schlüssel, je Modul einer:

| Schlüssel | Inhalt | Typ |
|---|---|---|
| `mjamorga_rezepte` | alle Rezepte | Array |
| `mjamorga_wochenplan` | alle Wochen | Objekt, Schlüssel = Montagsdatum |
| `mjamorga_einkaufsliste` | alle Produkte | Array |

Getrennte Schlüssel statt eines großen Objekts, damit ein Schreibvorgang in einem
Modul die anderen Module nicht anfasst und ein defekter Eintrag nicht die
gesamte App unbrauchbar macht. Jeder Lese-/Schreibzugriff ist in `try/catch`
gekapselt und liefert im Fehlerfall eine leere Standardstruktur zurück.

### Datenmodell

```json
{
  "rezepte": [
    {
      "id": "m1a2b3c4d",
      "titel": "Spaghetti Bolognese",
      "link": "https://example.com/rezept",
      "text": "Zubereitung ...",
      "zutaten": ["500 g Nudeln", "2 Dosen Tomaten", "1 Zwiebel"],
      "bewertung": 5,
      "bildUrl": "https://example.com/bild.jpg",
      "bildQuelle": "manuell",
      "erstellt": "2026-09-07T18:00:00.000Z",
      "geaendert": "2026-09-07T18:00:00.000Z"
    }
  ],

  "wochenplan": {
    "2026-09-07": {
      "0": { "text": "", "rezeptId": "m1a2b3c4d" },
      "1": { "text": "Pizza bestellen", "rezeptId": null }
    }
  },

  "einkaufsliste": [
    {
      "id": "p9x8y7z6",
      "name": "500 g Nudeln",
      "kategorie": "Vorräte",
      "erledigt": false,
      "erstellt": "2026-09-07T18:05:00.000Z"
    }
  ]
}
```

**Kernprinzipien des Modells**

1. **IDs statt Kopien.** Ein Wochentag speichert bei einem verknüpften Rezept nur
   dessen `rezeptId`. Titel, Bewertung und Bild werden zur Anzeigezeit aus dem
   Rezeptmodul nachgeschlagen. Ändert sich ein Rezept, ändern sich Wochenplan und
   Dashboard automatisch mit.
2. **Eine Mahlzeit je Tag, ein Feldpaar.** Ein Wochentag hat `text` **oder**
   `rezeptId` – nie beides aktiv. Ist `rezeptId` gesetzt, gewinnt die
   Verknüpfung; `text` bleibt als Fallback erhalten, falls die Verknüpfung
   gelöst wird.
3. **Wochenschlüssel = ISO-Datum des Montags** (`YYYY-MM-DD`). Dadurch sind
   Wochen allein durch String-Sortierung chronologisch sortierbar
   (`b.localeCompare(a)` = neueste zuerst), ohne Datumsobjekte zu vergleichen.
4. **Tagesindex 0–6 = Montag–Sonntag**, unabhängig von `Date.getDay()`
   (dort ist 0 = Sonntag). Die Umrechnung passiert an genau einer Stelle in
   `storage.js`.

### Wochenlogik

`DatenSpeicher.getWochenKey(datum)` rechnet ein beliebiges Datum auf den Montag
seiner Woche zurück und liefert den Schlüssel. Beim Öffnen des Wochenplans wird
geprüft, ob für `getAktuelleWoche()` bereits ein Eintrag existiert – falls nicht,
wird eine leere Woche erzeugt und gespeichert. Damit entsteht der Wochenwechsel
automatisch beim ersten Aufruf in der neuen Woche, ganz ohne Hintergrundjob.

Die Schlüssel werden lokal (nicht in UTC) gebildet, damit ein Aufruf um 23:30 Uhr
nicht in der Vorwoche landet.

### Navigation & Seitenmodell

Alle Bereiche liegen als `<section class="page">` gleichzeitig im DOM; sichtbar
ist immer nur die Section mit der Klasse `active`. `zeigeSeite(name)` schaltet um
und stößt das Rendering des Zielbereichs an. Die beiden Unterseiten
*Rezept-Detail* und *Rezept-Formular* sind ebenfalls solche Sections, erscheinen
aber nicht in der Bottom-Navigation.

### Rendering

Kein virtuelles DOM. Jede Ansicht wird über eine `rendere*()`-Funktion aus dem
aktuellen Datenstand als HTML-String neu aufgebaut und per `innerHTML` gesetzt.
Bei der erwarteten Datenmenge (einige hundert Einträge) ist das schnell genug und
hält die Logik in einer Richtung: **Daten → Ansicht**.

Jeder von Benutzern eingegebene Wert wird vor dem Einsetzen durch `escapeHtml()`
geschickt.

### Sicherheit

- Alle Freitextfelder werden beim Rendern escaped (XSS-Schutz).
- Externe Links: `target="_blank"` immer zusammen mit `rel="noopener"`.
- Vor dem Speichern eines Links wird das Schema geprüft – nur `http:` und
  `https:` sind zulässig, um `javascript:`-URLs auszuschließen.

---

## Verbesserungen

**Entschieden: eine Mahlzeit pro Tag.** Abschnitt 3 (Dashboard) nennt drei
Mahlzeiten, Abschnitt 8 (Wochenplan) ein Eingabefeld pro Wochentag. Festgelegt
ist die einfachere Variante: **ein Eintrag je Wochentag**. Das Dashboard zeigt
entsprechend eine „Heute“-Karte statt drei Mahlzeiten-Karten. Sollten später
mehrere Mahlzeiten nötig werden, ist die Migration schmal – aus
`{ text, rezeptId }` wird `{ mittagessen: { text, rezeptId }, ... }`, verarbeitet
über die unten empfohlene Schema-Version.

**Zentrale Speichergrenze beachten.** `localStorage` fasst rund 5 MB. Solange nur
Bild-*URLs* referenziert werden, ist das unkritisch. Sobald hochgeladene Bilder
als Data-URL abgelegt würden, ist die Grenze schnell erreicht – dafür wäre
IndexedDB der richtige Schritt. Bis dahin sollte ein fehlgeschlagenes Speichern
(`QuotaExceededError`) dem Benutzer als Toast gemeldet werden, statt still zu
scheitern.

**Export / Import als JSON.** Ein Button „Daten sichern“ (Download aller drei
Schlüssel als eine `.json`) und „Daten laden“ ist mit wenigen Zeilen umsetzbar und
löst das größte Risiko der reinen Client-Speicherung: geleerter Browser-Cache =
Datenverlust. Das ist die wichtigste Ergänzung vor jeder Komfortfunktion.

**Schema-Version mitschreiben.** Ein Feld `version` je Schlüssel erlaubt später
Migrationen (z. B. ein Feld pro Tag → drei Mahlzeiten), ohne Altdaten zu verlieren.

**Datenzugriff über kleine Helfer bündeln.** `findeRezept(id)` existiert bereits;
analog sinnvoll: `getTag(wochenKey, index)`, `setzeTag(...)`. Das hält die
Struktur des Wochenplans an einer Stelle und erleichtert eine spätere Umstellung.

**Verwaiste Verknüpfungen abfangen.** Beim Löschen eines Rezepts werden bereits
alle `rezeptId`-Verweise im Wochenplan geleert. Zusätzlich sollte das Rendering
defensiv sein: Verweist eine ID auf kein vorhandenes Rezept, wird der Eintrag als
neutraler Text dargestellt statt zu verschwinden.

**Punktuelles Rendering statt Voll-Neuaufbau.** Beim Abhaken eines Produkts genügt
das Umschalten einer CSS-Klasse an der betroffenen Zeile. Das erhält die
Scrollposition und den Fokus – bei langen Einkaufslisten spürbar.

**Später: Service Worker.** Für echten Offline-Betrieb (Abschnitt 22) reicht ein
kleiner Cache-First-Worker für die statischen Dateien. Erst sinnvoll, wenn das
Grundsystem steht.
