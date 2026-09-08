# Modul: Rezepte

Zentrale Sammlung aller Rezepte. Einzige Quelle der Wahrheit für Rezeptdaten –
Wochenplan und Dashboard verweisen nur per ID hierher.

---

## Funktionen und technische Umsetzung

### Funktionsumfang

1. **Rezeptliste** als Kartenraster
2. **Rezept anlegen**
3. **Rezept bearbeiten** (Titel, Link, Text, Zutaten, Bewertung, Bild)
4. **Rezept löschen** inklusive Aufräumen aller Verknüpfungen
5. **Detailansicht** mit großem Bild, Sternen, Link und Text
6. **Sternebewertung** 1–5, in Liste und Detailansicht sichtbar
7. **Automatische Bildermittlung** aus einem hinterlegten Link (siehe unten)

### Datenmodell

```json
{
  "id": "m1a2b3c4d",
  "titel": "Spaghetti Bolognese",
  "link": "https://example.com/rezept",
  "text": "Zwiebeln anschwitzen ...",
  "zutaten": ["500 g Nudeln", "2 Dosen Tomaten", "1 Zwiebel"],
  "bewertung": 5,
  "bildUrl": "https://example.com/bild.jpg",
  "bildQuelle": "og:image",
  "erstellt": "2026-09-07T18:00:00.000Z",
  "geaendert": "2026-09-07T18:00:00.000Z"
}
```

`id` wird aus Zeitstempel plus Zufallsanteil gebildet
(`Date.now().toString(36) + Math.random().toString(36).slice(2, 11)`) – kollisionsfrei
genug für eine Ein-Geräte-App und ohne Abhängigkeit von `crypto.randomUUID()`.

`zutaten` ist ein Array von Zeilen. Das Feld wird jetzt schon angelegt und
angezeigt, obwohl die Übernahme in die Einkaufsliste (Abschnitt 19) noch nicht
definiert ist – nachträglich wäre es der teuerste Umbau, weil alle bestehenden
Rezepte von Hand nachgepflegt werden müssten. Erfasst wird es als Textfeld mit
einer Zutat pro Zeile und beim Speichern in ein Array zerlegt.

`bildQuelle` dokumentiert, woher `bildUrl` stammt (`manuell`, `og:image`,
`url-heuristik`), damit eine automatisch ermittelte URL später erneut ermittelt
werden darf, eine manuell eingetragene aber nie überschrieben wird.

### Drei Ansichten, drei Sections

| Section | Zweck |
|---|---|
| `#page-rezepte` | Kartenliste |
| `#page-rezept-detail` | Vollansicht eines Rezepts |
| `#page-rezept-form` | Anlegen und Bearbeiten |

Anlegen und Bearbeiten teilen sich **ein** Formular. Unterschieden wird über das
versteckte Feld `formRezeptId`: leer = neues Rezept, gefüllt = Update. Der
Löschen-Button ist nur im Bearbeiten-Fall sichtbar. Das vermeidet zwei fast
identische Formulare.

### Kartenliste

CSS Grid, einspaltig auf dem Smartphone, zweispaltig ab 768 px, dreispaltig ab
1024 px. Jede Karte zeigt Vorschaubild (`object-fit: cover`, feste Höhe), Titel
und Sterne. Fehlt ein Bild oder schlägt das Laden fehl, greift ein
Emoji-Platzhalter auf hellem Grund – umgesetzt über einen `onerror`-Wechsel auf
das direkt folgende Platzhalter-Element, damit kein kaputtes Bildsymbol stehen
bleibt.

### Sternebewertung

Anzeige: fünf Emoji-Sterne, die nicht erreichten mit `opacity: 0.25` statt eines
zweiten Symbols. Das hält die Zeilenbreite konstant.

Eingabe: fünf `<button type="button">` mit `data-wert="1..5"`. Ein Klick schreibt
den Wert in ein verstecktes Feld und setzt die Klasse `aktiv` auf alle Sterne bis
zu diesem Wert. Beim Überfahren mit der Maus wird die Auswahl vorab angezeigt und
beim Verlassen auf den gespeicherten Wert zurückgesetzt.

### Automatisches Rezeptbild

Der Browser kann fremde Seiten **nicht** auslesen: Ein `fetch()` auf eine externe
HTML-Seite scheitert an der Same-Origin-Policy, solange die Zielseite keine
CORS-Header sendet – und Rezeptseiten tun das nicht. `og:image` ist rein
clientseitig also nicht direkt erreichbar. Die Umsetzung erfolgt deshalb in
Stufen, von der zuverlässigsten zur unsichersten:

1. **Manuelle Bild-URL.** Ein eigenes Formularfeld. Immer verfügbar, immer
   zuverlässig, hat Vorrang vor jeder Automatik.
2. **URL-Heuristik.** Zeigt der Link selbst auf eine Bilddatei
   (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.avif`), wird er direkt als
   Bildquelle übernommen.
3. **Server-Auswertung – zurückgestellt.** Sobald ein Backend zur Verfügung
   steht (PHP oder eine Serverless-Funktion), holt dieses die Zielseite, liest
   den `<head>` und liefert die Bildadresse zurück. Gesucht wird dann in dieser
   Reihenfolge: `og:image` → `twitter:image` → `link[rel="image_src"]`. Bis
   dahin bleibt diese Stufe **nicht umgesetzt**; das Feld `bildQuelle` ist
   bereits dafür vorgesehen. Ein öffentlicher CORS-Proxy als Zwischenlösung
   wurde bewusst verworfen – er würde jede aufgerufene Adresse mitlesen.

4. **Platzhalter.** Findet keine Stufe ein Bild, bleibt es beim neutralen
   Emoji-Platzhalter. Kein Fehler, kein Blockieren des Speicherns.

Die Ermittlung läuft beim Verlassen des Link-Feldes und schreibt ihr Ergebnis nur
dann, wenn das Bildfeld noch leer ist. Der Status wird als kurzer Hinweistext
unter dem Feld ausgegeben.

### Löschen und referenzielle Integrität

Nach Bestätigung wird das Rezept aus dem Array entfernt. Anschließend läuft der
gesamte Wochenplan durch und setzt jede `rezeptId`, die auf das gelöschte Rezept
zeigt, auf `null` – der bereits vorhandene Freitext bleibt erhalten. Nur wenn
tatsächlich etwas geändert wurde, wird der Wochenplan neu gespeichert.

### Sicherheit

Titel, Text und Bild-URL werden beim Rendern durch `escapeHtml()` geschickt.
Beim Speichern wird der Link über `new URL()` geprüft und nur bei Schema
`http:`/`https:` übernommen – damit lässt sich kein `javascript:`-Link ablegen,
der beim Antippen in der Detailansicht ausgeführt würde.

---

## Verbesserungen

**Suche und Sortierung.** Ab etwa zwanzig Rezepten wird die Liste unhandlich. Ein
Suchfeld über dem Raster (Titel und Text, einfacher `includes`-Filter) sowie eine
Sortierung nach Bewertung, Titel und Anlagedatum sind billig umzusetzen und der
größte Alltagsgewinn dieses Moduls. Aktuell erscheinen Rezepte in
Einfügereihenfolge – für eine wachsende Sammlung die schlechteste Reihenfolge.

**Tags oder Kategorien.** Ein Feld `tags: []` („schnell“, „vegetarisch“,
„Kinder“) mit Filterleiste über der Liste. Passt zur geplanten Erweiterbarkeit
und ist im Datenmodell rückwärtskompatibel.

**Halbe Sterne oder Null-Bewertung.** Aktuell lässt sich eine einmal gesetzte
Bewertung nicht mehr auf „unbewertet“ zurücksetzen. Ein erneuter Klick auf den
bereits aktiven Stern sollte auf 0 zurückstellen.

**Ungespeicherte Änderungen schützen.** Der Zurück-Button im Formular verwirft
Eingaben ohne Nachfrage. Ein Vergleich mit dem Ausgangszustand und eine kurze
Rückfrage verhindert Datenverlust.

**Zutaten in die Einkaufsliste übernehmen.** Das Feld `zutaten` ist vorhanden und
wird angezeigt. Der nächste Schritt wäre ein Button „Zutaten zur Einkaufsliste“
in der Detailansicht, der jede Zeile als Produkt anlegt. Bewusst noch nicht
umgesetzt, weil Abschnitt 19 die Verknüpfung erst noch festlegt.

**Bild aus der Galerie.** Ein `<input type="file" accept="image/*">` mit
Verkleinerung über ein Canvas auf ca. 800 px Kantenlänge und Ablage als Data-URL.
Wegen der Speichergrenze von `localStorage` erst zusammen mit dem Umzug nach
IndexedDB sinnvoll.

**Verweis-Anzeige beim Löschen.** Ein Hinweis „Dieses Rezept ist in 3 Wochentagen
eingeplant“ vor dem Löschen macht die Konsequenz sichtbar.

**Portionsangabe und Zubereitungszeit.** Zwei kleine Felder, die die Karten
deutlich informativer machen. Optional, aber günstig.
