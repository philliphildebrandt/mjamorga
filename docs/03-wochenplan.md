# Modul: Wochenplan

Planung der Mahlzeiten von Montag bis Sonntag. Bindeglied zwischen Rezepten und
Dashboard.

---

## Funktionen und technische Umsetzung

### Funktionsumfang

1. Je Woche eine **Kachel** mit Zeitraum im Kopf (`07.09.2026 – 13.09.2026`)
2. Sieben Wochentage je Kachel, **Montag zuerst**
3. Je Tag **ein** Eintrag: entweder **Freitext** oder ein **verknüpftes Rezept**
4. Verknüpfte Rezepte sind anklickbar und öffnen die Rezept-Detailansicht
5. **Aktuelle Woche automatisch aufgeklappt**, ältere Wochen zugeklappt
6. Sortierung **neueste Woche zuerst**
7. Neue Woche entsteht **automatisch** beim Wechsel in eine neue Kalenderwoche

### Datenmodell

```json
"wochenplan": {
  "2026-09-07": {
    "0": { "text": "",                "rezeptId": "m1a2b3c4d" },
    "1": { "text": "Pizza bestellen", "rezeptId": null },
    "2": { "text": "",                "rezeptId": null }
  }
}
```

- **Schlüssel der Woche** ist das ISO-Datum des Montags (`YYYY-MM-DD`).
- **Schlüssel des Tages** ist der Index `0`–`6`, Montag bis Sonntag.
- **Je Tag ein Eintrag** mit `text` und `rezeptId` – entsprechend der
  Festlegung „eine Mahlzeit pro Tag“.

Der Wochenschlüssel als ISO-Datum ist bewusst gewählt: Er sortiert sich als
String korrekt (`b.localeCompare(a)` liefert absteigend), ist unabhängig von
Zeitzone und Kalenderwochen-Zählung und lässt sich jederzeit wieder in ein
`Date` zurückrechnen. Eine ISO-Kalenderwochennummer (`2026-KW37`) wäre kürzer,
aber am Jahreswechsel fehleranfällig.

### Wochenberechnung

```js
static getWochenKey(datum) {
    const d = new Date(datum);
    const tag = d.getDay();                 // 0 = Sonntag
    const diff = (tag === 0 ? 6 : tag - 1); // Abstand zum Montag
    const montag = new Date(d);
    montag.setDate(d.getDate() - diff);
    montag.setHours(0, 0, 0, 0);
    return `${jahr}-${monat}-${tagDesMonats}`;
}
```

`setDate()` mit negativem Ergebnis rollt korrekt über Monats- und Jahresgrenzen
zurück – eine eigene Kalenderrechnung ist nicht nötig. Der Schlüssel wird aus
den **lokalen** Datumsanteilen gebaut, nicht über `toISOString()`, damit ein
Aufruf am späten Abend nicht in der Vorwoche landet.

### Automatische Wochen

Beim Rendern des Wochenplans wird geprüft, ob `getAktuelleWoche()` bereits als
Schlüssel existiert. Fehlt sie, wird eine leere Woche erzeugt und gespeichert.
Dadurch braucht es keinen Timer und keinen Hintergrundprozess: Die neue Woche
entsteht beim ersten Aufruf in dieser Woche. Wichtig ist, die Schlüsselliste
**nach** diesem Schritt einzusammeln – sonst fehlt die frisch angelegte Woche in
der ersten Darstellung.

Alte Wochen werden nicht automatisch gelöscht; sie bilden die Historie aus
Abschnitt 11.

### Auf- und Zuklappen

Der Aufklappzustand ist reine Oberfläche und wird deshalb **nicht** persistiert,
sondern in einem `Set` im Anwendungsobjekt gehalten. Die aktuelle Woche wird
beim ersten Rendern hinzugefügt und ist damit immer offen. Das Umschalten
erfolgt über die Klasse `geoeffnet` auf der Kachel; CSS blendet den Inhalt ein
und dreht den Pfeil.

### Eingabe je Tag

Jede Tageszeile besteht aus dem Tagesnamen mit Datum (feste Breite, damit die
Zeilen sauber untereinander stehen) und dem Eingabebereich für die eine Mahlzeit
des Tages. Der Eingabebereich hat zwei Zustände:

| Zustand | Darstellung |
|---|---|
| kein Rezept verknüpft | Textfeld für Freitext + Auswahlliste „Rezept wählen“ |
| Rezept verknüpft | Rezepttitel mit Sternen als Link + Button zum Lösen der Verknüpfung |

