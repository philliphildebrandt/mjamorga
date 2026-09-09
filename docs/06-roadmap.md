# MjamOrga – Roadmap

Geplante Module und offene Entscheidungen.

> **Stand 9. September 2026:** Das Modul **Listen** und die **Navigation mit zwei
> Ebenen** sind umgesetzt, siehe [07-listen.md](07-listen.md) und
> [08-navigation.md](08-navigation.md). Ebenfalls umgesetzt: Export/Import und
> Schema-Version mit Migrationskette, siehe
> [09-datensicherung.md](09-datensicherung.md). Die Abschnitte dazu bleiben hier
> als Entwurfsbegründung stehen; maßgeblich sind die Modul-Dokus. Offen sind der
> Kalender und die Google-Kopplung. Diese Datei hält fest, **was**
kommen soll und **wie** es sich in das bestehende Datenmodell und die
Modulstruktur einfügt. Sie ersetzt keine Modul-Dokumentation: sobald ein Modul
gebaut wird, bekommt es eine eigene Datei nach dem Muster von
[02-rezepte.md](02-rezepte.md) bis [04-einkaufsliste.md](04-einkaufsliste.md).

Reihenfolge der Umsetzung: erst **Listen**, dann **Kalender**. Die Listen bauen
auf Bausteinen auf, die es in der Einkaufsliste schon gibt, und sind damit der
kleinere Schritt. Der Kalender profitiert davon, weil er Listen mit Zeitraum
anzeigen kann.

Die bestehende **Einkaufsliste bleibt ein eigenes Modul** und wird von keinem der
beiden neuen Module ersetzt.

