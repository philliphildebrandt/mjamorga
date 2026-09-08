# Modul: Einkaufsliste

Einfache, mobile Liste der benötigten Produkte. Bewusst schlank gehalten und für
die spätere Anbindung an Rezepte und Wochenplan vorbereitet.

---

## Funktionen und technische Umsetzung

### Funktionsumfang

1. Alle Produkte untereinander, **nach Kategorie gruppiert**
2. **Abhaken durch Antippen** – erledigte Produkte werden durchgestrichen und
   bleiben in der Liste
3. **Produkt hinzufügen** über einen deutlich sichtbaren Button
4. Jedes Produkt hat **Name** und **Kategorie**
5. **Produkt bearbeiten** – Name und Kategorie jederzeit änderbar
6. **Mehrere Produkte gleichzeitig** aus kopiertem Text einfügen
7. Einzelne Produkte löschen

### Datenmodell

```json
"einkaufsliste": [
  {
    "id": "p9x8y7z6",
    "name": "500 g Nudeln",
    "kategorie": "Vorräte",
    "erledigt": false,
    "erstellt": "2026-09-07T18:05:00.000Z"
  }
]
```

Ein flaches Array, keine Verschachtelung nach Kategorie. Die Gruppierung
entsteht erst beim Rendern. Dadurch bleibt ein Kategoriewechsel eine einzige
Feldänderung, und das Umbenennen oder Ergänzen von Kategorien berührt die
gespeicherten Daten nicht.

### Kategorien

Die Kategorien liegen als **eine Konstante an einer Stelle**:

```js
const KATEGORIEN = [
    'Obst & Gemüse', 'Fleisch', 'Milchprodukte', 'Getränke',
    'Tiefkühl', 'Vorräte', 'Haushalt', 'Sonstiges'
];
```

Diese Liste speist sowohl das Auswahlfeld im Formular als auch die
Gruppenreihenfolge in der Anzeige – die Reihenfolge entspricht grob einem
Supermarkt-Rundgang. Eine Kategorie zu ergänzen bedeutet damit genau eine
Zeile Änderung, wie in Abschnitt 17 gefordert. Produkte mit einer unbekannten
Kategorie (z. B. aus älteren Daten) landen am Ende unter „Sonstiges“, statt zu
verschwinden.

### Gruppierte Darstellung

Beim Rendern werden die Produkte über `reduce` nach Kategorie gebündelt und in
der Reihenfolge von `KATEGORIEN` ausgegeben. Leere Kategorien erscheinen nicht.
Innerhalb einer Gruppe stehen offene Produkte oben, erledigte unten – so bleibt
das Wesentliche im Blick, ohne dass abgehakte Einträge verschwinden (Abschnitt 15).

Jede Produktzeile besteht aus Checkbox-Feld, Name, Bearbeiten- und
Löschen-Button. Ein Kategorie-Chip in der Zeile wäre redundant – die Kategorie
steht bereits in der Gruppenüberschrift darüber – und würde bei längeren Namen
den Umbruch erzwingen; er entfällt deshalb.

Die gesamte Zeile ist Touch-Fläche für das Abhaken. Die beiden Buttons tragen ein
eigenes `data-aktion` und werden in der Delegation vor der Zeile ausgewertet
(`closest('[data-aktion]')` trifft zuerst den Button), sodass kein
`stopPropagation` nötig ist.

### Abhaken

Ein Antippen kehrt `erledigt` um, speichert und schaltet die Klasse `erledigt`
an der Zeile um. CSS erledigt den Rest: grüner Haken, durchgestrichener und
abgeblendeter Text. Bewusst **kein** vollständiges Neu-Rendern der Liste – so
bleiben Scrollposition und Rhythmus beim Einkaufen erhalten.

### Produkt hinzufügen

Der Button in der Kopfzeile öffnet ein Modal, das auf dem Smartphone von unten
einfährt (Bottom-Sheet) und auf größeren Bildschirmen als zentrierte Karte
erscheint. Das Modal enthält beide Wege: das Einzelformular und darunter, durch
einen „oder“-Trenner abgesetzt, das Massen-Eingabefeld. Geschlossen wird über
das ✕ oder einen Klick auf den Hintergrund.

Nach dem Hinzufügen bleibt das Modal offen und das Namensfeld wird geleert und
fokussiert – mehrere Produkte nacheinander sind der Normalfall.

### Produkt bearbeiten

Der Stift-Button einer Zeile öffnet dasselbe Modal im Bearbeiten-Modus. Wie beim
Rezeptformular unterscheidet ein verstecktes Feld die beiden Fälle:
`produktId` leer = neues Produkt, gefüllt = Aktualisierung. Im Bearbeiten-Modus
ändern sich Überschrift und Button-Beschriftung, das Massen-Eingabefeld wird
ausgeblendet, und Name und Kategorie sind vorbelegt (der Name zusätzlich
markiert, damit Überschreiben ohne Löschen möglich ist).

