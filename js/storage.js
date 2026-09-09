// === MjamOrga – Datenspeicherung (localStorage + optionaler Live-Sync) ===
//
// Diese Datei kennt nur Daten, nie die Oberfläche.
//
// localStorage ist immer die erste Ablage: die App startet damit sofort und
// funktioniert auch ohne Netz. Ist ein Sync-Adapter registriert (js/sync.js),
// wird jede Änderung zusätzlich dorthin gespiegelt, und Änderungen anderer
// Nutzer kommen über uebernimmExtern() zurück. Die Oberfläche hängt sich mit
// beiExternerAenderung() / beiSyncStatus() an, ohne den Adapter zu kennen.

const STORAGE_KEYS = {
    rezepte: 'mjamorga_rezepte',
    wochenplan: 'mjamorga_wochenplan',
    einkaufsliste: 'mjamorga_einkaufsliste',
    listen: 'mjamorga_listen',
};

// Die synchronisierten Bereiche, in der Reihenfolge des Erstabgleichs.
const BEREICHE = ['rezepte', 'wochenplan', 'einkaufsliste', 'listen'];

// Haushaltscode: alle Geräte mit demselben Code teilen sich einen Datenstand.
const HAUSHALT_KEY = 'mjamorga_haushalt';
const HAUSHALT_MUSTER = /^[a-z0-9-]{8,64}$/;

// Reihenfolge entspricht grob einem Supermarkt-Rundgang.
// Erweitern: eine Zeile ergänzen – Formular und Gruppierung ziehen automatisch nach.
const KATEGORIEN = [
    'Obst & Gemüse',
    'Fleisch',
    'Milchprodukte',
    'Getränke',
    'Tiefkühl',
    'Vorräte',
    'Haushalt',
    'Sonstiges',
];

const STANDARD_KATEGORIE = 'Sonstiges';

// Farbpalette für Listen. Bewusst ohne Rot: Rot ist im Kalender für
// „wichtig" reserviert und soll nicht mit einer Bereichsfarbe verwechselbar sein.
const LISTEN_FARBEN = ['blau', 'gruen', 'gelb', 'orange', 'lila', 'tuerkis', 'rosa', 'grau'];
const STANDARD_LISTEN_FARBE = 'blau';

// Art der Liste: steuert nur Fälligkeitsfeld und Sortierung, nicht die Daten.
const LISTEN_ARTEN = {
    allgemein: 'Allgemeine Liste',
    todos: 'Todos',
};

// === Schema-Version ===
//
// Jeder Bereich wird mit der Versionsnummer seines Aufbaus gespeichert:
//   localStorage:  { "version": 2, "daten": [...] }
//   Firestore:     { wert: [...], version: 2, geaendert, von }
// Daten ohne Versionsfeld stammen aus der Zeit davor und gelten als Version 1.
//
// Ändert sich der Aufbau, wird SCHEMA_VERSION um eins erhöht und in MIGRATIONEN
// ein Eintrag für die neue Nummer ergänzt. Beim Laden laufen alle Schritte ab der
// gespeicherten Version nacheinander durch (Kette), egal wie alt die Daten sind.
// Ein Schritt, der einen Bereich nicht anfasst, wird einfach weggelassen.
const SCHEMA_VERSION = 2;