Beide Module fügen sich in das neue
[Navigationskonzept mit zwei Ebenen](#navigationskonzept-zwei-ebenen) ein: vier
Einträge in der Bottom-Navigation, die zweite Ebene erscheint als Blasen darüber.

---

## Modul: Listen *(umgesetzt)*

### Ziel

Ein eigenständiges Modul für **frei anlegbare Listen**: Packliste für den
Urlaub, Putzplan, Baumarkt, Geschenkideen, Aufgaben fürs Wochenende. Jede Liste
hat einen Titel, eine Farbe und einen Zeitraum.

**Die Einkaufsliste bleibt ein eigenes Modul.** Sie hat ihren festen Platz in
der Navigation, ihre Supermarkt-Kategorien und ihren eigenen Speicherschlüssel.
Sie wird nicht in die Listen überführt und nicht migriert. Der Grund: Die
Einkaufsliste ist die eine Liste, die täglich und von unterwegs benutzt wird.
Sie soll mit einem Fingertipp offen sein, nicht erst über eine Übersicht.
Was die beiden Module verbindet, sind die Zutaten aus Rezepten und der
Kopieren-Mechanismus, nicht der Datenbestand.

### Funktionsumfang

**Übersicht (Hauptseite des Moduls)**

1. **Alle Listen als Kacheln**, je Kachel: Titel, Farbe als Hintergrund oder
   Farbstreifen, und ein **Teaser der ersten vier Listenpunkte**
2. Auf der Kachel zusätzlich der Fortschritt (`3 von 12 erledigt`) und der
   Zeitraum, falls gesetzt
3. **Neue Liste anlegen** über einen deutlich sichtbaren Button
4. **Liste duplizieren** – kopiert Titel („Packliste (Kopie)"), Farbe, Art und
   alle Punkte; abgehakte Punkte werden dabei zurückgesetzt
5. **Liste löschen** mit Rückfrage
6. **Liste bearbeiten** – Titel, Farbe, Zeitraum und Art nachträglich änderbar

**Liste anlegen** fragt nach:

| Feld | Inhalt |
|---|---|
| Titel | Freitext, Pflichtfeld |
| Farbe | Auswahl aus einer festen Palette |
| Zeitraum | von / bis, beides optional |
| Art | **Todos** oder **allgemeine Liste** |

**Detailansicht (Unterseite, bildschirmfüllend)**

7. Beim Antippen einer Kachel öffnet sich die Liste als **eigene Unterseite über
   die volle Bildschirmhöhe**, mit Zurück-Pfeil in der Kopfzeile
8. Innerhalb der Liste **dieselbe Funktionalität wie in der Einkaufsliste**:
   Punkte untereinander, Abhaken durch Antippen, erledigte Punkte durchgestrichen
   und weiter sichtbar, Punkt hinzufügen, bearbeiten, löschen, mehrere Punkte
   aus kopiertem Text auf einmal einfügen
9. **Mehrfachauswahl**: mehrere Punkte markieren und daraus entweder
   **in eine andere Liste kopieren** oder **eine neue Liste erzeugen**
10. **Erledigte aufräumen** – entfernt alle abgehakten Punkte der Liste auf einmal

### Art der Liste

Der Unterschied zwischen den beiden Arten ist bewusst klein gehalten, damit die
Detailansicht nicht in zwei getrennte Oberflächen zerfällt:

| | Allgemeine Liste | Todos |
|---|---|---|
| Punkte abhaken | ja | ja |
| Fälligkeitsdatum je Punkt | nein | ja, optional |
| Sortierung | Reihenfolge der Eingabe | offene nach Fälligkeit, dann Eingabe |
| Anzeige | Name | Name plus Fälligkeit, überfällige hervorgehoben |

Beides sind dieselben Datensätze. Die Art steuert nur, ob das Feld `faellig`
im Formular auftaucht und wie sortiert wird. Ein Wechsel der Art ist deshalb
jederzeit ohne Datenverlust möglich.

### Datenmodell

Ein neuer Schlüssel `mjamorga_listen`, unabhängig von `mjamorga_einkaufsliste`:

```json
"listen": [
  {
    "id": "l1a2b3c4",
    "titel": "Packliste Norwegen",
    "farbe": "blau",
    "art": "allgemein",
    "von": "2026-07-12",
    "bis": "2026-07-26",
    "punkte": [
      {
        "id": "p9x8y7z6",
        "name": "Regenjacke",
        "erledigt": false,
        "faellig": null,
        "erstellt": "2026-09-07T18:05:00.000Z"
      }
    ],
    "erstellt": "2026-09-07T18:00:00.000Z",
    "geaendert": "2026-09-07T18:05:00.000Z"
  }
]
```

**Punkte liegen in der Liste, nicht in einem globalen Array.** Anders als bei
Rezepten und Wochenplan gibt es hier keine Querverweise: ein Punkt gehört genau
einer Liste. Ihn mit der Liste zusammen zu speichern hält das Löschen einer
Liste bei einer einzigen Operation.

**Der Punkt ist feldgleich zum Produkt der Einkaufsliste**, nur ohne
`kategorie` und mit `faellig` dazu. Dadurch funktioniert das Kopieren zwischen
den Modulen ohne Umwandlung: Beim Kopieren in die Einkaufsliste bekommt der
Punkt die Standardkategorie, beim Kopieren heraus fällt sie weg.

**`von` und `bis` als `YYYY-MM-DD`-Strings**, beide optional. Gleiche Begründung
wie beim Wochenschlüssel: sortierbar per String-Vergleich, keine
Zeitzonenfallen. Der Zeitraum ist reine Information, er löscht oder verbirgt
nichts automatisch.

**Kein `angeheftet`-Feld.** Die Reihenfolge der Kacheln ergibt sich aus dem
Array. Wird später eine manuelle Sortierung gewünscht, ist das Verschieben im
Array die einfachste Umsetzung.

### Mehrfachauswahl und Kopieren

Der Auswahlmodus startet über einen Button in der Kopfzeile der Detailansicht
oder über langes Antippen eines Punktes. Danach:

- Antippen wählt aus statt abzuhaken, ausgewählte Punkte sind farbig umrandet
- In der Kopfzeile steht die Anzahl (`3 ausgewählt`) und ein Abbrechen-Kreuz
- Eine Aktionsleiste am unteren Rand bietet **Kopieren nach …** und
  **Neue Liste daraus**

**Kopieren nach …** öffnet eine Auswahl aller anderen Listen, ergänzt um die
Einkaufsliste als Ziel. Die Punkte werden **kopiert, nicht verschoben**, und
bekommen dabei neue IDs. Das Original bleibt unverändert stehen. Verschieben
wäre die überraschendere Aktion, weil es in der Quellliste etwas entfernt, was
man beim Kopieren nicht erwartet.

**Neue Liste daraus** öffnet denselben Dialog wie „Neue Liste anlegen", mit den
ausgewählten Punkten bereits gefüllt.

Der Auswahlmodus ist reiner Oberflächenzustand und wird nicht gespeichert,
genau wie `aufgeklappteWochen` im Wochenplan.

### Navigation

Zwei neue Seiten nach dem Muster von `rezepte` / `rezept-detail`:

| Seite | Inhalt |
|---|---|
| `listen` | Kachelübersicht |
| `listen-detail` | eine Liste, bildschirmfüllend |

Erreichbar sind sie über die Gruppe „Listen" der Bottom-Navigation, zusammen mit
den Rezepten (siehe [Navigationskonzept](#navigationskonzept-zwei-ebenen)).
Beide Seiten halten diese Gruppe aktiv.

Die Detailansicht nutzt die vorhandene `detail-header`-Kopfzeile mit
Zurück-Pfeil. Der Dialog „Liste anlegen / bearbeiten" ist ein Overlay wie das
bestehende Produkt-Modal, kein eigener Seitenzustand.

### Auswirkung auf den Live-Sync

`sync.js` synchronisiert je Bereich ein Dokument. Für Listen kommt ein vierter
Bereich `listen` dazu, also
`BEREICHE = ['rezepte', 'wochenplan', 'einkaufsliste', 'listen']`
und ein zusätzliches Dokument `haushalte/{code}/daten/listen`. Die
Sicherheitsregeln in [`firestore.rules`](../firestore.rules) brauchen den neuen
Namen in `istBereich()`.

**Das ist der Moment, das Konfliktverhalten zu verbessern.** Heute ist ein
ganzer Bereich ein Dokument, deshalb gewinnt bei gleichzeitigem Abhaken der
letzte Schreibvorgang (siehe [05-sync.md](05-sync.md)). Mit vielen Listen in
einem Dokument wird das spürbarer: Zwei Personen an zwei völlig verschiedenen
Listen können sich dann gegenseitig überschreiben. Zwei Stufen sind denkbar:

- **Klein:** ein Dokument je Liste (`daten/listen/{listenId}`). Zwei Personen an
  verschiedenen Listen stören sich dann nie. Das ist bei diesem Modul der
  naheliegende Schnitt, weil eine Liste ohnehin die Einheit ist, die geöffnet,
  dupliziert und gelöscht wird.
- **Sauber:** ein Dokument je Punkt. Erst damit ist gleichzeitiges Abhaken in
  derselben Liste verlustfrei. Kostet mehr Lese- und Schreibvorgänge, bleibt bei
  Familiengröße aber weit im kostenlosen Kontingent.

### Verbindung zu den anderen Modulen

**Zutaten aus einem Rezept übernehmen.** In der Rezept-Detailansicht ein Button
„Zutaten auf eine Liste" mit Auswahl des Ziels, inklusive der Einkaufsliste. Die
Zutaten laufen durch dieselbe Zerlegung wie das heutige Massen-Einfügen.

**Wochenplan → Liste.** Ein Button „Zutaten der Woche sammeln" fasst die Zutaten
aller verknüpften Rezepte einer Woche zusammen. Ziel ist normalerweise die
Einkaufsliste, kann aber jede Liste sein. Doppelte Einträge werden
zusammengeführt, solange die Namen exakt gleich sind. Eine echte Mengenaddition
(„500 g Nudeln" + „250 g Nudeln") ist bewusst **nicht** geplant, dafür müssten
Mengen strukturiert erfasst werden statt als Freitext im Namen.

**Listen mit Zeitraum im Kalender.** Hat eine Liste `von` und `bis`, kann der
Kalender sie als Balken über diese Tage zeigen. Das ist der Grund, warum der
Zeitraum überhaupt zum Datenmodell gehört, und ein Argument, die Listen vor dem
Kalender zu bauen.

---

## Modul: Kalender

### Ziel

Der Wochenplan zeigt nur Essen und nur die laufende Woche gut. Der Kalender ist
die **Monatsansicht für alles andere**: Termine, Geburtstage, Müllabfuhr,
Arzttermine – und er zeigt zusätzlich an, was an dem Tag gekocht wird.

### Funktionsumfang

1. **Monatsansicht** als Raster, Montag bis Sonntag, mit Blättern zwischen den
   Monaten und einem Sprung zurück auf „Heute"
2. **Tagesdetail** beim Antippen eines Tages: alle Termine dieses Tages, dazu
   das geplante Essen aus dem Wochenplan
3. **Termin anlegen wie in Outlook**: Titel, Beginn mit Datum und Uhrzeit, Ende
   mit Datum und Uhrzeit, Schalter „ganztägig", Ort, Notiz
4. **Ganztägig über mehrere Tage** – Urlaub vom 12. bis 26. Juli ist ein
   einziger Termin, kein Termin je Tag
5. **Wichtigkeit markieren** – wichtige Termine erscheinen rot
6. **Wiederholungen**: jährlich (Geburtstage), wöchentlich (Sport), monatlich.
   Bewusst kein vollständiges Wiederholungsmodell wie in iCalendar
7. **Termin bearbeiten und löschen**
8. **Agenda-Ansicht** als Alternative zum Raster: die nächsten Termine als Liste
9. **Kopplung mit Google Kalender**, siehe eigenen Abschnitt weiter unten

### Für alle sichtbar

Der Kalender ist ein synchronisierter Bereich wie Rezepte, Wochenplan und
Einkaufsliste. Alle Geräte mit demselben Haushaltscode sehen dieselben Termine,
und ein neuer Termin erscheint auf den anderen Geräten innerhalb von Sekunden.
Das ist kein Zusatzaufwand, sondern ergibt sich aus dem bestehenden Live-Sync
(siehe [05-sync.md](05-sync.md)).

Es gibt **keine persönlichen Kalender innerhalb der App** und keine Rechte je
Person. Wer den Haushaltscode hat, sieht und ändert alle Termine. Das ist
dieselbe Regel wie in allen anderen Modulen und für einen Familienhaushalt die
richtige: getrennte Sichtbarkeiten bräuchten echte Benutzerkonten statt der
anonymen Anmeldung.

### Datenmodell

Ein neuer Schlüssel `mjamorga_termine`, flaches Array wie bei den Rezepten:

```json
"termine": [
  {
    "id": "t1a2b3c4",
    "titel": "Zahnarzt",
    "beginn": "2026-09-15T14:30",
    "ende": "2026-09-15T15:15",
    "ganztaegig": false,
    "ort": "Praxis Dr. Meier, Hauptstraße 4",
    "notiz": "Versichertenkarte mitnehmen",
    "wichtig": true,
    "farbe": "blau",
    "wiederholung": null,
    "erstellt": "2026-09-08T18:00:00.000Z",
    "geaendert": "2026-09-08T18:00:00.000Z"
  },
  {
    "id": "t5e6f7g8",
    "titel": "Urlaub Norwegen",
    "beginn": "2026-07-12",
    "ende": "2026-07-26",
    "ganztaegig": true,
    "ort": "",
    "notiz": "",
    "wichtig": false,
    "farbe": "gruen",
    "wiederholung": null,
    "erstellt": "2026-09-08T18:00:00.000Z",
    "geaendert": "2026-09-08T18:00:00.000Z"
  }
]
```

**Ein flaches Array, nicht nach Monat verschachtelt.** Gleiche Begründung wie
bei der Einkaufsliste: die Gruppierung nach Tag entsteht erst beim Rendern, und
das Verschieben eines Termins bleibt eine einzige Feldänderung.

**`beginn` und `ende` statt `datum` und `uhrzeit`.** Ein Termin mit Ende ist die
Voraussetzung für zwei der geforderten Punkte: Zeitspannen wie in Outlook und
ganztägige Termine über mehrere Tage. Beide Felder sind Strings ohne Zeitzone:

| `ganztaegig` | Format | Beispiel |
|---|---|---|
| `false` | `YYYY-MM-DDTHH:MM` | `2026-09-15T14:30` |
| `true` | `YYYY-MM-DD` | `2026-07-12` |

**Bewusst ohne Zeitzone und ohne `Z`.** Ein Zahnarzttermin um 14:30 ist um
14:30, egal von welchem Gerät man draufschaut. Ein UTC-Zeitstempel würde bei der
Zeitumstellung und auf Reisen die angezeigte Uhrzeit verschieben. Die Felder
sortieren sich weiterhin per String-Vergleich, und der Datumsanteil ist
weiterhin `YYYY-MM-DD` wie der Wochenschlüssel des Wochenplans.

**`ende` ist bei ganztägigen Terminen einschließlich.** Der 26. Juli gehört noch
zum Urlaub. Das ist die Lesart, die ein Mensch erwartet. iCalendar und Google
zählen hier ausschließend, das heißt der Export muss einen Tag addieren – ein
klassischer Fehler beim Kalenderexport und deshalb hier festgehalten.

**Wichtigkeit ist ein eigenes Feld, keine Farbe.** `wichtig: true` zeigt den
Termin rot: roter Balken am Rand des Eintrags, roter Punkt im Monatsraster,
fetter Titel. Die frei gewählte `farbe` bleibt daneben bestehen und ordnet den
Termin einem Bereich zu (Schule, Arbeit, Familie).

Damit können Farbe und Wichtigkeit optisch kollidieren, etwa ein grüner Termin
mit rotem Balken. Die Alternative wäre, dass Wichtigkeit die Farbe überschreibt.
Empfehlung: **roter Balken zusätzlich zur Farbe**, weil ein wichtiger Termin
sonst seine Bereichszuordnung verliert, und weil eine überschriebene Farbe beim
Zurücknehmen der Wichtigkeit wiederhergestellt werden müsste. Rot sollte
deshalb aus der frei wählbaren Farbpalette herausgenommen werden, sonst ist
nicht unterscheidbar, ob ein Termin rot ist oder rot markiert.

**Wiederholungen werden nicht ausmultipliziert.** Gespeichert wird der eine
Termin mit `wiederholung`. Beim Rendern eines Monats prüft eine Funktion
`terminGiltAm(termin, datum)`, ob er an diesem Tag fällt. Sonst würde ein
Geburtstag jedes Jahr neue Datensätze erzeugen, die nie wieder verschwinden.

### Wiederherverwendung vorhandener Logik

`storage.js` bringt die Datumsarbeit schon mit und wird für den Kalender nur
ergänzt, nicht umgebaut:

| Vorhanden | Nutzung im Kalender |
|---|---|
| `getWochenKey(datum)` | verbindet einen Kalendertag mit der passenden Woche im Wochenplan |
| `getTagIndex(datum)` | Spaltenposition im Monatsraster (Montag = 0) |
| `formatDatum`, `formatKurz`, `formatTagMonat` | Beschriftungen ohne neue Formatierer |
| `WOCHENTAGE` | Kopfzeile des Rasters |

Neu dazu kommen `getMonatsRaster(jahr, monat)` (liefert die anzuzeigenden Tage
inklusive der Rand-Tage aus Vor- und Folgemonat) und `terminGiltAm()`.

### Verbindung zu den anderen Modulen

**Kalender zeigt den Wochenplan.** Im Tagesdetail steht unter den Terminen das
geplante Essen, verlinkt auf das Rezept. Der Kalender speichert dafür nichts
eigenes, er liest wie das Dashboard.

**Dashboard zeigt die nächsten Termine.** Die „Heute"-Karte bekommt darunter
eine schmale Zeile mit den Terminen des Tages. Das ist der eigentliche Gewinn
des Moduls im Alltag.

**Kalender zeigt Listen mit Zeitraum.** Eine Liste mit `von` und `bis` erscheint
als Balken über diese Tage, in ihrer Listenfarbe, und führt beim Antippen in die
Listenansicht. Die Farbpalette der Listen und die der Termine sollten deshalb
dieselbe sein.

### Kopplung mit Google Kalender – Machbarkeit und Aufwand

Gewünscht ist, dass Termine aus MjamOrga **automatisch in den Google-Kalender**
der Haushaltsmitglieder wandern und dort in Gmail, auf dem Handy und in jeder
Kalender-App auftauchen.

Das geht, aber nicht als ein einzelnes Häkchen. Die Hürde ist nicht die
Google-Schnittstelle selbst, sondern dass MjamOrga **keinen Server hat**: eine
statische Seite auf GitHub Pages kann nichts tun, während niemand sie geöffnet
hat. Automatisch heißt aber genau das. Vier Stufen, von billig nach vollständig.

#### Stufe 0 – „Zu Google Kalender hinzufügen"-Link

Jeder Termin bekommt einen Link auf `calendar.google.com/calendar/render` mit
Titel, Zeit, Ort und Notiz als Parameter. Ein Tipp öffnet Google Kalender mit
vorausgefülltem Termin, ein weiterer speichert ihn.

| | |
|---|---|
| Aufwand | **wenige Stunden** |
| Voraussetzungen | keine |
| Automatisch | nein, ein Tipp je Termin |
| Änderungen später | nein, die Kopie ist danach eigenständig |

Lohnt sich unabhängig von allem anderen, weil es fast nichts kostet.

#### Stufe 1 – `.ics`-Export

Ein Button erzeugt aus allen Terminen eine `.ics`-Datei zum Herunterladen. Die
lässt sich in Google Kalender, Outlook und Apple Kalender einmalig importieren.
Das Format ist reiner Text und ohne Bibliothek erzeugbar.

| | |
|---|---|
| Aufwand | **etwa ein halber Tag** |
| Voraussetzungen | keine |
| Automatisch | nein, Datei je Durchgang |
| Änderungen später | nein, ein erneuter Import erzeugt Dubletten |

Nützlich als Sicherung und für den Umzug in eine andere App. Die Fallstricke sind
bekannt: `DTEND` bei ganztägigen Terminen einen Tag später als angezeigt, Zeilen
auf 75 Zeichen umbrechen, Zeilenumbrüche in der Notiz als `\n` maskieren, je
Termin eine stabile `UID`.

#### Stufe 2 – Google-Kalender-Schnittstelle direkt aus dem Browser

MjamOrga meldet jedes Haushaltsmitglied einmal bei Google an und schreibt die
Termine über die Kalender-Schnittstelle in dessen persönlichen Kalender. Ändert
sich ein Termin in MjamOrga, wird der Termin bei Google mitgeändert.

**Was dafür einzurichten ist**

1. Google-Cloud-Projekt anlegen, Kalender-Schnittstelle aktivieren
2. OAuth-Zustimmungsbildschirm einrichten, Berechtigung
   `https://www.googleapis.com/auth/calendar.events`
3. GitHub-Pages-Domain als zugelassene JavaScript-Quelle eintragen
4. **Jedes Familienmitglied als Testnutzer mit seiner Google-Adresse eintragen**

**Der wichtige Punkt zur Freigabe:** Die Kalender-Berechtigung gilt bei Google
als *sensibel*. Eine öffentliche App bräuchte dafür eine Prüfung durch Google,
die vier bis sechs Wochen dauert. Solange die App im **Testmodus** bleibt, ist
keine Prüfung nötig, dafür ist sie auf **100 eingetragene Testnutzer** begrenzt.
Für eine Familie ist das genau der richtige Weg und kostet nichts.

**Die Einschränkung, die bleibt:** Im Browser gibt es keine dauerhaften
Zugangstoken. Ein Zugangstoken gilt eine Stunde, und ein neues verlangt laut
Google eine Nutzeraktion, also einen Tastendruck. Der Abgleich läuft damit
**nur, solange die App offen ist**, und braucht gelegentlich einen Tipp auf
„Mit Google verbinden".

| | |
|---|---|
| Aufwand | **zwei bis drei Tage** |
| Voraussetzungen | Google-Cloud-Projekt, jedes Mitglied als Testnutzer |
| Automatisch | nur während die App geöffnet ist |
| Änderungen später | ja, Termine werden aktualisiert und gelöscht |
| Kosten | keine |

**Datenmodell-Folge:** Zu jedem Termin muss die Google-Termin-ID gemerkt werden,
sonst entstehen beim zweiten Abgleich Dubletten. Diese ID ist **je Person
verschieden**, weil jeder Kalender seine eigenen IDs vergibt. Sie gehört deshalb
**nicht** in das gemeinsame Termin-Dokument in Firestore, sondern in einen
eigenen Speicherschlüssel auf dem jeweiligen Gerät:

```json
"mjamorga_google_ids": { "t1a2b3c4": "abc123def456@google.com" }
```

Landete sie im gemeinsamen Dokument, würde Gerät A die ID von Gerät B
überschreiben und beide Kalender aus dem Tritt bringen.

#### Stufe 3 – gemeinsamer Google-Kalender über ein Apps Script (Empfehlung)

Der Weg, der „automatisch" wirklich einlöst, und trotzdem nichts kostet.

Statt in jeden persönlichen Kalender zu schreiben, gibt es **einen einzigen
Google-Kalender namens MjamOrga**, der mit den Familienmitgliedern geteilt wird.
Ein **Google Apps Script** hält ihn im Hintergrund aktuell:

```
MjamOrga (Browser) ──▶ Firestore
                          │
                          │  Apps Script, Zeitgeber alle 15 Minuten
                          ▼
                   Google-Kalender „MjamOrga"
                          │
                          ├──▶ Gmail / Kalender-App von Person A
                          ├──▶ Person B
                          └──▶ Person C
```

Das Skript meldet sich anonym bei Firestore an, liest das Dokument
`haushalte/{code}/daten/termine` und gleicht es mit dem Kalender ab. Apps Script
läuft auf Googles Servern, ist mit jedem Google-Konto kostenlos nutzbar und
braucht **keine Kreditkarte**. Der Haushaltscode liegt in den Skript-Eigenschaften,
nicht im Code.

Die Kontingente liegen um Größenordnungen über dem Bedarf:

| Kontingent (kostenloses Konto) | Grenze | Bedarf einer Familie |
|---|---|---|
| Laufzeit der Zeitgeber pro Tag | 90 Minuten | wenige Minuten |
| Externe Abrufe pro Tag | 20.000 | rund 100 |
| Kalendertermine pro Tag | 5.000 | einige |

| | |
|---|---|
| Aufwand | **etwa ein Tag** für das Skript, dazu einmalige Einrichtung |
| Voraussetzungen | ein Google-Konto, Kalender mit der Familie geteilt |
| Automatisch | **ja, auch wenn niemand die App geöffnet hat** |
| Verzögerung | bis zu 15 Minuten |
| Änderungen später | ja, inklusive Löschen |
| Kosten | keine |

Der Vorteil gegenüber Stufe 2: Die Einrichtung passiert **einmal von einer
Person**. Alle anderen bekommen eine Kalendereinladung und müssen nichts tun,
keine Anmeldung, keine Berechtigungen, kein Testnutzer-Eintrag. Und es
funktioniert im Hintergrund, auch wenn wochenlang niemand MjamOrga öffnet.

**Geteilt wird der Kalender, nicht das Konto.** Jedes Mitglied benutzt sein
eigenes Google-Konto; niemand muss ein fremdes Konto auf dem Handy einrichten.

1. Der Besitzer legt in seinem Google-Kalender einen zusätzlichen Kalender
   „MjamOrga" an. In diesem Konto läuft auch das Apps Script.
2. In den Freigabe-Einstellungen des Kalenders trägt er die Google-Adressen der
   anderen ein, Berechtigung „Alle Termindetails anzeigen". Jede Person bekommt
   eine Einladung.
3. Nach dem Annehmen erscheint der Kalender im eigenen Google-Kalender der
   Person, neben deren privaten Terminen, die für andere unsichtbar bleiben.
4. Auf dem Handy wird der Kalender einmal für die Synchronisierung
   freigeschaltet (siehe Abschnitt zum Samsung Kalender).

Der Besitzer kann Personen jederzeit wieder entfernen.

**Mitglieder ohne Google-Konto** (etwa iPhone mit reiner Apple-ID): entweder
ein kostenloses Google-Konto nur für den Kalender anlegen, oder der Besitzer
gibt die **geheime iCal-Adresse** des Kalenders weiter, die Google in den
Kalendereinstellungen bereitstellt. Ein iPhone trägt sie als abonnierten
Kalender ein, ein Android-Handy über ICSx⁵. Das Abholen übernimmt in beiden
Fällen das Handy selbst, die langsame Abfrage aus dem Abschnitt „Geprüft und
verworfen" betrifft nur Google als abholende Seite und spielt hier keine Rolle.

Der Nachteil: Die Termine landen in einem eigenen, geteilten Kalender, nicht im
persönlichen Hauptkalender jedes Einzelnen. In der Praxis ist das eher ein
Vorteil, weil sich der Familienkalender ein- und ausblenden lässt.

#### Anzeige im Samsung Kalender und anderen Handy-Kalendern

Samsung Kalender ist keine eigene Datenquelle, sondern eine Anzeige für alle
Kalender, die auf dem Handy unter **Einstellungen → Konten** eingerichtet sind.
Die App kann selbst keine Kalenderadresse abonnieren und hat keine
Schnittstelle, über die eine Webseite hineinschreiben könnte. Der Weg führt
also immer über ein Konto:

| Konto auf dem Handy | Passt zu | Bewertung |
|---|---|---|
| **Google** | Stufe 3 (geteilter Google-Kalender) und Stufe 2 | **der richtige Weg**, siehe unten |
| Exchange / Microsoft | einem Outlook.com- oder Microsoft-365-Konto | nur sinnvoll, wenn die Familie ohnehin Outlook nutzt; es gibt dafür keinen kostenlosen Hintergrunddienst wie Apps Script, die Termine müssten erst zu Google und von dort per Abonnement nach Outlook, mit stundenlanger Verzögerung |
| Samsung-Konto | Samsung Cloud | keine Schnittstelle für Fremdanwendungen, scheidet aus |

**So kommen die Termine aus Stufe 3 in den Samsung Kalender**

1. Auf dem Handy ist das Google-Konto eingerichtet, das die Einladung zum
   geteilten Kalender „MjamOrga" angenommen hat.
2. **Der geteilte Kalender muss für die Synchronisierung freigeschaltet werden.**
   Android synchronisiert zusätzliche Kalender eines Kontos nicht von selbst,
   nur den Hauptkalender. Das geht in der Google-Kalender-App unter
   Einstellungen → Kalender antippen → „Synchronisieren" einschalten, oder ohne
   die App über `calendar.google.com/calendar/syncselect` im Browser.
3. In Samsung Kalender unter **Kalender verwalten** erscheint der Kalender
   danach unter dem Google-Konto und lässt sich ein- und ausblenden.

Schritt 2 ist der Punkt, an dem es in der Praxis meistens hakt: Der Kalender
ist im Web sichtbar, aber nicht auf dem Handy. Er gehört in die
Einrichtungsanleitung.

Dasselbe gilt für jede andere Kalender-App auf Android und für das iPhone: Konto
hinzufügen, Kalender freischalten, fertig. Auch Outlook liest den geteilten
Google-Kalender, wenn das Google-Konto dort eingerichtet ist.

**Alternative ohne Google-Konto: Abonnement-App auf dem Handy**

Wer kein Google-Konto auf dem Handy haben will, kann eine Abonnement-App
nachrüsten. **ICSx⁵** (quelloffen, auf F-Droid kostenlos, im Play Store und
Galaxy Store gegen eine kleine Gebühr) holt eine Kalenderdatei von einer
Adresse in einstellbarem Abstand ab und stellt sie dem System als Kalender zur
Verfügung. Samsung Kalender zeigt sie dann wie jeden anderen an.

Dafür braucht MjamOrga eine **abrufbare Kalenderdatei**, die aktuell gehalten
wird. Ohne Server bleibt dafür nur der GitHub-Actions-Weg aus dem nächsten
Abschnitt: ein Zeitplan-Auftrag erzeugt die Datei alle paar Minuten neu und
checkt sie ein, GitHub Pages liefert sie aus. Die Verzögerung ist dann die
Summe aus Auftrag (5 bis 30 Minuten) und Abrufabstand der App.

| | Geteilter Google-Kalender | ICSx⁵ plus Kalenderdatei |
|---|---|---|
| Einrichtung je Handy | Konto vorhanden, Kalender freischalten | App installieren, Adresse eintragen |
| Braucht Google-Konto | ja | nein |
| Verzögerung | bis 15 Minuten | 10 bis 45 Minuten |
| Aufwand in MjamOrga | Apps Script, etwa ein Tag | Actions-Auftrag plus Erzeugung, etwa ein Tag |
| Löschungen kommen an | ja | ja, die Datei ist immer der volle Stand |

Der Google-Weg bleibt die Empfehlung, weil auf praktisch jedem Android-Handy
ohnehin ein Google-Konto liegt und nichts installiert werden muss. Die
ICSx⁵-Variante ist die Rückfalllösung für Geräte ohne Google-Konto und lässt
sich später ergänzen, ohne den Google-Weg anzufassen.

**Was nicht geht:** Eine Webseite oder PWA kann auf Android nicht direkt in
den Gerätekalender schreiben, es gibt dafür keine Web-Schnittstelle. Möglich
ist nur, einen einzelnen Termin als `.ics`-Datei zum Öffnen anzubieten; Samsung
Kalender importiert ihn dann nach einem Tipp. Das entspricht Stufe 0, nicht
einer automatischen Übertragung.

#### Geprüft und verworfen

**Firebase Cloud Functions.** Der naheliegende Weg für Hintergrundarbeit, aber
Cloud Functions setzen den Blaze-Tarif voraus, also eine hinterlegte
Zahlungsmethode. Damit fällt der Weg unter der Vorgabe „kostenlos und ohne
Kreditkarte" aus.

**`.ics`-Datei zum Abonnieren hosten.** Google Kalender kann eine Kalenderdatei
per Adresse abonnieren. Der Haken ist die Aktualisierungsrate: Google holt
abonnierte Kalender nur **alle 8 bis 24 Stunden** ab, ohne Möglichkeit, das
einzustellen oder von Hand auszulösen. Ein heute eingetragener Termin für morgen
früh käme womöglich zu spät. Für Apple Kalender wäre es brauchbar, dort ist das
Intervall auf fünf Minuten stellbar.

**Firebase Storage als Ablage für diese Datei.** Zusätzlich seit dem
3. Februar 2026 nur noch im Blaze-Tarif verfügbar, auch für kleine Mengen.

**GitHub Actions als Ersatz-Server.** Ein Zeitplan-Auftrag im Repository könnte
alle 5 Minuten die Kalenderdatei neu erzeugen und einchecken, kostenlos für
öffentliche Repositories. Technisch möglich, scheitert aber am selben Punkt wie
oben: Google fragt die Datei trotzdem nur alle paar Stunden ab. Dazu kommen
Verzögerungen von 5 bis 30 Minuten bei den Aufträgen selbst und die automatische
Abschaltung nach 60 Tagen ohne Aktivität im Repository.

#### Was bewusst nicht geplant ist

**Rückrichtung, also Google → MjamOrga.** Ein Termin, der im Google-Kalender
angelegt oder geändert wird, wandert **nicht** zurück. Das wäre kein kleiner
Zusatz, sondern ein anderes Problem: Es braucht eine Konflikterkennung, wenn
derselbe Termin auf beiden Seiten geändert wurde, eine Erkennung von Löschungen
auf der Gegenseite, und eine Zuordnung fremder Termine, die MjamOrga nie erzeugt
hat. Solange MjamOrga die einzige Quelle ist und Google nur die Anzeige,
bleibt die Sache einfach und geht nicht schief.

**Kalender anderer Anbieter.** Outlook und Apple lesen den geteilten
Google-Kalender ebenfalls, wenn man ihn dort abonniert. Eine eigene Anbindung an
Microsoft oder Apple ist nicht vorgesehen.

#### Empfehlung

1. **Stufe 0 und 1 zusammen mit dem Kalendermodul bauen.** Zusammen unter einem
   Tag Arbeit, ohne jede Einrichtung, und sie decken den Fall „diesen einen
   Termin hätte ich gern auch im Handy" bereits ab.
2. **Stufe 3 als das eigentliche Feature.** Ein Tag Arbeit, einmalige
   Einrichtung, danach läuft es ohne Zutun. Das ist die Umsetzung, die dem
   Wunsch „automatische Einbindung" tatsächlich entspricht.
3. **Stufe 2 nur, wenn die Termine unbedingt im persönlichen Hauptkalender jedes
   Einzelnen stehen sollen.** Sie ist die aufwendigste Variante, verlangt von
   jedem Mitglied eine Anmeldung und läuft trotzdem nur bei geöffneter App.

Der Aufwand für Stufe 3 hängt spürbar davon ab, ob der Abgleich Löschungen und
Wiederholungen sauber beherrschen soll. Ein Skript, das nur neue Termine anlegt,
ist an einem halben Tag fertig; eines, das Änderungen und Löschungen korrekt
nachzieht, braucht den ganzen Tag und einen Testdurchlauf mit einem
Wegwerf-Kalender.

### Navigation

Der Kalender liegt zusammen mit dem Wochenplan in der Gruppe „Planung"
(siehe [Navigationskonzept](#navigationskonzept-zwei-ebenen)). Zwei Seiten:

| Seite | Inhalt |
|---|---|
| `kalender` | Monatsraster |
| `kalender-tag` | Tagesdetail mit Terminen und geplantem Essen |

Das Tagesdetail kann alternativ ein Overlay statt einer eigenen Seite sein. Für
eine eigene Seite spricht, dass es viel Inhalt trägt und den Zurück-Pfeil des
Systems nutzen kann.

### Auswirkung auf den Live-Sync

Wie bei den Listen: ein Bereich `termine` mehr in `BEREICHE`, ein Dokument
`haushalte/{code}/daten/termine`, ein Name mehr in `istBereich()` in den
Sicherheitsregeln. Termine werden selten gleichzeitig bearbeitet, hier reicht
ein Dokument für den ganzen Bereich problemlos aus.

---

## Auswirkungen auf das Gesamtsystem

### Navigationskonzept: zwei Ebenen *(umgesetzt)*

**Entschieden.** Die Bottom-Navigation behält vier Einträge. Verwandte Module
werden zu Gruppen zusammengefasst, die zweite Ebene erscheint als Blasen über
der Navigation.

**Erste Ebene (Bottom-Navigation)**

| Eintrag | Symbol | Enthält |
|---|---|---|
| Dashboard | 🏠 | – (führt direkt zur Seite) |
| Planung | 📅 | Wochenplan, Kalender |
| Einkauf | 🛒 | – (führt direkt zur Einkaufsliste) |
| Listen | 📋 | Rezepte, Listen |

Damit bleibt die Einkaufsliste bei einem Fingertipp erreichbar, so wie es ihr
täglicher Gebrauch verlangt. Wochenplan und Kalender liegen zusammen, weil beide
Einträge über Tage zeigen und dieselben Datumsfunktionen nutzen. Rezepte und
Listen liegen zusammen, weil beide Sammlungen von Dingen sind, die man
durchblättert und aus denen heraus man Punkte auf eine Liste schiebt.

**Zweite Ebene (Blasen)**

Ein Tipp auf einen Gruppen-Eintrag öffnet die zugehörigen Module als kleine
Blasen direkt über der Navigation, waagerecht nebeneinander und über dem
angetippten Eintrag ausgerichtet. Ein Tipp auf eine Blase wechselt zum Modul und
schließt die Blasen.

```
        ┌──────────┐ ┌──────────┐
        │ 📅 Woche │ │ 🗓 Monat │      ← zweite Ebene
        └──────────┘ └──────────┘
  ─────────────────────────────────────
   🏠        📅         🛒       📋      ← erste Ebene
 Dashboard  Planung   Einkauf  Listen
```

**Verhaltensregeln**

1. Einträge **ohne** zweite Ebene (Dashboard, Einkauf) wechseln sofort zur
   Seite, ohne Blasen.
2. Ein erneuter Tipp auf denselben Gruppen-Eintrag schließt die Blasen wieder.
3. Die Blasen schließen außerdem bei: Auswahl einer Blase, Tipp irgendwo daneben,
   Escape-Taste, Wechsel zu einem anderen Navigationseintrag.
4. Das **aktuell offene Modul** ist in der Blasenreihe hervorgehoben, damit man
   sieht, wo man ist.
5. Der Gruppen-Eintrag der ersten Ebene bleibt aktiv markiert, solange irgendein
   Modul der Gruppe offen ist, **einschließlich der Unterseiten**. Ein geöffnetes
   Rezept hält also „Listen" aktiv, genau wie heute `rezept-detail` den
   Rezepte-Tab aktiv hält.
6. Beim Wechsel zurück auf eine Gruppe öffnen sich immer die Blasen, nicht das
   zuletzt benutzte Modul. Ein Tipp führt damit immer zum selben Ergebnis, statt
   von der Vorgeschichte abzuhängen.

**Umsetzung**

Das Seitenmodell aus [00-architektur.md](00-architektur.md) bleibt unverändert:
weiterhin eine `<section class="page">` je Modul, `zeigeSeite(name)` schaltet um.
Neu ist nur eine Zuordnung Seite → Gruppe, an genau einer Stelle:

```js
const NAV_GRUPPEN = {
    dashboard: { label: 'Dashboard', symbol: '🏠', seiten: ['dashboard'] },
    planung:   { label: 'Planung',   symbol: '📅', seiten: ['wochenplan', 'kalender'] },
    einkauf:   { label: 'Einkauf',   symbol: '🛒', seiten: ['einkaufsliste'] },
    listen:    { label: 'Listen',    symbol: '📋', seiten: ['rezepte', 'listen'] },
};

// Unterseiten zählen zur Gruppe ihres Hauptmoduls.
const SEITEN_GRUPPE = {
    'rezept-detail': 'listen', 'rezept-form': 'listen',
    'listen-detail': 'listen', 'kalender-tag': 'planung',
};
```

Aus dieser Struktur werden Navigation und Blasen erzeugt. Ein späteres Modul
kommt dann mit einer Zeile dazu und nicht mit einem Umbau des Markups.

**Zugänglichkeit.** Der Gruppen-Eintrag ist ein Button mit `aria-expanded` und
`aria-controls` auf die Blasenreihe. Die Blasenreihe ist eine Liste fokussierbarer
Elemente; Tabulator läuft hindurch, Escape schließt sie und gibt den Fokus an den
Gruppen-Eintrag zurück. Die Blasen brauchen mindestens 44 mal 44 Pixel
Trefferfläche, damit sie mit dem Daumen sicher zu treffen sind.

**Offene Frage: der Name „Listen".** Die Gruppe heißt „Listen" und enthält ein
Modul, das ebenfalls „Listen" heißt. Beim Aufklappen steht dann „Listen" über
„Rezepte · Listen". Entweder bekommt die Gruppe einen anderen Namen
(„Sammlungen", „Meins") oder das Modul in der Blase heißt „Meine Listen".
Das ist vor dem Bau zu entscheiden, es betrifft nur Beschriftungen.

### Datenmenge und Speicher

Aus drei Schlüsseln werden fünf: `rezepte`, `wochenplan`, `einkaufsliste`,
`listen`, `termine`. Termine und Listenpunkte sind kleine Objekte, die
5-MB-Grenze des `localStorage` bleibt weit entfernt. Relevanter ist, dass alte
Daten sich ansammeln: abgelaufene Listen, Termine vergangener Jahre und der
wachsende Wochenplan. Ein Aufräumschritt (Einträge älter als zwei Jahre
entfernen, nach Rückfrage) gehört mit dem Kalender zusammen umgesetzt.

Beim Duplizieren von Listen wächst der Bestand schneller als bei den anderen
Modulen, weil eine Kopie sofort alle Punkte mitbringt. Die Kachelübersicht
sollte deshalb von Anfang an mit zwanzig oder mehr Listen gut aussehen.

### Export und Import *(umgesetzt)*

Der in [00-architektur.md](00-architektur.md) vorgemerkte Export aller Daten als
eine `.json`-Datei wird mit fünf Schlüsseln wichtiger, nicht unwichtiger. Er
sollte **vor** den beiden neuen Modulen gebaut werden: er ist klein, und er ist
das Sicherheitsnetz, sobald mehr Daten im Spiel sind.

### Schema-Version *(umgesetzt)*

Das ebenfalls vorgemerkte Feld `version` je Schlüssel lohnt sich spätestens mit
dem vierten und fünften Bereich. Beide neuen Module brauchen zwar keine
Migration von Altdaten, künftige Änderungen an ihren Strukturen aber schon.
Ohne Versionsfeld muss jede Migration am Vorhandensein von Feldern raten, statt
eine Zahl zu vergleichen.

### Gemeinsame Bausteine zuerst

Listen und Einkaufsliste teilen sich sichtbar viel: abhakbare Punkte, Bearbeiten,
Massen-Einfügen aus kopiertem Text, erledigte unten. Beim Bau des Listen-Moduls
lohnt es, diese Teile **einmal** zu schreiben und in beiden Modulen zu nutzen,
statt sie zu kopieren. Konkret sind das `zerlegeZeilen()`, das Produkt-Modal und
die Zeilendarstellung mit Abhaken. Sonst driften die beiden Oberflächen
auseinander, obwohl sie sich für den Benutzer gleich anfühlen sollen.

---

## Quellen zur Google-Kopplung

Stand der Prüfung: 9. September 2026.

- [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) – Kalender-Berechtigung ist „sensibel", Prüfung dauert 4 bis 6 Wochen
- [Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en) – Testmodus mit bis zu 100 Testnutzern ohne Prüfung
- [Use the token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model) – im Browser keine Refresh-Token, neues Token nur per Nutzeraktion
- [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas) – 90 Minuten Zeitgeber-Laufzeit, 20.000 externe Abrufe, 5.000 Kalendertermine pro Tag
- [Cloud Storage for Firebase: Abrechnungsänderung](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024) – seit 3. Februar 2026 nur noch im Blaze-Tarif
- [Google Calendar ICS refresh](https://usemooncal.com/en/guides/google-calendar-ics-refresh) – abonnierte Kalenderdateien werden nur alle 8 bis 24 Stunden abgeholt
- [GitHub Actions scheduled workflows](https://cronuru.com/guides/github-actions-scheduled-workflows) – kleinstes Intervall 5 Minuten, Verzögerungen von 5 bis 30 Minuten
- [ICSx⁵](https://icsx5.bitfire.at/usage/) – Abonnement-App für Android, quelloffen, [auf F-Droid](https://f-droid.org/packages/at.bitfire.icsdroid/) kostenlos, im [Galaxy Store](https://galaxystore.samsung.com/detail/at.bitfire.icsdroid) verfügbar
