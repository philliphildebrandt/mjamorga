# Datensicherung: Export, Import, Schema-Version

Das Sicherheitsnetz der App. Drei Teile, die zusammengehören:

1. **Export** aller Daten als eine JSON-Datei, **Import** dieser Datei
2. **Schema-Version** je Bereich, damit die App weiß, welchen Aufbau Daten haben
3. **Migrationskette**, die alte Daten Schritt für Schritt auf den aktuellen
   Aufbau hebt, und ein **Abwärtsschutz**, der verhindert, dass eine alte App
   neuere Daten zerlegt

---

## Funktionen und technische Umsetzung

### Export

Dashboard → 💾 → **Sicherung herunterladen**. Es entsteht eine Datei
`mjamorga-JJJJ-MM-TT.json`:

```json
{
  "app": "MjamOrga",
  "version": 2,
  "exportiert": "2026-09-09T18:00:00.000Z",
  "haushalt": "mjam-k3f9-x2qa-7pd4",
  "bereiche": {
    "rezepte": [ ... ],
    "wochenplan": { ... },
    "einkaufsliste": [ ... ],
    "listen": [ ... ],
    "kategorien": [ ... ]
  }
}
```

Die Datei entsteht im Browser aus dem aktuellen Stand, ohne Server. `version` ist
die Schema-Version zum Zeitpunkt des Exports, `haushalt` der Haushaltscode, damit
ein neues Gerät nach dem Einspielen auch wieder verbunden werden kann.

### Import

Dashboard → 💾 → **Sicherung laden**. Nach der Dateiauswahl zeigt eine Vorschau
Datum und Anzahl je Bereich, dann die Wahl:

| Modus | Wirkung |
|---|---|
| **Ergänzen** (empfohlen) | Einträge aus der Datei kommen dazu. Bei gleicher ID gewinnt die Datei. Wochenplan: je Tag gewinnt der Eintrag aus der Datei, wenn er etwas enthält. |
| **Alles ersetzen** | Der Bestand jedes in der Datei enthaltenen Bereichs wird durch die Datei ersetzt. Mit Rückfrage. |

Beide Wege speichern über `DatenSpeicher.speichere()`, damit der Live-Sync die
Änderung an alle verbundenen Geräte weitergibt. Bereiche, die in der Datei fehlen,
bleiben unangetastet.

`pruefeImport()` lehnt ab, was keine MjamOrga-Sicherung ist, was von einer
neueren App-Version stammt oder dessen Bereiche die falsche Grundform haben.
Eine ältere Sicherung wird vor dem Einspielen durch die Migrationskette gehoben.

### Schema-Version

Jeder Bereich wird mit der Versionsnummer seines Aufbaus gespeichert:

| Ablage | Form |
|---|---|
| `localStorage` | `{ "version": 2, "daten": [ ... ] }` |
| Firestore | `{ wert: [ ... ], version: 2, geaendert, von }` |
| Exportdatei | `version` einmal für die ganze Datei |

Daten ohne Versionsfeld stammen aus der Zeit davor und gelten als **Version 1**.
`entpacke()` erkennt die Hülle an einem ganzzahligen `version` und einem Feld
`daten`; alles andere ist Rohform. Der Wochenplan ist zwar auch ein Objekt, hat
aber nur Datumsschlüssel, eine Verwechslung ist ausgeschlossen.

Im Speicher der App (`app.daten`) liegen weiterhin die **rohen** Arrays und
Objekte. Die Hülle existiert nur an der Grenze zur Ablage, `app.js` sieht sie
nie.

### Migrationskette

`SCHEMA_VERSION` in `storage.js` ist die aktuelle Nummer. `MIGRATIONEN` ist ein
Objekt, dessen Schlüssel die **Zielversion** ist und dessen Wert je Bereich eine
Funktion „alter Wert rein, neuer Wert raus":

```js
const SCHEMA_VERSION = 2;
const MIGRATIONEN = {
    2: {                     // hebt von 1 auf 2
        rezepte: (rezepte) => ...,
        wochenplan: (wochenplan) => ...,
        einkaufsliste: (produkte) => ...,
        listen: (listen) => ...,
    },
};
```

`migriere(bereich, daten, von)` läuft von `von + 1` bis `SCHEMA_VERSION` und
wendet jeden vorhandenen Schritt an. Daten der Version 1 durchlaufen also alle
Schritte, Daten der Version 3 nur die ab 4. Ein Schritt, der einen Bereich nicht
anfasst, wird einfach weggelassen. Schlägt ein Schritt fehl, bricht das Laden mit
Fehler ab, statt halb migrierte Daten zu speichern.

**Wann migriert wird**