const MIGRATIONEN = {
    // 1 -> 2: Alle Felder garantiert vorhanden. Vorher konnten Einträge je nach
    // App-Stand einzelne Felder nicht haben; ab Version 2 darf sich der Code
    // darauf verlassen.
    2: {
        rezepte: (rezepte) => rezepte.filter(r => r && r.id).map((r) => ({
            id: r.id,
            titel: typeof r.titel === 'string' ? r.titel : '',
            link: typeof r.link === 'string' ? r.link : '',
            text: typeof r.text === 'string' ? r.text : '',
            zutaten: Array.isArray(r.zutaten) ? r.zutaten.filter(z => typeof z === 'string') : [],
            bewertung: Number.isInteger(r.bewertung) ? Math.min(5, Math.max(0, r.bewertung)) : 0,
            bildUrl: typeof r.bildUrl === 'string' ? r.bildUrl : '',
            bildQuelle: typeof r.bildQuelle === 'string' ? r.bildQuelle : (r.bildUrl ? 'manuell' : 'keine'),
            erstellt: r.erstellt || r.geaendert || new Date().toISOString(),
            geaendert: r.geaendert || r.erstellt || new Date().toISOString(),
        })),
        wochenplan: (wochenplan) => {
            const ergebnis = {};
            Object.keys(wochenplan).forEach((wochenKey) => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(wochenKey)) return;
                const woche = wochenplan[wochenKey] || {};
                const neu = {};
                for (let i = 0; i < 7; i++) {
                    const tag = woche[i] || {};
                    neu[i] = {
                        text: typeof tag.text === 'string' ? tag.text : '',
                        rezeptId: typeof tag.rezeptId === 'string' && tag.rezeptId ? tag.rezeptId : null,
                    };
                }
                ergebnis[wochenKey] = neu;
            });
            return ergebnis;
        },
        einkaufsliste: (produkte) => produkte.filter(p => p && p.id).map((p) => ({
            id: p.id,
            name: typeof p.name === 'string' ? p.name : '',
            kategorie: KATEGORIEN.includes(p.kategorie) ? p.kategorie : STANDARD_KATEGORIE,
            erledigt: !!p.erledigt,
            erstellt: p.erstellt || new Date().toISOString(),
        })),
        listen: (listen) => listen.filter(l => l && l.id).map((l) => ({
            id: l.id,
            titel: typeof l.titel === 'string' ? l.titel : '',
            farbe: LISTEN_FARBEN.includes(l.farbe) ? l.farbe : STANDARD_LISTEN_FARBE,
            art: l.art in LISTEN_ARTEN ? l.art : 'allgemein',
            von: typeof l.von === 'string' && l.von ? l.von : null,
            bis: typeof l.bis === 'string' && l.bis ? l.bis : null,
            punkte: (Array.isArray(l.punkte) ? l.punkte : []).filter(p => p && p.id).map((p) => ({
                id: p.id,
                name: typeof p.name === 'string' ? p.name : '',
                erledigt: !!p.erledigt,
                faellig: typeof p.faellig === 'string' && p.faellig ? p.faellig : null,
                erstellt: p.erstellt || new Date().toISOString(),
            })),
            erstellt: l.erstellt || l.geaendert || new Date().toISOString(),
            geaendert: l.geaendert || l.erstellt || new Date().toISOString(),
        })),
    },
};

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

class DatenSpeicher {

    // === Laden / Speichern ===

    static ladeAlle() {
        return {
            rezepte: this.ladeRezepte(),
            wochenplan: this.ladeWochenplan(),
            einkaufsliste: this.ladeEinkaufsliste(),
            listen: this.ladeListen(),
        };
    }

    static lade(bereich, standard) {
        try {
            const data = localStorage.getItem(STORAGE_KEYS[bereich]);
            if (!data) return standard;
            const roh = JSON.parse(data);
            if (roh === null || roh === undefined) return standard;

            const { version, daten } = this.entpacke(roh);

            if (version > SCHEMA_VERSION) {
                // Von einer neueren App geschrieben: anzeigen so gut es geht,
                // aber nichts mehr zurückschreiben (siehe markiereVeraltet).
                this.markiereVeraltet(bereich, version);
                return daten === null || daten === undefined ? standard : daten;
            }

            if (version < SCHEMA_VERSION) {
                const migriert = this.migriere(bereich, daten, version);
                this.speichereLokal(bereich, migriert); // einmal heben, dann ist Ruhe
                return migriert;
            }
            return daten === null || daten === undefined ? standard : daten;
        } catch (e) {
            console.error('Fehler beim Laden von ' + bereich + ':', e);
            return standard;
        }
    }

