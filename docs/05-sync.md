# MjamOrga – Live-Sync über Firebase Firestore

Mehrere Geräte teilen sich einen Datenstand: Rezepte, Wochenplan, Einkaufsliste und Listen.
Änderungen erscheinen auf allen verbundenen Geräten innerhalb von Sekunden.

Die App bleibt eine statische Seite auf GitHub Pages. Nur die Daten liegen in
Firestore. Ohne eingetragene Konfiguration läuft alles wie bisher mit `localStorage`.

---

## Einrichtung in der Firebase-Konsole (einmalig, ca. 10 Minuten)

Voraussetzung: ein Firebase-Projekt im **Spark-Tarif** (kostenlos, keine Zahlungsmethode).

### 1. Firestore-Datenbank anlegen

1. Linke Leiste: **Build → Firestore Database → Datenbank erstellen**.
2. Edition: **Standard** (Voreinstellung, nicht Enterprise).
3. Standort: `eur3 (europe-west)` oder `europe-west3 (Frankfurt)`. Der Standort ist
   nachträglich nicht änderbar.
4. Sicherheitsregeln: **Produktionsmodus** wählen. Die eigentlichen Regeln kommen in Schritt 3.

### 2. Anonyme Anmeldung aktivieren

1. **Build → Authentication → Jetzt starten**.
2. Reiter **Sign-in method → Neuen Anbieter hinzufügen → Anonym → Aktivieren → Speichern**.

Jedes Gerät bekommt damit eine feste, anonyme Nutzer-ID. Niemand muss ein Konto anlegen.

### 3. Sicherheitsregeln einspielen

1. **Firestore Database → Reiter „Regeln"**.
2. Den kompletten Inhalt von [`firestore.rules`](../firestore.rules) hineinkopieren.
3. **Veröffentlichen**.

Kommt später ein Bereich dazu (so wie `listen` mit dem Listen-Modul) oder ein
Feld im Dokument (so wie `version`), muss die Datei erneut eingespielt werden. Andernfalls lehnt Firestore Schreibvorgänge auf
den neuen Bereich ab, und der Statuspunkt wird rot mit „Zugriff verweigert".

Die Regeln lassen nur angemeldete Geräte an die vier Dokumente eines Haushalts,
und nur mit exakt den Feldern, die die App schreibt.

### 4. Web-App registrieren und Konfiguration eintragen

1. **Projektübersicht → Zahnrad → Projekteinstellungen → Meine Apps → Web-App
   hinzufügen** (Symbol `</>`).
2. Spitzname z. B. `MjamOrga`. Firebase Hosting **nicht** anhaken (die Seite bleibt
   auf GitHub Pages).
3. Im angezeigten Block stehen `apiKey`, `authDomain`, `projectId` usw.
   Diese Werte in [`js/firebase-config.js`](../js/firebase-config.js) eintragen.
4. Committen und pushen. GitHub Pages baut neu.

Der `apiKey` ist öffentlich und darf im Repo stehen. Er identifiziert nur das
Projekt; was erlaubt ist, entscheiden allein die Regeln aus Schritt 3.

### 5. Autorisierte Domain prüfen

**Authentication → Settings → Autorisierte Domains**: `localhost` und die
`*.firebaseapp.com`-Domain stehen schon drin. Die GitHub-Pages-Domain
(`benutzername.github.io`) zusätzlich eintragen. Für die anonyme Anmeldung ist das
nicht zwingend, schadet aber nicht und ist Voraussetzung, falls später eine
Anmeldung per Google-Konto dazukommt.

---

## Bedienung

Auf dem Dashboard oben rechts sitzt das **☁️-Symbol** mit einem Statuspunkt.

| Punkt | Bedeutung |
|---|---|
| grün | live verbunden |
| gelb blinkend | verbindet gerade |
| grau | offline, Änderungen werden nachgetragen |
| rot | Fehler, Text im Modal beachten |
| kein Punkt | Sync nicht eingerichtet |

**Erstes Gerät:** ☁️ → **Neuen Haushalt anlegen**. Es entsteht ein zufälliger Code
wie `mjam-k3f9-x2qa-7pd4`, und die Daten dieses Geräts werden hochgeladen.

**Weitere Geräte:** ☁️ → Code eingeben → **Beitreten**. Vorhandene lokale Daten
werden mit denen des Haushalts vereint (siehe unten), nichts geht verloren.

