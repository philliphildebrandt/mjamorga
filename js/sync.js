// === MjamOrga – Live-Sync über Firebase Firestore ===
//
// ES-Modul, wird nach storage.js und app.js geladen. Lädt das Firebase-SDK vom
// Google-CDN; schlägt das fehl (kein Netz beim ersten Start), läuft die App
// unverändert mit localStorage weiter.
//
// Datenmodell in Firestore:
//   haushalte/{code}/daten/rezepte        { wert: [...],  geaendert, von }
//   haushalte/{code}/daten/wochenplan     { wert: {...},  geaendert, von }
//   haushalte/{code}/daten/einkaufsliste  { wert: [...],  geaendert, von }
//   haushalte/{code}/daten/listen         { wert: [...],  geaendert, von }
//   haushalte/{code}/daten/kategorien     { wert: [...],  geaendert, von }
//
// Jedes Dokument trägt zusätzlich "version" (Schema-Version, siehe storage.js).
// Ein Dokument je Bereich, genau wie die localStorage-Schlüssel. Wer den
// Haushaltscode kennt, liest und schreibt mit – das ist das Zugriffsmodell.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
    initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
    doc, getDoc, setDoc, onSnapshot, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

const SCHREIB_VERZOEGERUNG_MS = 300; // bündelt schnelle Folgeänderungen (mehrfach abhaken)

class FirestoreSync {