    // Lokal ablegen und – falls verbunden – an den Sync-Adapter weiterreichen.
    static speichere(bereich, wert) {
        if (this.veraltet) {
            console.warn('Speichern blockiert: Daten stammen von einer neueren App-Version.');
            return false;
        }
        const ok = this.speichereLokal(bereich, wert);
        if (ok && this.sync) {
            try {
                this.sync.speichere(bereich, wert);
            } catch (e) {
                console.error('Sync-Fehler beim Speichern von ' + bereich + ':', e);
            }
        }
        return ok;
    }

    static speichereLokal(bereich, wert) {
        try {
            localStorage.setItem(STORAGE_KEYS[bereich], JSON.stringify(this.verpacke(wert)));
            return true;
        } catch (e) {
            console.error('Fehler beim Speichern von ' + bereich + ':', e);
            return false;
        }
    }

    // === Schema-Version: Hülle, Migrationskette, Abwärtsschutz ===

    static verpacke(daten) {
        return { version: SCHEMA_VERSION, daten };
    }

    // Erkennt die Hülle { version, daten }. Alles andere ist Rohform = Version 1.
    // Der Wochenplan ist zwar auch ein Objekt, hat aber nur Datumsschlüssel und
    // nie ein Feld "version" – eine Verwechslung ist ausgeschlossen.
    static entpacke(roh) {
        const istHuelle = roh && typeof roh === 'object' && !Array.isArray(roh)
            && Number.isInteger(roh.version) && Object.prototype.hasOwnProperty.call(roh, 'daten');
        return istHuelle ? { version: roh.version, daten: roh.daten } : { version: 1, daten: roh };
    }

    // Hebt Daten Schritt für Schritt von "von" auf SCHEMA_VERSION.
    static migriere(bereich, daten, von) {
        let wert = daten;
        for (let ziel = von + 1; ziel <= SCHEMA_VERSION; ziel++) {
            const schritt = MIGRATIONEN[ziel] && MIGRATIONEN[ziel][bereich];
            if (!schritt) continue;
            // Ungültige Grundform vor dem Schritt auf eine leere Struktur setzen,
            // damit eine Migration nie auf "undefined.map" läuft.
            if (!this.istGueltig(bereich, wert)) wert = bereich === 'wochenplan' ? {} : [];
            try {
                wert = schritt(wert);
            } catch (e) {
                console.error('Migration ' + (ziel - 1) + '->' + ziel + ' für ' + bereich + ' fehlgeschlagen:', e);
                throw e; // lieber laut scheitern als halb migrierte Daten speichern
            }
        }
        return wert;
    }

    // Daten einer neueren App-Version gefunden: ab jetzt nur noch lesen.
    // Die laufende (alte) App würde sonst den neueren Aufbau zerlegen.
    static markiereVeraltet(quelle, version) {
        if (this.veraltet) return;
        this.veraltet = true;
        this.veraltetInfo = { quelle, version, eigene: SCHEMA_VERSION };
        console.warn('Daten der Version ' + version + ' gefunden, diese App kennt nur ' + SCHEMA_VERSION + '.');
        this.veraltetListener.forEach((cb) => {
            try { cb(this.veraltetInfo); } catch (e) { console.error(e); }
        });
    }

    static beiVeraltet(callback) {
        this.veraltetListener.push(callback);
        if (this.veraltet) callback(this.veraltetInfo);
    }

    // === Export / Import ===

    static exportiereAlles() {
        const bereiche = {};
        BEREICHE.forEach((b) => { bereiche[b] = this.ladeBereich(b); });
        return {
            app: 'MjamOrga',
            version: SCHEMA_VERSION,
            exportiert: new Date().toISOString(),
            haushalt: this.ladeHaushalt(),
            bereiche,
        };
    }

    static exportDateiname() {
        return 'mjamorga-' + this.heuteKey() + '.json';
    }