**Trennen:** ☁️ → **Gerät trennen**. Die Daten bleiben auf dem Gerät, werden aber
nicht mehr abgeglichen.

Der Haushaltscode ist das einzige Zugangsgeheimnis. Wer ihn kennt, kann alles
lesen und ändern. Deshalb: nur an Haushaltsmitglieder weitergeben, nicht öffentlich
posten.

---

## Wie es technisch läuft

```
app.js  ──speichere──▶  storage.js  ──▶  localStorage        (immer, sofort)
                            │
                            └────────▶  sync.js  ──▶  Firestore   (falls verbunden)
                                             ◀──  onSnapshot (andere Geräte)
                            ◀── uebernimmExtern ──┘
app.js  ◀──beiExternerAenderung──  storage.js
```

- **storage.js** ist die Drehscheibe. `localStorage` bleibt die erste Ablage, die
  App startet sofort und ohne Netz. Ist ein Sync-Adapter registriert, spiegelt
  `speichere()` jede Änderung zusätzlich dorthin.
- **sync.js** ist ein ES-Modul und lädt das Firebase-SDK vom Google-CDN. Lädt es
  nicht (Erststart ohne Netz), passiert nichts weiter, die App läuft lokal.
- **Ein Dokument je Bereich**, Pfad `haushalte/{code}/daten/{bereich}`, Feld `wert`
  enthält exakt die Struktur, die auch im `localStorage` liegt. Das Feld
  `version` trägt die Schema-Version; ältere Dokumente werden beim Lesen gehoben,
  neuere lösen den Abwärtsschutz aus (siehe
  [09-datensicherung.md](09-datensicherung.md)).
- **Echo-Vermeidung:** Der eigene Schreibvorgang kommt sofort als Snapshot zurück.
  Snapshots mit `hasPendingWrites` werden ignoriert, und `uebernimmExtern()`
  vergleicht zusätzlich per JSON mit dem lokalen Stand. Nur echte Änderungen
  lösen ein Neu-Rendern aus.
- **Schreiben gebündelt:** Schnelle Folgeänderungen (mehrfach abhaken) werden
  300 ms gesammelt. Beim Verlassen der Seite wird sofort geschrieben.
- **Offline:** Firestore puffert Schreibvorgänge in IndexedDB und schickt sie beim
  nächsten Kontakt nach. Der Status wechselt auf „Offline".
- **Eingabeschutz:** Kommt eine Änderung, während ein Eingabefeld den Fokus hat,
  wartet das Neu-Rendern bis zum Verlassen des Feldes. Sonst würde der
  getippte Text verschwinden.
- **Erstabgleich beim Beitreten:** Listen werden per ID vereint (bei gleicher ID
  gewinnt der Haushalt), Wochenpläne pro Tag (ein gefüllter Tag schlägt einen
  leeren). Das Ergebnis wird auf beiden Seiten gespeichert.

---

## Grenzen und Konfliktverhalten

**Letzter Schreiber gewinnt.** Jeder Bereich ist ein Dokument. Ändern zwei Geräte
gleichzeitig dieselbe Einkaufsliste, überschreibt der spätere Schreibvorgang den
früheren. Im Alltag (Abhaken im Abstand von Sekunden) fällt das nicht auf; bei
exakt gleichzeitigen Änderungen kann ein Haken verloren gehen. Sauberer wäre ein
Dokument pro Produkt, das ist bei Bedarf ein überschaubarer Umbau in `sync.js`.

**Dokumentgröße 1 MiB.** Rezepte mit Text und Zutaten sind wenige KB, mehrere
hundert Rezepte passen. Bilder werden nur als URL gespeichert, nie als Datei.

**Kontingent.** Spark-Tarif: 50.000 Lesevorgänge, 20.000 Schreibvorgänge pro Tag.
Ein App-Start liest vier Dokumente, jede Änderung ist ein Schreibvorgang. Eine
Familie liegt weit unter einem Prozent davon. Wird das Kontingent erreicht, lehnt
Firestore bis zum nächsten Tag ab; es entstehen keine Kosten.

**Alte Wochen** bleiben im Wochenplan-Dokument und wachsen langsam mit. Ein
Aufräumen (Wochen älter als ein Jahr entfernen) ist ein möglicher späterer Schritt.
