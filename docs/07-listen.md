# Modul: Listen

Frei anlegbare Listen neben der Einkaufsliste: Packliste, Putzplan, Baumarkt,
Geschenkideen, Aufgaben fürs Wochenende. Jede Liste hat Titel, Farbe, Art und
optional einen Zeitraum. Die Einkaufsliste bleibt ein eigenes Modul mit eigenem
Speicherschlüssel. Den Kategorienpool teilen sich beide.

---

## Funktionen und technische Umsetzung

### Funktionsumfang

**Übersicht** (Seite `listen`)

1. Alle Listen als **Kacheln**: Farbstreifen, Titel, Art-Badge bei Todos,
   Zeitraum, Fortschritt (`3 von 12 erledigt`) und ein **Teaser der ersten vier
   Punkte** in Anzeigereihenfolge, dahinter `+N weitere`
2. **Neue Liste** über den Button in der Kopfzeile
3. **Duplizieren** direkt an der Kachel: Titel bekommt „(Kopie)", alle Punkte
   werden übernommen, Haken werden zurückgesetzt, alle IDs sind neu
4. **Löschen** direkt an der Kachel, mit Rückfrage
5. Antippen der Kachel öffnet die Detailansicht

**Detailansicht** (Seite `listen-detail`, bildschirmfüllend)

6. Kopfzeile mit Zurück-Pfeil, Farbpunkt, Titel, Auswahl-Button, Bearbeiten-Button
7. Unter der Kopfzeile Zeitraum, Art und `offen · gesamt`
8. **Dieselbe Punktlogik wie in der Einkaufsliste**: Abhaken durch Antippen,
   erledigte durchgestrichen und unten, Punkt hinzufügen, bearbeiten, löschen,
   mehrere Punkte aus kopiertem Text einfügen
9. **Mehrfachauswahl**: Punkte markieren, dann **Kopieren nach …** (andere Liste
   oder Einkaufsliste) oder **Neue Liste daraus**
10. **Erledigte löschen** oben rechts im Kopfbereich, sobald etwas abgehakt ist
11. **Kategorie je Punkt**, optional, aus dem gemeinsamen Kategorienpool. Neue
    Kategorien entstehen über das ＋ neben der Auswahl. Sobald ein Punkt eine
    Kategorie hat, wird die Liste danach gruppiert. „Ohne Kategorie" steht
    zuletzt. Eine Liste ganz ohne Kategorien bleibt flach wie bisher.

**Liste anlegen / bearbeiten** (Modal)