    // Prüft eine eingelesene Datei und bringt jeden Bereich auf die aktuelle
    // Version. Liefert { bereiche, version } oder wirft einen Fehler mit Text.
    static pruefeImport(paket) {
        if (!paket || typeof paket !== 'object' || paket.app !== 'MjamOrga' || !paket.bereiche || typeof paket.bereiche !== 'object') {
            throw new Error('Das ist keine MjamOrga-Sicherung.');
        }
        const version = Number.isInteger(paket.version) ? paket.version : 1;
        if (version > SCHEMA_VERSION) {
            throw new Error('Die Sicherung stammt von einer neueren App-Version (' + version + '). Bitte zuerst die App neu laden.');
        }
        const bereiche = {};
        BEREICHE.forEach((b) => {
            if (!(b in paket.bereiche)) return;
            let wert = paket.bereiche[b];
            if (version < SCHEMA_VERSION) wert = this.migriere(b, wert, version);
            if (!this.istGueltig(b, wert)) throw new Error('Der Bereich „' + b + '“ in der Datei ist beschädigt.');
            bereiche[b] = wert;
        });
        if (Object.keys(bereiche).length === 0) throw new Error('Die Datei enthält keine bekannten Bereiche.');
        return { bereiche, version };
    }

    static zaehle(bereich, wert) {
        if (!wert) return 0;
        return Array.isArray(wert) ? wert.length : Object.keys(wert).length;
    }

    // modus 'zusammenfuehren': Datei-Einträge ergänzen den Bestand, bei gleicher
    // ID gewinnt die Datei. modus 'ersetzen': Bestand wird durch die Datei ersetzt.
    // Speichert über speichere(), damit der Live-Sync die Änderung mitbekommt.
    static importiere(gepruefte, modus) {
        const ergebnis = {};
        Object.keys(gepruefte.bereiche).forEach((b) => {
            const neu = gepruefte.bereiche[b];
            const wert = modus === 'ersetzen' ? neu : this.fuehreZusammen(b, this.ladeBereich(b), neu);
            if (!this.speichere(b, wert)) throw new Error('Speichern von „' + b + '“ fehlgeschlagen.');
            ergebnis[b] = this.zaehle(b, wert);
        });
        return ergebnis;
    }

    static ladeBereich(bereich) {
        if (bereich === 'rezepte') return this.ladeRezepte();
        if (bereich === 'wochenplan') return this.ladeWochenplan();
        if (bereich === 'einkaufsliste') return this.ladeEinkaufsliste();
        if (bereich === 'listen') return this.ladeListen();
        return null;
    }

    // Prüft einen von außen kommenden Wert auf die erwartete Grundform.
    static istGueltig(bereich, wert) {
        if (bereich === 'wochenplan') return !!wert && typeof wert === 'object' && !Array.isArray(wert);
        return Array.isArray(wert);
    }

    static istLeer(bereich, wert) {
        if (!wert) return true;
        return Array.isArray(wert) ? wert.length === 0 : Object.keys(wert).length === 0;
    }

    static ladeRezepte() {
        const wert = this.lade('rezepte', []);
        return Array.isArray(wert) ? wert : [];
    }

    static speichereRezepte(rezepte) {
        return this.speichere('rezepte', rezepte);
    }

    static ladeWochenplan() {
        const wert = this.lade('wochenplan', {});
        return wert && typeof wert === 'object' && !Array.isArray(wert) ? wert : {};
    }

    static speichereWochenplan(wochenplan) {
        return this.speichere('wochenplan', wochenplan);
    }

    static ladeEinkaufsliste() {
        const wert = this.lade('einkaufsliste', []);
        return Array.isArray(wert) ? wert : [];
    }

    static speichereEinkaufsliste(einkaufsliste) {
        return this.speichere('einkaufsliste', einkaufsliste);
    }

    static ladeListen() {
        const wert = this.lade('listen', []);
        return Array.isArray(wert) ? wert : [];
    }

    static speichereListen(listen) {
        return this.speichere('listen', listen);
    }

    // === Listen-Modul ===

