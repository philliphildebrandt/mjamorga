# Modul: Dashboard

Startseite von MjamOrga. Zeigt auf einen Blick, was heute ansteht.

---

## Funktionen und technische Umsetzung

### Funktionsumfang

1. Anzeige des aktuellen **Wochentags** (z. B. „Montag“)
2. Anzeige des **aktuellen Datums** in ausgeschriebener deutscher Form
   (z. B. „7. September 2026“)
3. Anzeige des **heute geplanten Essens** aus dem Wochenplan
4. Ist ein **Rezept verknüpft**, wird der Eintrag mit Sternebewertung
   dargestellt und öffnet beim Antippen direkt die Rezept-Detailansicht
5. Ist nichts geplant, erscheint die Karte neutral als „Noch nichts geplant“

> **Festlegung:** ein Eintrag pro Tag. Das Dashboard zeigt deshalb eine
> „Heute“-Karte, keine getrennten Karten für Frühstück, Mittag- und Abendessen.

### Kein eigener Datenbestand

Das Dashboard besitzt **keine eigenen Daten**. Es ist eine reine Leseansicht auf
den Wochenplan und – über die Rezept-ID – auf das Rezeptmodul. Damit gibt es
keine Synchronisation und keine doppelte Wahrheit: Eine Änderung im Wochenplan
ist beim nächsten Öffnen des Dashboards sofort sichtbar.

### Datenermittlung

```js
const heute         = new Date();
const wochenKey     = DatenSpeicher.getAktuelleWoche();   // "2026-09-07"
const heutigerIndex = DatenSpeicher.getHeutigerIndex();   // 0 = Montag … 6 = Sonntag
const tag           = (daten.wochenplan[wochenKey] || {})[heutigerIndex] || {};
```

`getHeutigerIndex()` rechnet `Date.getDay()` (0 = Sonntag) auf die
Montag-basierte Zählung um: `tag === 0 ? 6 : tag - 1`. Diese Umrechnung existiert
bewusst nur an dieser einen Stelle in `storage.js`.

Auswertungsreihenfolge für die Anzeige:

| Zustand | Darstellung |
|---|---|
| `rezeptId` gesetzt und Rezept vorhanden | Titel + Sterne, anklickbar |
| `rezeptId` gesetzt, Rezept gelöscht | `text` bzw. neutraler Hinweis, nicht anklickbar |
| nur `text` gefüllt | Freitext, nicht anklickbar |
| beides leer | „Noch nichts geplant“, gedämpft und kursiv |

### Datumsformatierung

Über die native Intl-Schnittstelle, ohne zusätzliche Bibliothek. Der Wochentag
steht bereits als eigene Zeile darüber und wird deshalb im Datum weggelassen:

```js
datum.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
```

### Darstellung

Eine Kopfkarte mit Wochentag (groß, in der Primärfarbe) und Datum, darunter die
Karte für das heutige Essen mit Emoji-Label 🍽️. Die Karte ist eine große
Touch-Fläche; sie reagiert nur bei verknüpftem Rezept auf Antippen und zeigt das
durch Farbe und Cursor an.

### Interaktion

Die Klick-Behandlung läuft über **Event-Delegation** auf dem Dashboard-Container:
Ein einziger Listener prüft, ob das angeklickte Element ein `[data-rezept-id]`
besitzt, und öffnet die Detailansicht. Dadurch entstehen beim Neu-Rendern keine
verwaisten Listener und es sind keine `onclick`-Attribute im generierten HTML
nötig.

### Rendering-Zeitpunkt

`rendereDashboard()` läuft bei jedem Wechsel auf die Dashboard-Seite. Da die
Ansicht rein abgeleitet ist, genügt das – ein Aktualisieren im Hintergrund ist
nicht nötig.

---

## Verbesserungen

**Datumswechsel bei geöffneter App.** Bleibt die App über Mitternacht offen, zeigt
das Dashboard weiterhin den Vortag. Ein `visibilitychange`-Listener, der beim
Zurückkehren in die App das gespeicherte Renderdatum mit dem heutigen vergleicht,
löst das mit wenigen Zeilen.

**Direkt vom Dashboard planen.** Eine leere Karte ist momentan eine Sackgasse.
Ein Antippen sollte in den Wochenplan springen, die aktuelle Woche aufklappen und
den heutigen Tag fokussieren. Das spart den häufigsten Arbeitsweg.

**Vorschaubild in der Karte.** Ist ein Rezept verknüpft, macht ein kleines
quadratisches Thumbnail links neben dem Titel die Karte deutlich schneller
erfassbar.

**Ausblick auf morgen.** Eine reduzierte Zeile „Morgen: Hähnchen-Curry“ unter der
heutigen Karte beantwortet die zweithäufigste Frage, ohne die Seite zu überladen.

**Offene Einkäufe anteasern.** Eine kompakte Zeile „🛒 5 offene Produkte“, die in
die Einkaufsliste springt, verbindet das vierte Modul mit der Startseite. Bewusst
nur als Zähler, nicht als zweite Liste – das Dashboard soll Übersicht bleiben.

**Begrüßung nach Tageszeit.** „Guten Morgen“ / „Guten Abend“ über dem Wochentag
kostet nichts und lässt die App persönlicher wirken. Optional.

**Barrierefreiheit.** Die anklickbare Karte sollte `role="button"` und
`tabindex="0"` erhalten sowie auf Enter/Space reagieren, damit sie per Tastatur
und Screenreader erreichbar ist.