- Beim Laden aus `localStorage`: einmal heben, dann sofort zurückschreiben.
  Danach ist die Ablage auf dem aktuellen Stand, beim nächsten Start passiert
  nichts mehr.
- Beim Erstabgleich mit Firestore: das Dokument wird gehoben und, falls es eine
  ältere Version trug, zurückgeschrieben.
- Bei Live-Snapshots: gehoben und übernommen, aber **nicht** zurückgeschrieben,
  sonst schrieben sich ein altes und ein neues Gerät gegenseitig an.
- Beim Import einer älteren Sicherung.

**Version 2 konkret.** Der erste Schritt garantiert, dass jedes Feld vorhanden
ist: Rezepte ohne `zutaten` bekommen ein leeres Array, Produkte mit unbekannter
Kategorie die Standardkategorie, Wochen alle sieben Tage, Listen eine gültige
Farbe und Art. Einträge ohne `id` fallen weg. Ab Version 2 darf sich der Code
auf die Felder verlassen, statt überall `|| []` zu schreiben.

**Version 3 konkret.** Mit dem Kategorienpool bekommt jeder Listenpunkt ein Feld
`kategorie` (`null` = ohne Kategorie). Produkte der Einkaufsliste dürfen ab jetzt
selbst angelegte Kategorien tragen. Ihr Aufbau bleibt gleich, eine App der
Version 2 würde sie beim Bearbeiten aber auf „Sonstiges" zurücksetzen. Deshalb
greift auf alten Geräten der Abwärtsschutz. Neu ist außerdem der Bereich
`kategorien` (eigene Kategorien als `{ id, name, erstellt }`). Er braucht keine
Migration, weil es ihn vorher nicht gab.

### Abwärtsschutz

Ein Gerät mit alter App (etwa ein Browser mit veraltetem Cache) trifft auf Daten,
die eine neuere App geschrieben hat: `version` ist größer als `SCHEMA_VERSION`.

Dann gilt: **anzeigen, so gut es geht, aber nichts mehr schreiben.**

- `markiereVeraltet()` setzt `DatenSpeicher.veraltet`, danach liefert
  `speichere()` immer `false`, `uebernimmExtern()` übernimmt nichts mehr und
  `sync.js` schreibt nichts mehr nach Firestore.
- Die Oberfläche zeigt oben ein rotes Banner mit den beiden Versionsnummern und
  einem Knopf **Neu laden**. Jeder Speicherversuch erklärt im Toast, warum er
  nicht gespeichert hat.
- Firestore-Dokumente mit neuerer Version werden nicht in den lokalen Speicher
  übernommen; der Sync-Status springt auf „App veraltet".

Ohne diesen Schutz würde die alte App die Daten in ihrer alten Form
zurückschreiben und damit den neuen Aufbau auf allen Geräten zerstören.

### Eine neue Migration ergänzen

Beispiel: Der Kalender ändert Termine von `datum` + `uhrzeit` auf `beginn` +
`ende`.

1. `SCHEMA_VERSION` von 2 auf 3 erhöhen.
2. In `MIGRATIONEN` einen Eintrag `3` mit einer Funktion für `termine` ergänzen.
   Bereiche, die sich nicht ändern, brauchen keinen Eintrag.
3. Nichts weiter. Laden, Sync und Import ziehen den Schritt automatisch.

Vorher eine Sicherung exportieren. Und daran denken, dass alle Geräte die neue
App laden müssen, sonst greifen dort Abwärtsschutz und Banner.

### Interaktion

- 💾 sitzt neben ☁️ in der Dashboard-Kopfzeile
- Der Datei-Knopf ist ein beschriftetes `<label>` für ein unsichtbares
  `<input type="file">`, damit er wie die übrigen Knöpfe aussieht
- Escape schließt den Dialog, die Vorschau wird dabei verworfen
- Auf dem iPhone landet der Export je nach Browser in „Dateien" oder öffnet das
  Teilen-Menü

---

## Verbesserungen

**Automatische Sicherung.** Ein Export bei jedem Start in den Browser-Speicher
(IndexedDB, letzte fünf Stände) würde die Wiederherstellung nach einem
Fehlbedienungs-Import erleichtern. Kleiner Aufwand, aber erst sinnvoll, wenn
sich zeigt, dass Imports tatsächlich falsch laufen.

**Teilexport.** Nur Rezepte exportieren, etwa zum Weitergeben. Das Format kann
das schon (fehlende Bereiche werden beim Import ignoriert), es fehlt nur die
Auswahl im Dialog.

**Versionsanzeige der App.** Das Banner nennt die Datenversion. Eine sichtbare
App-Version (aus einem Build-Datum) würde bei Support-Fragen helfen, braucht
aber einen Schritt beim Veröffentlichen.