    constructor(config) {
        this.app = initializeApp(config);
        this.auth = getAuth(this.app);
        this.db = this.erstelleDatenbank();
        this.uid = null;
        this.haushalt = null;
        this.abos = [];              // Unsubscribe-Funktionen der Live-Listener
        this.ausstehend = new Map(); // bereich -> { wert, timer }
        this.verbindungsLauf = 0;    // entwertet veraltete verbinde()-Aufrufe

        // Vor dem Verlassen der Seite gebündelte Schreibvorgänge abschicken.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.schreibeAlleSofort();
        });
        window.addEventListener('online', () => this.meldeVerbunden());
        window.addEventListener('offline', () => {
            if (this.haushalt) this.melde('offline', 'Offline – Änderungen werden nachgetragen');
        });
    }

    // Offline-Cache in IndexedDB: Schreibvorgänge ohne Netz werden gepuffert
    // und beim nächsten Start nachgeschickt. Mehrere Tabs teilen sich den Cache.
    erstelleDatenbank() {
        try {
            return initializeFirestore(this.app, {
                localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
            });
        } catch (e) {
            console.warn('Firestore ohne Offline-Cache:', e);
            return getFirestore(this.app);
        }
    }

    // === Anmeldung (anonym – jedes Gerät bekommt eine feste ID) ===

    anmelden() {
        if (this.uid) return Promise.resolve(this.uid);
        return new Promise((resolve, reject) => {
            const stop = onAuthStateChanged(this.auth, (user) => {
                if (user) {
                    this.uid = user.uid;
                    stop();
                    resolve(user.uid);
                }
            }, reject);
            signInAnonymously(this.auth).catch((e) => { stop(); reject(e); });
        });
    }

    // === Verbinden / Trennen ===

    async verbinde(code) {
        const lauf = ++this.verbindungsLauf;
        this.trenneListener();
        this.haushalt = code;
        this.melde('verbindet', 'Verbinde …');

        try {
            await this.anmelden();
            if (lauf !== this.verbindungsLauf) return;

            // Erstabgleich: je Bereich lokal und entfernt vereinen.
            for (const bereich of BEREICHE) {
                await this.gleicheAb(bereich);
                if (lauf !== this.verbindungsLauf) return;
            }

            // Danach live mithören.
            BEREICHE.forEach((bereich) => this.hoere(bereich));
            this.meldeVerbunden();
        } catch (e) {
            console.error('Sync-Verbindung fehlgeschlagen:', e);
            this.melde('fehler', this.fehlerText(e));
        }
    }

    trenne() {
        this.verbindungsLauf++;
        this.schreibeAlleSofort();
        this.trenneListener();
        this.haushalt = null;
    }

    trenneListener() {
        this.abos.forEach((stop) => stop());
        this.abos = [];
    }

    async gleicheAb(bereich) {
        const lokal = DatenSpeicher.ladeBereich(bereich);
        const snap = await getDoc(this.ref(bereich));
        const gelesen = this.leseDokument(bereich, snap);
        if (gelesen.veraltet) return; // neuere App hat geschrieben – nichts anfassen
        const entfernt = gelesen.wert;

        if (!DatenSpeicher.istGueltig(bereich, entfernt)) {
            // Noch nichts im Haushalt: lokalen Stand hochladen, falls vorhanden.
            if (!DatenSpeicher.istLeer(bereich, lokal)) await this.schreibe(bereich, lokal);
            return;
        }

        const vereint = DatenSpeicher.fuehreZusammen(bereich, lokal, entfernt);
        DatenSpeicher.uebernimmExtern(bereich, vereint);
        // Schreiben, wenn das Vereinen etwas Lokales beigesteuert hat oder das
        // Dokument noch eine ältere Schema-Version trägt.
        if (gelesen.version < SCHEMA_VERSION || JSON.stringify(vereint) !== JSON.stringify(entfernt)) {
            await this.schreibe(bereich, vereint);
        }
    }

    // Liest wert + Schema-Version aus einem Dokument und hebt ältere Stände an.
    // Trägt das Dokument eine neuere Version als diese App kennt, wird die App
    // als veraltet markiert und das Dokument nicht übernommen.
    leseDokument(bereich, snap) {
        if (!snap.exists()) return { wert: null, version: SCHEMA_VERSION, veraltet: false };
        const data = snap.data() || {};
        const version = Number.isInteger(data.version) ? data.version : 1;
        if (version > SCHEMA_VERSION) {
            DatenSpeicher.markiereVeraltet('firestore', version);
            return { wert: null, version, veraltet: true };
        }
        let wert = data.wert;
        if (version < SCHEMA_VERSION && DatenSpeicher.istGueltig(bereich, wert)) {
            try {
                wert = DatenSpeicher.migriere(bereich, wert, version);
            } catch (e) {
                return { wert: null, version, veraltet: false };
            }
        }
        return { wert, version, veraltet: false };
    }

    hoere(bereich) {
        const stop = onSnapshot(this.ref(bereich), { includeMetadataChanges: true }, (snap) => {
            // Eigene, noch nicht bestätigte Schreibvorgänge kommen sofort als
            // Snapshot zurück – die sind lokal längst bekannt.
            if (snap.metadata.hasPendingWrites) return;
            if (!snap.exists()) return;
            const gelesen = this.leseDokument(bereich, snap);
            if (gelesen.veraltet) {
                this.melde('fehler', 'App veraltet – bitte neu laden');
                return;
            }
            if (DatenSpeicher.istGueltig(bereich, gelesen.wert)) DatenSpeicher.uebernimmExtern(bereich, gelesen.wert);
            if (!snap.metadata.fromCache) this.meldeVerbunden();
        }, (e) => {
            console.error('Sync-Listener für ' + bereich + ':', e);
            this.melde('fehler', this.fehlerText(e));
        });
        this.abos.push(stop);
    }

    // === Schreiben ===

    // Von DatenSpeicher.speichere() aufgerufen: kurz sammeln, dann schreiben.
    speichere(bereich, wert) {
        if (!this.haushalt) return;
        const eintrag = this.ausstehend.get(bereich) || {};
        clearTimeout(eintrag.timer);
        eintrag.wert = wert;
        eintrag.timer = setTimeout(() => this.schreibeAusstehend(bereich), SCHREIB_VERZOEGERUNG_MS);
        this.ausstehend.set(bereich, eintrag);
    }

    schreibeAusstehend(bereich) {
        const eintrag = this.ausstehend.get(bereich);
        if (!eintrag) return;
        clearTimeout(eintrag.timer);
        this.ausstehend.delete(bereich);
        this.schreibe(bereich, eintrag.wert).catch((e) => {
            console.error('Sync-Schreibfehler für ' + bereich + ':', e);
            this.melde('fehler', this.fehlerText(e));
        });
    }

    schreibeAlleSofort() {
        Array.from(this.ausstehend.keys()).forEach((bereich) => this.schreibeAusstehend(bereich));
    }

    schreibe(bereich, wert) {
        if (!this.haushalt) return Promise.resolve();
        if (DatenSpeicher.veraltet) return Promise.resolve(); // nie einen neueren Stand überschreiben
        // JSON-Umweg entfernt undefined-Felder, die Firestore ablehnt.
        const sauber = JSON.parse(JSON.stringify(wert));
        return setDoc(this.ref(bereich), {
            wert: sauber,
            version: SCHEMA_VERSION,
            geaendert: serverTimestamp(),
            von: this.uid || null,
        });
    }

    ref(bereich) {
        return doc(this.db, 'haushalte', this.haushalt, 'daten', bereich);
    }

    // === Status ===

    // Nur echte Übergänge weitergeben – Snapshots kommen häufig, die Oberfläche
    // soll nicht bei jedem davon neu rendern.
    melde(zustand, text) {
        if (this.letzterZustand === zustand && this.letzterText === text) return;
        this.letzterZustand = zustand;
        this.letzterText = text;
        DatenSpeicher.meldeSyncStatus({ zustand, text, haushalt: this.haushalt });
    }

    meldeVerbunden() {
        if (!this.haushalt) return;
        if (navigator.onLine === false) {
            this.melde('offline', 'Offline – Änderungen werden nachgetragen');
        } else {
            this.melde('verbunden', 'Live verbunden');
        }
    }

    fehlerText(e) {
        const code = (e && e.code) || '';
        if (code === 'permission-denied') return 'Zugriff verweigert – Firestore-Regeln prüfen';
        if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
            return 'Anonyme Anmeldung in Firebase nicht aktiviert';
        }
        if (code === 'unavailable' || code === 'auth/network-request-failed') return 'Keine Verbindung zu Firebase';
        return 'Sync-Fehler: ' + (code || (e && e.message) || 'unbekannt');
    }
}

// === Start ===

const config = window.FIREBASE_CONFIG;
if (config && config.apiKey && config.projectId) {
    try {
        DatenSpeicher.registriereSync(new FirestoreSync(config));
    } catch (e) {
        console.error('Sync konnte nicht gestartet werden:', e);
        DatenSpeicher.meldeSyncStatus({ zustand: 'fehler', text: 'Sync konnte nicht gestartet werden' });
    }
}
