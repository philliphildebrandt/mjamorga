// === MjamOrga – Datenspeicherung (localStorage) ===
//
// Diese Datei kennt nur Daten, nie die Oberfläche. Ein späterer Wechsel der
// Persistenz (IndexedDB, Sync) betrifft ausschließlich diese Datei.

const STORAGE_KEYS = {
    rezepte: 'mjamorga_rezepte',
    wochenplan: 'mjamorga_wochenplan',
    einkaufsliste: 'mjamorga_einkaufsliste',
};

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

    static lade(key, standard) {
        try {
            const data = localStorage.getItem(key);
            if (!data) return standard;
            const wert = JSON.parse(data);
            return wert === null || wert === undefined ? standard : wert;
        } catch (e) {
            console.error('Fehler beim Laden von ' + key + ':', e);
            return standard;
        }
    }

    static speichere(key, wert) {
        try {
            localStorage.setItem(key, JSON.stringify(wert));
            return true;
        } catch (e) {
            console.error('Fehler beim Speichern von ' + key + ':', e);
            return false;
        }
    }

    static ladeRezepte() {
        const wert = this.lade(STORAGE_KEYS.rezepte, []);
        return Array.isArray(wert) ? wert : [];
    }

    static speichereRezepte(rezepte) {
        return this.speichere(STORAGE_KEYS.rezepte, rezepte);
    }

    static ladeWochenplan() {
        const wert = this.lade(STORAGE_KEYS.wochenplan, {});
        return wert && typeof wert === 'object' && !Array.isArray(wert) ? wert : {};
    }

    static speichereWochenplan(wochenplan) {
        return this.speichere(STORAGE_KEYS.wochenplan, wochenplan);
    }

    static ladeEinkaufsliste() {
        const wert = this.lade(STORAGE_KEYS.einkaufsliste, []);
        return Array.isArray(wert) ? wert : [];
    }

    static speichereEinkaufsliste(einkaufsliste) {
        return this.speichere(STORAGE_KEYS.einkaufsliste, einkaufsliste);
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