Die Auswahlliste wird bei jedem Rendern aus dem aktuellen Rezeptbestand
aufgebaut. Wird ein Rezept gewählt, ersetzt die Verknüpfung die Freitextanzeige;
der eingegebene Text bleibt im Datensatz erhalten und kommt beim Lösen der
Verknüpfung zurück.

Der heutige Tag wird in der aktuellen Woche farblich hervorgehoben
(`.tages-zeile.heute`).

### Speicherzeitpunkt

Freitext wird bei `change` bzw. beim Verlassen des Feldes gespeichert, nicht bei
jedem Tastendruck. Das hält die Schreibvorgänge gering und vermeidet ein
Neu-Rendern, das den Fokus verlieren würde.

### Interaktion

Alle Klicks und Änderungen laufen über **Event-Delegation** auf dem
Wochenplan-Container. Die betroffene Zeile identifiziert sich über
`data-woche` und `data-tag`, die auszuführende Aktion über `data-aktion`. Ein
einziger Satz Listener überlebt damit jedes Neu-Rendern.

### Verbindung zu den anderen Modulen

- **→ Rezepte:** über `rezeptId`; Titel, Sterne und Bild werden zur Anzeigezeit
  nachgeschlagen, nie kopiert.
- **→ Dashboard:** das Dashboard liest denselben Datensatz für den heutigen Tag.
- **← Rezepte:** beim Löschen eines Rezepts räumt das Rezeptmodul die Verweise
  hier auf.

---

## Verbesserungen

**Vergangene Wochen erreichbar machen.** Automatisch entsteht nur die aktuelle
Woche. Wer nachträglich die Vorwoche dokumentieren oder die **nächste** Woche
vorplanen will, hat aktuell keine Möglichkeit. Zwei Schaltflächen
„◀ Vorherige Woche“ / „Nächste Woche ▶“, die eine leere Woche anlegen, schließen
die auffälligste Funktionslücke des Moduls – Vorausplanung ist der eigentliche
Zweck eines Wochenplans.

**Rezept per Suche statt Auswahlliste.** Ein `<select>` mit hundert Rezepten ist
auf dem Smartphone kaum bedienbar. Besser: ein Antippen öffnet ein Overlay mit
Suchfeld und Trefferliste inklusive Vorschaubild.

**Mehrere Mahlzeiten pro Tag.** Aktuell festgelegt ist ein Eintrag je Tag. Wenn
Frühstück und Abendessen später doch geplant werden sollen, wird aus
`{ text, rezeptId }` ein Objekt mit drei solchen Einträgen; die Wochenansicht
zeigt das Hauptessen prominent und die übrigen kompakt darunter. Der Umbau
betrifft `storage.js`, das Wochenplan-Rendering und das Dashboard.

**Eintrag in einen anderen Tag verschieben.** Ein „Verschieben“-Eintrag oder,
komfortabler, Drag & Drop innerhalb der Woche. Pläne ändern sich häufiger, als
sie neu entstehen.

**Woche kopieren.** „Diese Woche aus letzter Woche übernehmen“ – ein Klick, der
den Vorwochen-Datensatz dupliziert. Bei wiederkehrenden Essensrhythmen die mit
Abstand größte Zeitersparnis.

**Leere Wochen aufräumen.** Vollständig leere, vergangene Wochen müssen nicht in
der Historie stehen. Ein stiller Aufräumschritt beim Laden hält die Liste kurz;
alternativ eine Anzeigegrenze („ältere Wochen anzeigen“) ab zwölf Wochen.

**Notiz je Woche.** Ein freies Feld im Kachelkopf („Besuch am Samstag“) ordnet
die Planung ein, ohne einem Tag zugeordnet zu sein.

**Zustand des Aufklappens merken.** Wer eine ältere Woche aufklappt und zwischen
den Bereichen wechselt, findet sie wieder zugeklappt vor. Das `Set` in den
Sitzungsspeicher zu schreiben, kostet zwei Zeilen.

**Einkaufsliste aus der Woche erzeugen.** Vorgemerkt aus Abschnitt 19: Ein Button
„Einkaufsliste für diese Woche“, der die Zutaten aller verknüpften Rezepte
sammelt. Setzt das Feld `zutaten` im Rezeptmodul voraus – deshalb sollte dieses
Feld früh angelegt werden.
