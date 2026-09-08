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
};

// Die drei synchronisierten Bereiche, in der Reihenfolge des Erstabgleichs.
const BEREICHE = ['rezepte', 'wochenplan', 'einkaufsliste'];

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

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

class DatenSpeicher {

    // === Laden / Speichern ===

    static ladeAlle() {
        return {
            rezepte: this.ladeRezepte(),
            wochenplan: this.ladeWochenplan(),
            einkaufsliste: this.ladeEinkaufsliste(),
        };
    }

    static lade(bereich, standard) {
        try {
            const data = localStorage.getItem(STORAGE_KEYS[bereich]);
            if (!data) return standard;
            const wert = JSON.parse(data);
            return wert === null || wert === undefined ? standard : wert;
        } catch (e) {
            console.error('Fehler beim Laden von ' + bereich + ':', e);
            return standard;
        }
    }

    // Lokal ablegen und – falls verbunden – an den Sync-Adapter weiterreichen.
    static speichere(bereich, wert) {
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
            localStorage.setItem(STORAGE_KEYS[bereich], JSON.stringify(wert));
            return true;
        } catch (e) {
            console.error('Fehler beim Speichern von ' + bereich + ':', e);
            return false;
        }
    }

    static ladeBereich(bereich) {
        if (bereich === 'rezepte') return this.ladeRezepte();
        if (bereich === 'wochenplan') return this.ladeWochenplan();
        if (bereich === 'einkaufsliste') return this.ladeEinkaufsliste();
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