Gespeichert werden ausschließlich `name` und `kategorie` – `id`, `erledigt` und
`erstellt` bleiben unangetastet. Ein Wechsel der Kategorie sortiert das Produkt
beim folgenden Rendern automatisch in die andere Gruppe ein, weil die Gruppierung
erst zur Anzeigezeit entsteht.

Damit ist insbesondere die Nacharbeit nach dem Masseneinfügen möglich, bei dem
alle Zeilen dieselbe Kategorie erhalten.

### Mehrere Produkte gleichzeitig einfügen

Der eingefügte Text wird zeilenweise verarbeitet:

```js
text.split(/\r?\n/)
    .map(z => z.replace(/^\s*(?:[-*•‣▪]\s+|\d+[.)]\s+)/, '').trim())
    .filter(z => z.length > 0)
```

Behandelt werden dabei:

- Windows- und Unix-Zeilenumbrüche
- führende Aufzählungszeichen (`-`, `*`, `•`) und Nummerierungen (`1.`, `2)`) –
  jeweils nur mit folgendem Leerzeichen, damit „500 g Nudeln“ unangetastet bleibt
- leere Zeilen und reine Leerzeichen-Zeilen

Mengenangaben bleiben **bewusst Teil des Namens** („500 g Nudeln“). Das
entspricht dem Beispiel in Abschnitt 18 und vermeidet eine fehleranfällige
Einheitenerkennung. Alle so erzeugten Produkte bekommen die im Modal gewählte
Kategorie und können anschließend einzeln umkategorisiert werden.

Die Verarbeitung erfolgt in einem Durchgang mit einem einzigen Schreibvorgang am
Ende – auch bei langen Listen bleibt das schnell (Abschnitt 18).

### Interaktion

Wie in den übrigen Modulen läuft alles über Event-Delegation auf dem Container.
Die Produktzeile trägt ihre `data-id`, der geklickte Bereich entscheidet über die
Aktion.

### Vorbereitung für die Anbindung an Rezepte und Wochenplan

Abschnitt 19 ist bewusst noch nicht ausdefiniert. Vorbereitet ist lediglich:

- Produkte sind ein flaches Array mit stabilen IDs – Ergänzungen aus anderen
  Modulen sind reine Anfügeoperationen.
- Ein optionales Feld `quelle` (`{ "typ": "rezept", "rezeptId": "..." }`) kann
  jederzeit ergänzt werden, ohne bestehende Daten zu brechen.

Mehr wird an dieser Stelle nicht vorweggenommen.

---

## Verbesserungen

**Erledigte Produkte entfernen.** Erledigtes bleibt laut Abschnitt 15 in der
Liste – nach mehreren Einkäufen wird sie dadurch unbrauchbar lang. Ein Button
„Erledigte entfernen“ mit Anzahl-Angabe löst das, ohne das automatische
Verschwinden einzuführen. Das ist die dringendste Ergänzung dieses Moduls.

**Kategorie direkt in der Zeile umschalten.** Das Bearbeiten läuft über das
Modal. Für den häufigsten Fall – nur die Kategorie korrigieren – wäre ein
Auswahlfeld direkt in der Zeile schneller, kostet aber Platz. Alternative: im
Bearbeiten-Modal die Kategorien als antippbare Chips statt als Auswahlfeld.

**Automatische Kategorievorschläge.** Ein kleines Stichwortverzeichnis
(„Milch“, „Käse“, „Joghurt“ → Milchprodukte) kann beim Masseneinfügen jede Zeile
vorkategorisieren. Selbst mit fünfzig Stichwörtern trifft das die Mehrheit der
Alltagsprodukte und spart die meiste Nacharbeit.

**Doppelte Einträge erkennen.** Beim Hinzufügen prüfen, ob ein gleichnamiges,
offenes Produkt existiert, und statt eines zweiten Eintrags einen Hinweis zeigen.

**Rückgängig nach dem Löschen.** Ein Toast mit „Rückgängig“ für einige Sekunden –
auf dem Smartphone passieren Fehlgriffe beim Löschen leicht.

**Sortierung innerhalb der Kategorie.** Derzeit gilt die Einfügereihenfolge.
Alphabetisch wäre beim Suchen im Regal schneller; sinnvollerweise als
umschaltbare Option.

**Häufige Produkte als Schnellwahl.** Eine Zeile mit den am häufigsten
hinzugefügten Produkten über dem Formular ersetzt für Milch, Butter und Eier das
Tippen komplett.

**Einkaufsmodus.** Eine reduzierte Vollbildansicht mit großen Zeilen ohne
Kategorie-Chips und Löschen-Buttons – für die Bedienung mit einer Hand im
Supermarkt.