    static erstelleListe(angaben) {
        const jetzt = new Date().toISOString();
        const a = angaben || {};
        return {
            id: this.generiereId(),
            titel: String(a.titel || '').trim(),
            farbe: LISTEN_FARBEN.includes(a.farbe) ? a.farbe : STANDARD_LISTEN_FARBE,
            art: a.art in LISTEN_ARTEN ? a.art : 'allgemein',
            von: a.von || null,
            bis: a.bis || null,
            punkte: Array.isArray(a.punkte) ? a.punkte : [],
            erstellt: jetzt,
            geaendert: jetzt,
        };
    }

    // Feldgleich zum Produkt der Einkaufsliste, nur ohne Kategorie und mit Fälligkeit.
    static erstellePunkt(name, faellig) {
        return {
            id: this.generiereId(),
            name: String(name || '').trim(),
            erledigt: false,
            faellig: faellig || null,
            erstellt: new Date().toISOString(),
        };
    }

    // Kopie einer Liste: neue IDs für Liste und Punkte, Haken zurückgesetzt.
    static dupliziereListe(liste) {
        const kopie = this.erstelleListe({
            titel: liste.titel + ' (Kopie)',
            farbe: liste.farbe,
            art: liste.art,
            von: liste.von,
            bis: liste.bis,
            punkte: (liste.punkte || []).map((p) => this.erstellePunkt(p.name, p.faellig)),
        });
        return kopie;
    }

    // Anzeige-Reihenfolge: offene oben, erledigte unten. Bei Todos zusätzlich
    // offene nach Fälligkeit (ohne Datum zuletzt), sonst Eingabereihenfolge.
    static sortierePunkte(liste) {
        const punkte = (liste.punkte || []).slice();
        const istTodo = liste.art === 'todos';
        return punkte.sort((a, b) => {
            const e = (a.erledigt ? 1 : 0) - (b.erledigt ? 1 : 0);
            if (e !== 0) return e;
            if (istTodo && !a.erledigt) {
                if (a.faellig && b.faellig && a.faellig !== b.faellig) return a.faellig.localeCompare(b.faellig);
                if (a.faellig && !b.faellig) return -1;
                if (!a.faellig && b.faellig) return 1;
            }
            return 0; // stabil: Eingabereihenfolge bleibt
        });
    }

