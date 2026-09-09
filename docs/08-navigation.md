# Navigation: zwei Ebenen

Die Bottom-Navigation hat vier Einträge. Verwandte Module sind zu Gruppen
zusammengefasst, die zweite Ebene erscheint als Blasen über dem angetippten
Eintrag.

---

## Funktionen und technische Umsetzung

### Erste Ebene

| Eintrag | Symbol | Enthält |
|---|---|---|
| Dashboard | 🏠 | führt direkt zur Seite |
| Planung | 📅 | Wochenplan, Kalender (ausgegraut, kommt später) |
| Einkauf | 🛒 | führt direkt zur Einkaufsliste |
| Listen | 📋 | Rezepte, Meine Listen |

Die Einkaufsliste bleibt mit einem Fingertipp erreichbar. Wochenplan und
Kalender teilen sich eine Gruppe, weil beide Einträge über Tage zeigen. Rezepte
und Listen teilen sich eine Gruppe, weil beide Sammlungen sind, aus denen heraus
Punkte auf eine Liste wandern.

### Zweite Ebene

Ein Tipp auf einen Gruppen-Eintrag öffnet die Module der Gruppe als Blasen
direkt darüber, waagerecht nebeneinander. Auf dem Desktop sitzt die Navigation
oben, dort klappen die Blasen nach unten.

**Verhaltensregeln**

1. Einträge mit genau einer Seite (Dashboard, Einkauf) wechseln sofort
2. Erneuter Tipp auf denselben Gruppen-Eintrag schließt die Blasen
3. Die Blasen schließen bei Auswahl einer Blase, Tipp daneben, Escape und beim
   Öffnen einer anderen Gruppe
4. Das aktuell offene Modul ist in der Blasenreihe hervorgehoben
5. Der Gruppen-Eintrag bleibt aktiv, solange irgendeine Seite der Gruppe offen
   ist, Unterseiten eingeschlossen (ein geöffnetes Rezept hält „Listen" aktiv)
6. Ein Tipp auf eine Gruppe öffnet immer die Blasen, nie direkt das zuletzt
   benutzte Modul. Derselbe Tipp führt immer zum selben Ergebnis

**Ausgegraute Blase.** Der Kalender ist mit `deaktiviert` und
`aria-disabled="true"` markiert und trägt ein „bald"-Badge. Ein Tipp zeigt einen
Hinweis und lässt die Blasen offen.

### Umsetzung

Das Seitenmodell bleibt: eine `<section class="page">` je Seite, `zeigeSeite()`
schaltet um. Neu ist die Zuordnung Seite → Gruppe an einer Stelle in `app.js`:

```js
const SEITEN_GRUPPE = {
    dashboard: 'dashboard',
    wochenplan: 'planung', kalender: 'planung',
    einkaufsliste: 'einkauf',
    rezepte: 'listen', 'rezept-detail': 'listen', 'rezept-form': 'listen',
    listen: 'listen', 'listen-detail': 'listen',
};
const HAUPTSEITE = { 'rezept-detail': 'rezepte', 'rezept-form': 'rezepte', 'listen-detail': 'listen' };
```

`zeigeSeite()` setzt den aktiven Gruppen-Eintrag über `SEITEN_GRUPPE`.
`toggleBlasen()` hebt über `HAUPTSEITE` die Blase des aktuellen Moduls hervor.
Im Markup ist jede Gruppe ein `.nav-gruppe` mit dem Eintrag und einer
`.nav-blasen`-Reihe; direkte Einträge tragen `data-page`, Gruppen-Einträge
`aria-controls` auf ihre Blasenreihe.

Ein neues Modul ist eine Zeile in `SEITEN_GRUPPE`, eine Blase im Markup und ein
Eintrag in der Seitenzuordnung von `zeigeSeite()`.

### Zugänglichkeit

- Gruppen-Einträge sind Buttons mit `aria-haspopup`, `aria-expanded` und
  `aria-controls`
- Die Blasenreihe hat `role="menu"`, die Blasen `role="menuitem"`
- Escape schließt die Blasen und gibt den Fokus an den Gruppen-Eintrag zurück
- Blasen haben mindestens 44 Pixel Höhe als Trefferfläche
- Die rechte Gruppe richtet ihre Blasen rechtsbündig aus, damit nichts über den
  Bildschirmrand ragt

---

## Verbesserungen

**Name der Gruppe „Listen".** Die Gruppe heißt wie eines ihrer Module. Die Blase
heißt deshalb „Meine Listen". Sollte das verwirren, ist ein anderer Gruppenname
(„Sammlungen") eine reine Beschriftungsänderung.

**Wischgeste.** Ein Wischen nach oben auf einem Gruppen-Eintrag könnte die
Blasen öffnen. Nicht umgesetzt, weil Wischgesten auf der unteren Bildschirmkante
mit der Systemnavigation des Handys kollidieren.