| Feld | Inhalt |
|---|---|
| Titel | Pflichtfeld |
| Farbe | acht Farben, ohne Rot (Rot ist im Kalender für „wichtig" reserviert) |
| Art | Allgemeine Liste oder Todos |
| Zeitraum | von / bis, beides optional; Ende darf nicht vor dem Anfang liegen |

### Art der Liste

| | Allgemeine Liste | Todos |
|---|---|---|
| Punkte abhaken | ja | ja |
| Fälligkeit je Punkt | nein | optional, Datumsfeld im Punkt-Modal |
| Sortierung offener Punkte | Eingabereihenfolge | nach Fälligkeit, ohne Datum zuletzt |
| Anzeige | Name | Name plus Datum, überfällige rot |

Beides sind dieselben Datensätze. `sortierePunkte()` in `storage.js` ist die
einzige Stelle, die die Art auswertet; das Fälligkeitsfeld wird nur bei Todos
eingeblendet. Ein Wechsel der Art ist jederzeit ohne Datenverlust möglich. Beim
Wechsel auf „Allgemein" bleiben vorhandene Fälligkeiten gespeichert, werden nur
nicht mehr angezeigt.

### Datenmodell

Schlüssel `mjamorga_listen`, unabhängig von `mjamorga_einkaufsliste`:

```json
"listen": [
  {
    "id": "l1a2b3c4",
    "titel": "Packliste Norwegen",
    "farbe": "gruen",
    "art": "allgemein",
    "von": "2026-07-12",
    "bis": "2026-07-26",
    "punkte": [
      {
        "id": "p9x8y7z6",
        "name": "Regenjacke",
        "erledigt": false,
        "faellig": null,
        "kategorie": "Kleidung",
        "erstellt": "2026-09-09T18:05:00.000Z"
      }
    ],
    "erstellt": "2026-09-09T18:00:00.000Z",
    "geaendert": "2026-09-09T18:05:00.000Z"
  }
]
```

**Punkte liegen in der Liste.** Ein Punkt gehört genau einer Liste, es gibt keine
Querverweise. Das Löschen einer Liste ist damit eine Operation, und das Kopieren
erzeugt echte neue Punkte statt Verweise.

**Der Punkt ist feldgleich zum Produkt der Einkaufsliste**, zusätzlich mit
`faellig`. `kategorie` ist `null`, solange keine gewählt ist (seit Schema-Version 3).
Beim Kopieren bleibt die Kategorie erhalten. Auf der Einkaufsliste wird aus
„ohne Kategorie" die Standardkategorie. Beim Kopieren in eine allgemeine Liste
fällt die Fälligkeit weg.

**Zeitraum als `YYYY-MM-DD`-Strings**, wie der Wochenschlüssel des Wochenplans.
Rein informativ, blendet nichts aus und löscht nichts.

**Neue Listen stehen vorn.** `speichereListe()` fügt am Anfang des Arrays ein,
Duplikate direkt hinter dem Original. Die Reihenfolge der Kacheln ist die
Reihenfolge im Array.

### Mehrfachauswahl

Reiner Oberflächenzustand (`auswahlAktiv`, `ausgewaehltePunkte`), wird nicht
gespeichert und endet mit dem Verlassen der Detailansicht.

- Start über den ☑️-Button in der Kopfzeile
- Im Auswahlmodus wählt ein Tipp auf die Zeile aus statt abzuhaken; die
  Bearbeiten- und Löschen-Knöpfe sind ausgeblendet
- Die Aktionsleiste schwebt über der Navigation und zeigt die Anzahl; beide
  Aktionen sind bei null Auswahl deaktiviert
- **Kopieren nach …** öffnet den Ziel-Dialog mit allen anderen Listen, der
  Einkaufsliste und „Neue Liste daraus". Es wird **kopiert, nicht verschoben**:
  das Original bleibt unverändert, die Kopien bekommen neue IDs
- **Neue Liste daraus** öffnet den Anlegen-Dialog mit einem Hinweis, wie viele
  Punkte übernommen werden; die Punkte werden beim Anlegen erzeugt

Der Ziel-Dialog dient auch dem Rezept-Detail: „Zutaten auf eine Liste" kopiert
alle Zutaten eines Rezepts wahlweise auf eine Liste oder die Einkaufsliste.

### Gemeinsame Bausteine mit der Einkaufsliste

Das **Produkt-Modal wird geteilt**. `modalKontext` (`einkauf` oder `liste`)
entscheidet, ob die Kategorie-Auswahl „Ohne Kategorie" anbietet, ob die
Fälligkeit sichtbar ist und wohin
`speichereProdukt()` und `fuegeMassenProdukteHinzu()` verzweigen. Die
Zeilendarstellung (`produkt-zeile`, Checkbox, Aktionen) und `zerlegeZeilen()`
sind dieselben. Damit driften die beiden Oberflächen nicht auseinander.

### Live-Sync

`listen` ist ein vierter Bereich in `BEREICHE` und damit ein viertes Dokument
`haushalte/{code}/daten/listen`. Die Sicherheitsregeln in `firestore.rules`
kennen den Namen; **nach dem Update müssen sie in der Firebase-Konsole neu
veröffentlicht werden**, sonst wird jeder Schreibvorgang auf Listen abgelehnt.

Externe Änderungen rendern die Übersicht oder die offene Liste neu. Wird die
offene Liste auf einem anderen Gerät gelöscht, geht es mit Hinweis zurück zur
Übersicht. Markierungen der Mehrfachauswahl werden auf die noch vorhandenen
Punkte beschränkt.

### Interaktion

- Kacheln sind per Tastatur erreichbar (`role="button"`, Enter/Leertaste öffnet)
- Farbauswahl ist eine Radiogruppe mit sichtbarem Fokus
- Escape schließt die Dialoge

---

## Verbesserungen

**Ein Dokument je Liste im Sync.** Alle Listen teilen sich ein Dokument, deshalb
gewinnt bei gleichzeitigen Änderungen an zwei verschiedenen Listen der letzte
Schreibvorgang. Ein Dokument je Liste (`daten/listen/{listenId}`) wäre der
nächste Schritt, siehe Roadmap.

**Kacheln sortieren.** Aktuell Array-Reihenfolge, neue vorn. Ein Anheften oder
Verschieben per Ziehen ist eine spätere Ergänzung; das Datenmodell braucht dafür
nichts Neues.

**Mengen zusammenführen.** Beim Kopieren von Zutaten entstehen bei gleichen Namen
Dubletten („500 g Nudeln" zweimal). Eine Zusammenführung exakt gleicher Namen
wäre ein kleiner Schritt, eine Mengenaddition bewusst nicht geplant.

**Überfällige Todos auf dem Dashboard.** Die Heute-Karte könnte überfällige
Punkte aller Todo-Listen anzeigen. Liest nur, speichert nichts.