    static heuteKey() {
        const d = new Date();
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    static istUeberfaellig(punkt) {
        return !!punkt.faellig && !punkt.erledigt && punkt.faellig < this.heuteKey();
    }

    // "2026-07-12" -> Date (lokal), für Formatierungen.
    static datumAusKey(key) {
        if (!key) return null;
        const [j, m, t] = key.split('-').map(Number);
        if (!j || !m || !t) return null;
        return new Date(j, m - 1, t);
    }

    static formatZeitraum(von, bis) {
        const dVon = this.datumAusKey(von);
        const dBis = this.datumAusKey(bis);
        if (dVon && dBis) return this.formatKurz(dVon) + ' – ' + this.formatKurz(dBis);
        if (dVon) return 'ab ' + this.formatKurz(dVon);
        if (dBis) return 'bis ' + this.formatKurz(dBis);
        return '';
    }

    // === Live-Sync (Adapter wird von js/sync.js registriert) ===

    static registriereSync(sync) {
        this.sync = sync;
        this.meldeSyncStatus({ zustand: 'getrennt', text: 'Nicht verbunden' });
        const code = this.ladeHaushalt();
        if (code) sync.verbinde(code);
    }

    static hatSync() {
        return !!this.sync;
    }

    static ladeHaushalt() {
        try {
            const code = localStorage.getItem(HAUSHALT_KEY);
            return code && HAUSHALT_MUSTER.test(code) ? code : null;
        } catch (e) {
            return null;
        }
    }

    static speichereHaushalt(code) {
        try {
            if (code) localStorage.setItem(HAUSHALT_KEY, code);
            else localStorage.removeItem(HAUSHALT_KEY);
        } catch (e) {
            console.error('Haushaltscode konnte nicht gespeichert werden:', e);
        }
    }

    // Normalisiert Nutzereingabe: Kleinbuchstaben, Leerzeichen zu Bindestrich.
    static normalisiereHaushalt(eingabe) {
        return String(eingabe || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
    }

    static istGueltigerHaushalt(code) {
        return HAUSHALT_MUSTER.test(code);
    }

    // Zufälliger Code, lesbar in vier Blöcken: mjam-k3f9-x2qa-7pd4
    static generiereHaushalt() {
        const zeichen = 'abcdefghjkmnpqrstuvwxyz23456789';
        const werte = new Uint8Array(12);
        crypto.getRandomValues(werte);
        const teile = [];
        for (let i = 0; i < 12; i += 4) {
            teile.push(Array.from(werte.slice(i, i + 4), (b) => zeichen[b % zeichen.length]).join(''));
        }
        return 'mjam-' + teile.join('-');
    }

    // Von der Oberfläche aufgerufen: mit Haushalt verbinden oder trennen.
    static verbindeHaushalt(code) {
        if (!this.sync) return false;
        this.speichereHaushalt(code);
        this.sync.verbinde(code);
        return true;
    }

    static trenneHaushalt() {
        this.speichereHaushalt(null);
        if (this.sync) this.sync.trenne();
        this.meldeSyncStatus({ zustand: 'getrennt', text: 'Nicht verbunden' });
    }

    // Wird vom Sync-Adapter aufgerufen, wenn ein anderes Gerät geschrieben hat.
    // Lokal ablegen, ohne zurück zum Sync zu spiegeln, dann Oberfläche informieren.
    static uebernimmExtern(bereich, wert) {
        if (this.veraltet) return false;
        if (!this.istGueltig(bereich, wert)) return false;
        const aktuell = JSON.stringify(this.ladeBereich(bereich));
        if (aktuell === JSON.stringify(wert)) return false; // eigenes Echo oder unverändert
        this.speichereLokal(bereich, wert);
        this.aenderungsListener.forEach((cb) => {
            try { cb(bereich, wert); } catch (e) { console.error(e); }
        });
        return true;
    }

    // Erstabgleich beim Verbinden: lokalen und entfernten Stand vereinen,
    // damit beim Beitritt zu einem Haushalt nichts verloren geht.
    // Bei gleicher ID gewinnt der entfernte Eintrag; im Wochenplan gewinnt je Tag
    // der Eintrag, der etwas enthält.
    static fuehreZusammen(bereich, lokal, entfernt) {
        if (this.istLeer(bereich, lokal)) return entfernt;
        if (this.istLeer(bereich, entfernt)) return lokal;

        if (bereich === 'wochenplan') {
            const ergebnis = {};
            const wochen = new Set([...Object.keys(lokal), ...Object.keys(entfernt)]);
            wochen.forEach((wochenKey) => {
                const l = lokal[wochenKey] || {};
                const e = entfernt[wochenKey] || {};
                const woche = {};
                for (let i = 0; i < 7; i++) {
                    const tagE = e[i];
                    const tagL = l[i];
                    const eHatInhalt = tagE && (tagE.rezeptId || (tagE.text || '').trim());
                    woche[i] = eHatInhalt ? tagE : (tagL || tagE || { text: '', rezeptId: null });
                }
                ergebnis[wochenKey] = woche;
            });
            return ergebnis;
        }

        const proId = new Map();
        lokal.forEach((eintrag) => { if (eintrag && eintrag.id) proId.set(eintrag.id, eintrag); });
        entfernt.forEach((eintrag) => { if (eintrag && eintrag.id) proId.set(eintrag.id, eintrag); });
        return Array.from(proId.values());
    }

    static beiExternerAenderung(callback) {
        this.aenderungsListener.push(callback);
    }

    static beiSyncStatus(callback) {
        this.statusListener.push(callback);
        callback(this.syncStatus);
    }

    static meldeSyncStatus(status) {
        this.syncStatus = status;
        this.statusListener.forEach((cb) => {
            try { cb(status); } catch (e) { console.error(e); }
        });
    }

    // === Hilfsfunktionen ===

    static generiereId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
    }

    // Leere Woche: sieben Tage, je ein Eintrag (eine Mahlzeit pro Tag).
    static erstelleLeereWoche() {
        const woche = {};
        for (let i = 0; i < 7; i++) {
            woche[i] = { text: '', rezeptId: null };
        }
        return woche;
    }

    // === Wochenlogik (Montag = erster Tag) ===

    // Rechnet ein beliebiges Datum auf den Montag seiner Woche zurück.
    // Bewusst aus lokalen Datumsanteilen gebaut, nicht über toISOString():
    // sonst landet ein Aufruf am späten Abend in der Vorwoche.
    static getWochenKey(datum) {
        const d = new Date(datum);
        const tag = d.getDay();                  // 0 = Sonntag
        const diff = (tag === 0 ? 6 : tag - 1);  // Abstand zum Montag
        const montag = new Date(d);
        montag.setDate(d.getDate() - diff);      // rollt über Monats-/Jahresgrenzen
        montag.setHours(0, 0, 0, 0);
        const jahr = montag.getFullYear();
        const monat = String(montag.getMonth() + 1).padStart(2, '0');
        const tagDesMonats = String(montag.getDate()).padStart(2, '0');
        return jahr + '-' + monat + '-' + tagDesMonats;
    }

    static getMontagAusKey(wochenKey) {
        const [jahr, monat, tag] = wochenKey.split('-').map(Number);
        return new Date(jahr, monat - 1, tag);
    }

    static getDatumInWoche(wochenKey, tagIndex) {
        const d = this.getMontagAusKey(wochenKey);
        d.setDate(d.getDate() + tagIndex);
        return d;
    }

    static getZeitraumText(wochenKey) {
        const montag = this.getMontagAusKey(wochenKey);
        const sonntag = new Date(montag);
        sonntag.setDate(montag.getDate() + 6);
        return this.formatKurz(montag) + ' – ' + this.formatKurz(sonntag);
    }

    static formatKurz(d) {
        return String(d.getDate()).padStart(2, '0') + '.' +
               String(d.getMonth() + 1).padStart(2, '0') + '.' +
               d.getFullYear();
    }

    static formatTagMonat(d) {
        return String(d.getDate()).padStart(2, '0') + '.' +
               String(d.getMonth() + 1).padStart(2, '0') + '.';
    }

    static getAktuelleWoche() {
        return this.getWochenKey(new Date());
    }

    // === Datum / Wochentag ===

    // Einzige Stelle, an der von Date.getDay() (0 = Sonntag) auf die
    // Montag-basierte Zählung 0..6 umgerechnet wird.
    static getTagIndex(datum) {
        const tag = datum.getDay();
        return tag === 0 ? 6 : tag - 1;
    }

    static getHeutigerIndex() {
        return this.getTagIndex(new Date());
    }

    static getWochentagName(datum) {
        return WOCHENTAGE[this.getTagIndex(datum)];
    }

    // Ohne Wochentag – der steht in der Anzeige bereits als eigene Zeile darüber.
    static formatDatum(datum) {
        return datum.toLocaleDateString('de-DE', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    }

    static getHeutigesDatum() {
        return new Date();
    }
}

// Statischer Zustand der Sync-Anbindung (Klassenfelder wären ES2022, das hier
// läuft auch in älteren Browsern).
DatenSpeicher.sync = null;
DatenSpeicher.aenderungsListener = [];
DatenSpeicher.statusListener = [];
DatenSpeicher.syncStatus = { zustand: 'aus', text: 'Sync nicht eingerichtet' };
DatenSpeicher.veraltet = false;
DatenSpeicher.veraltetInfo = null;
DatenSpeicher.veraltetListener = [];
