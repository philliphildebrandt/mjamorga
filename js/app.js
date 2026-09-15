// === MjamOrga – Anwendungslogik ===
//
// Diese Datei kennt die Oberfläche, storage.js kennt die Daten.
// Rendering läuft immer in eine Richtung: Daten -> Ansicht.

// Zwei Ebenen: vier Gruppen in der Bottom-Navigation, darüber die Module als
// Blasen. Eine Gruppe mit genau einer Seite wechselt direkt, ohne Blasen.
const SEITEN_GRUPPE = {
    dashboard: 'dashboard',
    wochenplan: 'planung',
    kalender: 'planung',
    einkaufsliste: 'einkauf',
    rezepte: 'listen',
    'rezept-detail': 'listen',
    'rezept-form': 'listen',
    listen: 'listen',
    'listen-detail': 'listen',
};

// Unterseiten zählen in der Blasenreihe zu ihrem Hauptmodul.
const HAUPTSEITE = {
    'rezept-detail': 'rezepte',
    'rezept-form': 'rezepte',
    'listen-detail': 'listen',
};

class MjamOrgaApp {

    constructor() {
        this.daten = DatenSpeicher.ladeAlle();
        this.aktuelleSeite = 'dashboard';
        this.aktuellesRezeptId = null;      // aktuell in der Detailansicht gezeigtes Rezept
        this.aufgeklappteWochen = new Set(); // reiner Oberflächenzustand, nicht gespeichert
        this.autoBildUrl = null;             // zuletzt automatisch ermittelte Bild-URL
        this.toastTimeout = null;
        this.syncStatus = { zustand: 'aus', text: '' };
        this.ausstehendesRendern = false;    // externe Änderung wartet, bis eine Eingabe beendet ist

        // Listen-Modul
        this.aktuelleListeId = null;         // in der Detailansicht geöffnete Liste
        this.auswahlAktiv = false;           // Mehrfachauswahl in der Detailansicht
        this.ausgewaehltePunkte = new Set(); // IDs der markierten Punkte (Oberflächenzustand)
        this.vorgemerktePunkte = null;       // Punkte, die eine neue Liste beim Anlegen übernimmt
        this.modalKontext = 'einkauf';       // Produkt-Modal dient Einkaufsliste und Listen

        // PWA-Zustand (wird von js/pwa.js über das Ereignis "pwa-status" gefüllt).
        // Muss vor init() stehen, weil das Dashboard schon beim Sync-Status rendert.
        this.pwa = { installierbar: false, installiert: false, istIOS: false, updateBereit: false };

        this.init();
    }

    init() {
        this.bittePersistentenSpeicher();
        this.fuelleKategorieAuswahl();
        this.fuelleListenFormular();
        this.bindNavigation();
        this.bindEvents();
        this.bindListenEvents();
        this.bindSync();
        this.bindDaten();
        this.bindPwa();
        this.zeigeSeite('dashboard');
        this.spieleStartanimation();
    }

    // =====================================================================
    // Startanimation und PWA-Zustand
    // =====================================================================

    // Läuft einmal beim Laden, ist kurz und lässt sich antippen, um sie zu
    // überspringen. Bei reduzierter Bewegung nur ein kurzes Einblenden.
    spieleStartanimation() {
        const splash = document.getElementById('splash');
        if (!splash) return;
        const reduziert = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const dauer = reduziert ? 500 : 1900;

        const beende = () => {
            if (splash.classList.contains('aus')) return;
            splash.classList.add('aus');
            setTimeout(() => { splash.style.display = 'none'; }, 350);
        };
        splash.classList.toggle('reduziert', reduziert);
        splash.classList.add('spielt');
        splash.addEventListener('click', beende);
        setTimeout(beende, dauer);
    }

    bindPwa() {
        document.addEventListener('pwa-status', (e) => {
            this.pwa = Object.assign({}, this.pwa, e.detail);
            document.getElementById('updateBanner').style.display = this.pwa.updateBereit ? 'flex' : 'none';
            if (this.aktuelleSeite === 'dashboard') this.rendereDashboard();
        });

        document.getElementById('btnUpdateLaden').addEventListener('click', () => {
            if (window.MjamPwa) window.MjamPwa.ladeNeu(); else window.location.reload();
        });

        document.getElementById('dashboardContent').addEventListener('click', async (e) => {
            const el = e.target.closest('[data-aktion="app-installieren"]');
            if (!el || !window.MjamPwa) return;
            const ok = await window.MjamPwa.installiere();
            this.zeigeToast(ok ? 'MjamOrga ist installiert 🎉' : 'Installation abgebrochen.');
        });

        if (window.MjamPwa) this.pwa = Object.assign({}, this.pwa, window.MjamPwa.zustand);
    }

    // Karte auf dem Dashboard: Installieren-Knopf (Android) oder Anleitung (iPhone).
    installZeileHtml() {
        if (this.pwa.installiert) return '';
        if (this.pwa.installierbar) {
            return `
                <div class="install-karte">
                    <div class="install-text">📲 MjamOrga als App auf den Startbildschirm – startet schneller und geht auch ohne Netz.</div>
                    <button type="button" class="btn btn-primary" data-aktion="app-installieren">App installieren</button>
                </div>`;
        }
        if (this.pwa.istIOS) {
            return `
                <div class="install-karte">
                    <div class="install-text">📲 Als App installieren: unten <strong>Teilen</strong> antippen, dann <strong>„Zum Home-Bildschirm“</strong>. So bleiben die Daten auf dem iPhone auch dauerhaft erhalten.</div>
                </div>`;
        }
        return '';
    }

    // =====================================================================
    // Navigation
    // =====================================================================

    bindNavigation() {
        const nav = document.getElementById('bottomNav');

        nav.addEventListener('click', (e) => {
            const blase = e.target.closest('.nav-blase');
            if (blase) {
                if (blase.classList.contains('deaktiviert')) {
                    this.zeigeToast('Der Kalender kommt in einer späteren Version.');
                    return;
                }
                this.schliesseBlasen();
                this.zeigeSeite(blase.dataset.page);
                return;
            }

            const item = e.target.closest('.nav-item');
            if (!item) return;

            // Gruppe mit genau einer Seite: direkt wechseln.
            if (item.dataset.page) {
                this.schliesseBlasen();
                this.zeigeSeite(item.dataset.page);
                return;
            }
            this.toggleBlasen(item);
        });

        // Tipp irgendwo daneben schließt die Blasen.
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.bottom-nav')) this.schliesseBlasen();
        });
    }

    toggleBlasen(item) {
        const warOffen = item.getAttribute('aria-expanded') === 'true';
        this.schliesseBlasen();
        if (warOffen) return;

        const blasen = document.getElementById(item.getAttribute('aria-controls'));
        if (!blasen) return;

        item.setAttribute('aria-expanded', 'true');
        blasen.hidden = false;

        // Das aktuell offene Modul hervorheben.
        const aktuell = HAUPTSEITE[this.aktuelleSeite] || this.aktuelleSeite;
        blasen.querySelectorAll('.nav-blase').forEach((b) => {
            b.classList.toggle('aktuell', b.dataset.page === aktuell);
        });
    }

    schliesseBlasen() {
        document.querySelectorAll('.nav-item[aria-expanded="true"]').forEach((item) => {
            item.setAttribute('aria-expanded', 'false');
        });
        document.querySelectorAll('.nav-blasen').forEach((b) => { b.hidden = true; });
    }

    // Escape: Blasen schließen und Fokus zurück auf den Gruppen-Eintrag.
    schliesseBlasenPerTastatur() {
        const offen = document.querySelector('.nav-item[aria-expanded="true"]');
        if (!offen) return false;
        this.schliesseBlasen();
        offen.focus();
        return true;
    }

    zeigeSeite(seite) {
        const seitenMap = {
            dashboard: 'page-dashboard',
            rezepte: 'page-rezepte',
            'rezept-detail': 'page-rezept-detail',
            'rezept-form': 'page-rezept-form',
            wochenplan: 'page-wochenplan',
            einkaufsliste: 'page-einkaufsliste',
            listen: 'page-listen',
            'listen-detail': 'page-listen-detail',
        };

        // Die Mehrfachauswahl gehört zur Detailansicht und endet mit ihr.
        if (seite !== 'listen-detail' && this.auswahlAktiv) this.beendeAuswahl();

        this.aktuelleSeite = seite;

        document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
        const ziel = document.getElementById(seitenMap[seite] || 'page-dashboard');
        if (ziel) ziel.classList.add('active');

        // Bottom-Navigation: die Gruppe bleibt aktiv, solange eine ihrer Seiten
        // offen ist – auch bei Unterseiten wie einem geöffneten Rezept.
        const gruppe = SEITEN_GRUPPE[seite] || 'dashboard';
        document.querySelectorAll('.nav-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.gruppe === gruppe);
        });

        if (seite === 'dashboard') this.rendereDashboard();
        if (seite === 'rezepte') this.rendereRezeptListe();
        if (seite === 'wochenplan') this.rendereWochenplan();
        if (seite === 'einkaufsliste') this.rendereEinkaufsliste();
        if (seite === 'listen') this.rendereListen();

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // =====================================================================
    // Event-Bindings (einmalig, Delegation überlebt jedes Neu-Rendern)
    // =====================================================================

    bindEvents() {
        // --- Rezepte ---
        document.getElementById('btnNeuesRezept').addEventListener('click', () => {
            this.oeffneRezeptForm(null);
        });

        document.getElementById('btnRezeptZurueck').addEventListener('click', () => {
            this.zeigeSeite('rezepte');
        });

        document.getElementById('btnRezeptBearbeiten').addEventListener('click', () => {
            if (this.aktuellesRezeptId) this.oeffneRezeptForm(this.aktuellesRezeptId);
        });

        document.getElementById('btnFormZurueck').addEventListener('click', () => {
            const id = document.getElementById('formRezeptId').value;
            if (id) this.zeigeRezeptDetail(id); else this.zeigeSeite('rezepte');
        });

        document.getElementById('rezeptForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.speichereRezept();
        });

        document.getElementById('btnFormLoeschen').addEventListener('click', () => {
            this.loescheRezept();
        });

        // Rezeptliste: eine Delegation für alle Karten
        document.getElementById('rezeptListe').addEventListener('click', (e) => {
            const karte = e.target.closest('[data-rezept-id]');
            if (karte) this.zeigeRezeptDetail(karte.dataset.rezeptId);
        });

        // Rezept-Detail: Zutaten auf eine Liste kopieren
        document.getElementById('rezeptDetailContent').addEventListener('click', (e) => {
            if (!e.target.closest('[data-aktion="zutaten-auf-liste"]')) return;
            const rezept = this.findeRezept(this.aktuellesRezeptId);
            if (!rezept || !Array.isArray(rezept.zutaten) || rezept.zutaten.length === 0) return;
            this.oeffneZielModal(rezept.zutaten.map(z => ({ name: z, faellig: null })), 'Zutaten kopieren nach …', null);
        });

        // Dashboard: Karte mit verknüpftem Rezept
        document.getElementById('dashboardContent').addEventListener('click', (e) => {
            const el = e.target.closest('[data-rezept-id]');
            if (el) this.zeigeRezeptDetail(el.dataset.rezeptId);
        });

        // --- Sterne-Eingabe ---
        document.querySelectorAll('.stern').forEach((stern) => {
            stern.addEventListener('click', () => {
                this.setzeSternBewertung(parseInt(stern.dataset.wert, 10));
            });
            stern.addEventListener('mouseenter', () => {
                this.hebeSterneHervor(parseInt(stern.dataset.wert, 10));
            });
        });

        document.getElementById('sterneEingabe').addEventListener('mouseleave', () => {
            this.hebeSterneHervor(this.getBewertung());
        });

        // --- Automatische Bildermittlung ---
        document.getElementById('formLinkFeld').addEventListener('blur', () => {
            this.ermittleBildAusLink();
        });

        // --- Wochenplan ---
        this.bindWochenplanEvents();

        // --- Einkaufsliste ---
        this.bindEinkaufslisteEvents();
    }

    bindWochenplanEvents() {
        const container = document.getElementById('wochenplanContainer');

        container.addEventListener('click', (e) => {
            const el = e.target.closest('[data-aktion]');
            if (!el) return;

            if (el.dataset.aktion === 'woche-toggle') {
                this.toggleWoche(el);
                return;
            }

            const zeile = el.closest('.tages-zeile');
            if (!zeile) return;
            const wochenKey = zeile.dataset.woche;
            const index = parseInt(zeile.dataset.tag, 10);

            if (el.dataset.aktion === 'rezept-oeffnen') {
                this.zeigeRezeptDetail(el.dataset.rezeptId);
            } else if (el.dataset.aktion === 'rezept-loesen') {
                this.setzeTag(wochenKey, index, { rezeptId: null });
                this.rendereWochenplan();
            }
        });

        container.addEventListener('keydown', (e) => {
            const el = e.target.closest('[data-aktion="woche-toggle"]');
            if (el && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                this.toggleWoche(el);
            }
        });

        container.addEventListener('change', (e) => {
            const el = e.target.closest('[data-aktion]');
            if (!el) return;
            const zeile = el.closest('.tages-zeile');
            if (!zeile) return;
            const wochenKey = zeile.dataset.woche;
            const index = parseInt(zeile.dataset.tag, 10);

            if (el.dataset.aktion === 'text') {
                this.setzeTag(wochenKey, index, { text: el.value.trim() });
            } else if (el.dataset.aktion === 'rezept-waehlen' && el.value) {
                this.setzeTag(wochenKey, index, { rezeptId: el.value });
                this.rendereWochenplan();
            }
        });
    }

    bindEinkaufslisteEvents() {
        document.getElementById('btnProduktHinzufuegen').addEventListener('click', () => {
            this.oeffneProduktModal(null);
        });

        document.getElementById('btnModalSchliessen').addEventListener('click', () => {
            this.schliesseProduktModal();
        });

        document.getElementById('produktModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.schliesseProduktModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.schliesseBlasenPerTastatur()) return;
                this.schliesseProduktModal();
                this.schliesseSyncModal();
                this.schliesseListeModal();
                this.schliesseZielModal();
                this.schliesseDatenModal();
            }
        });

        document.getElementById('produktForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.speichereProdukt();
        });

        document.getElementById('btnMassenEinfuegen').addEventListener('click', () => {
            this.fuegeMassenProdukteHinzu();
        });

        const container = document.getElementById('einkaufslisteContainer');

        container.addEventListener('click', (e) => {
            const el = e.target.closest('[data-aktion]');
            if (!el) return;
            const zeile = el.closest('.produkt-zeile');
            if (!zeile) return;

            if (el.dataset.aktion === 'produkt-loeschen') {
                this.loescheProdukt(zeile.dataset.id);
            } else if (el.dataset.aktion === 'produkt-bearbeiten') {
                this.oeffneProduktModal(zeile.dataset.id);
            } else if (el.dataset.aktion === 'produkt-toggle') {
                this.toggleProdukt(zeile.dataset.id, zeile);
            }
        });

        container.addEventListener('keydown', (e) => {
            // Buttons in der Zeile lösen ihren eigenen Klick aus – nicht zusätzlich abhaken.
            if (e.target.tagName === 'BUTTON') return;
            const zeile = e.target.closest('.produkt-zeile');
            if (zeile && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                this.toggleProdukt(zeile.dataset.id, zeile);
            }
        });
    }

    // =====================================================================
    // Live-Sync – Änderungen anderer Geräte und das Verbinden-Modal
    // =====================================================================

    bindSync() {
        DatenSpeicher.beiExternerAenderung((bereich, wert) => this.verarbeiteExterneAenderung(bereich, wert));
        DatenSpeicher.beiSyncStatus((status) => this.zeigeSyncStatus(status));

        // Aufgeschobenes Rendern nachholen, sobald keine Eingabe mehr aktiv ist.
        document.addEventListener('focusout', () => {
            if (!this.ausstehendesRendern) return;
            setTimeout(() => {
                if (this.ausstehendesRendern && !this.eingabeAktiv()) this.rendereAktuelleSeite();
            }, 0);
        });

        document.getElementById('btnSyncOeffnen').addEventListener('click', () => this.oeffneSyncModal());
        document.getElementById('btnSyncSchliessen').addEventListener('click', () => this.schliesseSyncModal());
        document.getElementById('syncModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.schliesseSyncModal();
        });

        document.getElementById('syncForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const code = DatenSpeicher.normalisiereHaushalt(document.getElementById('syncCodeFeld').value);
            if (!DatenSpeicher.istGueltigerHaushalt(code)) {
                this.zeigeToast('Code: mindestens 8 Zeichen, nur a-z, 0-9 und Bindestrich.');
                return;
            }
            this.verbindeHaushalt(code);
        });

        document.getElementById('btnSyncNeu').addEventListener('click', () => {
            this.verbindeHaushalt(DatenSpeicher.generiereHaushalt());
        });

        document.getElementById('btnSyncTrennen').addEventListener('click', () => {
            if (!confirm('Dieses Gerät vom Haushalt trennen?\nDie Daten bleiben hier erhalten, werden aber nicht mehr abgeglichen.')) return;
            DatenSpeicher.trenneHaushalt();
            this.zeigeToast('Gerät getrennt.');
        });

        document.getElementById('btnSyncKopieren').addEventListener('click', async () => {
            const code = DatenSpeicher.ladeHaushalt() || '';
            try {
                await navigator.clipboard.writeText(code);
                this.zeigeToast('Code kopiert.');
            } catch (e) {
                this.zeigeToast('Kopieren nicht möglich – Code bitte abschreiben.');
            }
        });
    }

    verbindeHaushalt(code) {
        if (!DatenSpeicher.verbindeHaushalt(code)) {
            this.zeigeToast('Sync ist nicht eingerichtet.');
            return;
        }
        document.getElementById('syncCodeFeld').value = '';
        this.zeigeToast('Verbinde mit Haushalt …');
    }

    oeffneSyncModal() {
        this.aktualisiereSyncModal();
        document.getElementById('syncModal').style.display = 'flex';
        const feld = document.getElementById('syncCodeFeld');
        if (this.syncStatus.zustand === 'getrennt') feld.focus();
    }

    schliesseSyncModal() {
        document.getElementById('syncModal').style.display = 'none';
    }

    zeigeSyncStatus(status) {
        const vorher = this.syncStatus.zustand;
        this.syncStatus = status;

        const punkt = document.getElementById('syncPunkt');
        punkt.className = 'sync-punkt ' + status.zustand;

        this.aktualisiereSyncModal();
        if (this.aktuelleSeite === 'dashboard') this.rendereDashboard();

        if (status.zustand === 'verbunden' && vorher !== 'verbunden') this.zeigeToast('☁️ ' + status.text);
        if (status.zustand === 'fehler' && vorher !== 'fehler') this.zeigeToast('⚠️ ' + status.text);
    }

    aktualisiereSyncModal() {
        const status = this.syncStatus;
        const haushalt = DatenSpeicher.ladeHaushalt();
        const verbunden = !!haushalt && status.zustand !== 'aus';

        document.getElementById('syncStatus').textContent = status.text || '';
        document.getElementById('syncStatus').className = 'sync-status ' + status.zustand;
        document.getElementById('syncAus').style.display = status.zustand === 'aus' ? 'block' : 'none';
        document.getElementById('syncVerbunden').style.display = verbunden ? 'block' : 'none';
        document.getElementById('syncGetrennt').style.display = (!verbunden && status.zustand !== 'aus') ? 'block' : 'none';
        document.getElementById('syncCodeAnzeige').textContent = haushalt || '';
    }

    syncZeileHtml() {
        const status = this.syncStatus;
        if (status.zustand === 'aus') return '';
        const symbol = { verbunden: '☁️', verbindet: '⏳', offline: '📴', fehler: '⚠️', getrennt: '☁️' }[status.zustand] || '☁️';
        const text = status.zustand === 'getrennt' ? 'Nicht mit anderen Geräten verbunden' : status.text;
        return `<div class="sync-zeile ${status.zustand}">${symbol} ${this.escapeHtml(text)}</div>`;
    }

    // Ein anderes Gerät hat gespeichert: Datenstand übernehmen, Ansicht auffrischen.
    verarbeiteExterneAenderung(bereich, wert) {
        this.daten[bereich] = wert;

        // Während jemand tippt, würde ein Neu-Rendern die Eingabe wegwerfen.
        if (this.eingabeAktiv()) {
            this.ausstehendesRendern = true;
            return;
        }
        this.rendereAktuelleSeite();
    }

    eingabeAktiv() {
        const el = document.activeElement;
        if (!el) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }

    rendereAktuelleSeite() {
        this.ausstehendesRendern = false;
        const seite = this.aktuelleSeite;

        if (seite === 'dashboard') this.rendereDashboard();
        else if (seite === 'rezepte') this.rendereRezeptListe();
        else if (seite === 'wochenplan') this.rendereWochenplan();
        else if (seite === 'einkaufsliste') this.rendereEinkaufsliste();
        else if (seite === 'listen') this.rendereListen();
        else if (seite === 'listen-detail') {
            const liste = this.aktuelleListe();
            if (liste) {
                // Markierungen auf Punkte beschränken, die es noch gibt.
                const vorhanden = new Set((liste.punkte || []).map(p => p.id));
                this.ausgewaehltePunkte.forEach((id) => { if (!vorhanden.has(id)) this.ausgewaehltePunkte.delete(id); });
                this.rendereListeDetail();
            } else {
                this.zeigeToast('Die Liste wurde auf einem anderen Gerät gelöscht.');
                this.zeigeSeite('listen');
            }
        }
        else if (seite === 'rezept-detail') {
            if (this.findeRezept(this.aktuellesRezeptId)) this.zeigeRezeptDetail(this.aktuellesRezeptId);
            else {
                this.zeigeToast('Das Rezept wurde auf einem anderen Gerät gelöscht.');
                this.zeigeSeite('rezepte');
            }
        }
        // rezept-form: bewusst nicht anfassen – beim Speichern gewinnt die letzte Änderung.
    }

    // =====================================================================
    // Dashboard – reine Leseansicht auf Wochenplan und Rezepte
    // =====================================================================

    rendereDashboard() {
        const container = document.getElementById('dashboardContent');
        const heute = DatenSpeicher.getHeutigesDatum();
        const wochenKey = DatenSpeicher.getAktuelleWoche();
        const index = DatenSpeicher.getHeutigerIndex();

        const woche = this.daten.wochenplan[wochenKey] || {};
        const tag = woche[index] || { text: '', rezeptId: null };
        const rezept = tag.rezeptId ? this.findeRezept(tag.rezeptId) : null;
        const text = (tag.text || '').trim();

        let inhalt;
        if (rezept) {
            inhalt = `
                <div class="mahlzeit-inhalt mahlzeit-rezept-link" data-rezept-id="${rezept.id}">
                    <span>${this.escapeHtml(rezept.titel)}</span>
                    <span class="mahlzeit-sterne">${this.sterneHtml(rezept.bewertung)}</span>
                </div>`;
        } else if (text) {
            inhalt = `<div class="mahlzeit-inhalt">${this.escapeHtml(text)}</div>`;
        } else {
            inhalt = `<div class="mahlzeit-inhalt leer">Noch nichts geplant</div>`;
        }

        container.innerHTML = `
            <div class="dashboard-datum">
                <div class="wochentag">${DatenSpeicher.getWochentagName(heute)}</div>
                <div class="datum">${DatenSpeicher.formatDatum(heute)}</div>
            </div>
            <div class="dashboard-mahlzeiten">
                <div class="mahlzeit-karte">
                    <div class="mahlzeit-titel">🍽️ Heute</div>
                    ${inhalt}
                </div>
            </div>
            ${this.installZeileHtml()}
            ${this.syncZeileHtml()}`;
    }

    // =====================================================================
    // Rezepte
    // =====================================================================

    rendereRezeptListe() {
        const container = document.getElementById('rezeptListe');
        const rezepte = this.daten.rezepte;

        if (rezepte.length === 0) {
            container.innerHTML = `
                <div class="leer-hinweis">
                    <div class="leer-icon">📖</div>
                    <p>Noch keine Rezepte gespeichert.</p>
                    <p class="klein">Tippe auf „＋ Neues Rezept“, um zu starten.</p>
                </div>`;
            return;
        }

        container.innerHTML = rezepte.map((rezept) => `
            <div class="rezept-karte" data-rezept-id="${rezept.id}">
                ${this.bildHtml(rezept, 'rezept-karte-bild')}
                <div class="rezept-karte-body">
                    <div class="rezept-karte-titel">${this.escapeHtml(rezept.titel)}</div>
                    <div class="rezept-karte-sterne">${this.sterneHtml(rezept.bewertung)}</div>
                </div>
            </div>`).join('');
    }

    // Bild mit Platzhalter-Rückfall. Das onerror-Attribut ist von uns erzeugtes
    // Markup und wird beim Parsen gesetzt – ein nachträglich per JS gebundener
    // Listener würde bei bereits fehlgeschlagenen Bildern nicht mehr auslösen.
    bildHtml(rezept, klasse) {
        const platzhalter = `<div class="${klasse} placeholder"`;
        if (!rezept.bildUrl) {
            return `${platzhalter}>🍽️</div>`;
        }
        return `<img src="${this.escapeHtml(rezept.bildUrl)}" class="${klasse}" alt="${this.escapeHtml(rezept.titel)}" loading="lazy" `
             + `onerror="this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='flex';" />`
             + `${platzhalter} style="display:none;">🍽️</div>`;
    }

    zeigeRezeptDetail(rezeptId) {
        const rezept = this.findeRezept(rezeptId);
        if (!rezept) {
            this.zeigeToast('Rezept nicht gefunden.');
            this.zeigeSeite('rezepte');
            return;
        }

        this.aktuellesRezeptId = rezeptId;
        this.zeigeSeite('rezept-detail');

        document.getElementById('detailTitel').textContent = rezept.titel;

        const linkHtml = (rezept.link && this.istErlaubterLink(rezept.link))
            ? `<a href="${this.escapeHtml(rezept.link)}" target="_blank" rel="noopener" class="rezept-detail-link">🔗 Zum Originalrezept</a>`
            : '';

        const zutaten = Array.isArray(rezept.zutaten) ? rezept.zutaten : [];
        const zutatenHtml = zutaten.length > 0
            ? `<div class="rezept-detail-block">
                   <h3 class="block-titel">Zutaten</h3>
                   <ul class="zutaten-liste">${zutaten.map(z => `<li>${this.escapeHtml(z)}</li>`).join('')}</ul>
                   <button type="button" class="btn btn-secondary btn-block" data-aktion="zutaten-auf-liste">📋 Zutaten auf eine Liste</button>
               </div>`
            : '';

        const textHtml = rezept.text
            ? `<div class="rezept-detail-block">
                   <h3 class="block-titel">Zubereitung / Notizen</h3>
                   <div class="rezept-detail-text">${this.escapeHtml(rezept.text)}</div>
               </div>`
            : '<p class="leer-text">Kein Text gespeichert.</p>';

        document.getElementById('rezeptDetailContent').innerHTML = `
            ${this.bildHtml(rezept, 'rezept-detail-bild')}
            <div class="rezept-detail-titel">${this.escapeHtml(rezept.titel)}</div>
            <div class="rezept-detail-sterne">${this.sterneHtml(rezept.bewertung)}</div>
            ${linkHtml}
            ${zutatenHtml}
            ${textHtml}`;
    }

    oeffneRezeptForm(rezeptId) {
        const rezept = rezeptId ? this.findeRezept(rezeptId) : null;

        document.getElementById('rezeptForm').reset();
        document.getElementById('linkHinweis').textContent = '';
        this.autoBildUrl = null;

        if (rezept) {
            document.getElementById('formTitel').textContent = 'Rezept bearbeiten';
            document.getElementById('formRezeptId').value = rezept.id;
            document.getElementById('formTitelFeld').value = rezept.titel || '';
            document.getElementById('formLinkFeld').value = rezept.link || '';
            document.getElementById('formZutatenFeld').value = (rezept.zutaten || []).join('\n');
            document.getElementById('formTextFeld').value = rezept.text || '';
            document.getElementById('formBildFeld').value = rezept.bildUrl || '';
            document.getElementById('formBewertung').value = String(rezept.bewertung || 0);
            document.getElementById('btnFormLoeschen').style.display = 'block';
        } else {
            document.getElementById('formTitel').textContent = 'Neues Rezept';
            document.getElementById('formRezeptId').value = '';
            document.getElementById('formBewertung').value = '0';
            document.getElementById('btnFormLoeschen').style.display = 'none';
        }

        this.hebeSterneHervor(this.getBewertung());
        this.zeigeSeite('rezept-form');
    }

    speichereRezept() {
        const id = document.getElementById('formRezeptId').value;
        const titel = document.getElementById('formTitelFeld').value.trim();
        const link = document.getElementById('formLinkFeld').value.trim();
        const text = document.getElementById('formTextFeld').value.trim();
        const bildUrl = document.getElementById('formBildFeld').value.trim();
        const bewertung = this.getBewertung();
        const zutaten = this.zerlegeZeilen(document.getElementById('formZutatenFeld').value);

        if (!titel) {
            this.zeigeToast('Bitte einen Titel eingeben.');
            return;
        }
        if (link && !this.istErlaubterLink(link)) {
            this.zeigeToast('Bitte einen vollständigen http(s)-Link angeben.');
            return;
        }
        if (bildUrl && !this.istErlaubterLink(bildUrl)) {
            this.zeigeToast('Die Bild-URL muss mit http:// oder https:// beginnen.');
            return;
        }

        const bildQuelle = !bildUrl ? 'keine'
            : (bildUrl === this.autoBildUrl ? 'url-heuristik' : 'manuell');

        const jetzt = new Date().toISOString();
        const index = id ? this.daten.rezepte.findIndex(r => r.id === id) : -1;

        if (index !== -1) {
            this.daten.rezepte[index] = Object.assign({}, this.daten.rezepte[index], {
                titel, link, text, zutaten, bewertung, bildUrl, bildQuelle, geaendert: jetzt,
            });
        } else {
            this.daten.rezepte.push({
                id: DatenSpeicher.generiereId(),
                titel, link, text, zutaten, bewertung, bildUrl, bildQuelle,
                erstellt: jetzt,
                geaendert: jetzt,
            });
        }

        if (this.sichere('rezepte')) this.zeigeToast('Rezept gespeichert ✅');
        this.zeigeSeite('rezepte');
    }

    loescheRezept() {
        const id = document.getElementById('formRezeptId').value;
        if (!id) return;

        const rezept = this.findeRezept(id);
        const verwendungen = this.zaehleVerwendungen(id);
        const frage = verwendungen > 0
            ? `„${rezept.titel}“ wirklich löschen?\nDas Rezept ist an ${verwendungen} Tag(en) im Wochenplan eingeplant.`
            : `„${rezept.titel}“ wirklich löschen?`;

        if (!confirm(frage)) return;

        this.daten.rezepte = this.daten.rezepte.filter(r => r.id !== id);
        this.sichere('rezepte');

        // Referenzielle Integrität: alle Verweise im Wochenplan lösen,
        // vorhandenen Freitext dabei stehen lassen.
        let geaendert = false;
        Object.keys(this.daten.wochenplan).forEach((wochenKey) => {
            const woche = this.daten.wochenplan[wochenKey];
            Object.keys(woche).forEach((tagIndex) => {
                if (woche[tagIndex] && woche[tagIndex].rezeptId === id) {
                    woche[tagIndex].rezeptId = null;
                    geaendert = true;
                }
            });
        });
        if (geaendert) this.sichere('wochenplan');

        this.aktuellesRezeptId = null;
        this.zeigeToast('Rezept gelöscht.');
        this.zeigeSeite('rezepte');
    }

    zaehleVerwendungen(rezeptId) {
        let anzahl = 0;
        Object.keys(this.daten.wochenplan).forEach((wochenKey) => {
            const woche = this.daten.wochenplan[wochenKey];
            Object.keys(woche).forEach((tagIndex) => {
                if (woche[tagIndex] && woche[tagIndex].rezeptId === rezeptId) anzahl++;
            });
        });
        return anzahl;
    }

    findeRezept(id) {
        return this.daten.rezepte.find(r => r.id === id) || null;
    }

    // --- Sterne ---

    getBewertung() {
        return parseInt(document.getElementById('formBewertung').value, 10) || 0;
    }

    sterneHtml(bewertung) {
        const voll = parseInt(bewertung, 10) || 0;
        let html = '';
        for (let i = 1; i <= 5; i++) {
            html += (i <= voll) ? '⭐' : '<span class="leer">⭐</span>';
        }
        return html;
    }

    setzeSternBewertung(wert) {
        // Erneuter Klick auf den aktuell höchsten Stern setzt zurück auf 0.
        const neu = (wert === this.getBewertung()) ? 0 : wert;
        document.getElementById('formBewertung').value = String(neu);
        this.hebeSterneHervor(neu);
    }

    hebeSterneHervor(wert) {
        document.querySelectorAll('.stern').forEach((stern) => {
            stern.classList.toggle('aktiv', parseInt(stern.dataset.wert, 10) <= wert);
        });
    }

    // --- Automatisches Rezeptbild ---
    //
    // Stufe 1: manuelle Bild-URL (hat immer Vorrang)
    // Stufe 2: Link zeigt selbst auf eine Bilddatei
    // Stufe 3: Auswertung von og:image / twitter:image -> braucht ein Backend,
    //          deshalb hier bewusst nicht umgesetzt
    // Stufe 4: Platzhalter

    ermittleBildAusLink() {
        const link = document.getElementById('formLinkFeld').value.trim();
        const hinweis = document.getElementById('linkHinweis');
        const bildFeld = document.getElementById('formBildFeld');

        if (!link) {
            hinweis.textContent = '';
            return;
        }
        if (!this.istErlaubterLink(link)) {
            hinweis.textContent = 'Bitte einen vollständigen http(s)-Link angeben.';
            return;
        }
        if (bildFeld.value.trim()) {
            hinweis.textContent = '';
            return;
        }

        const bildUrl = this.versucheBildAusUrl(link);
        if (bildUrl) {
            bildFeld.value = bildUrl;
            this.autoBildUrl = bildUrl;
            hinweis.textContent = 'Bild aus der Link-Adresse übernommen.';
        } else {
            hinweis.textContent = 'Kein Vorschaubild ermittelbar – bei Bedarf Bild-URL manuell eintragen.';
        }
    }

    versucheBildAusUrl(url) {
        const endungen = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'];
        try {
            const pfad = new URL(url).pathname.toLowerCase();
            return endungen.some(e => pfad.endsWith(e)) ? url : null;
        } catch (e) {
            return null;
        }
    }

    istErlaubterLink(wert) {
        try {
            const u = new URL(wert);
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch (e) {
            return false;
        }
    }

    // =====================================================================
    // Wochenplan
    // =====================================================================

    rendereWochenplan() {
        const container = document.getElementById('wochenplanContainer');
        const aktuelleWoche = DatenSpeicher.getAktuelleWoche();

        // Automatische Woche: entsteht beim ersten Aufruf in der neuen Woche.
        if (!this.daten.wochenplan[aktuelleWoche]) {
            this.daten.wochenplan[aktuelleWoche] = DatenSpeicher.erstelleLeereWoche();
            this.sichere('wochenplan');
        }
        this.aufgeklappteWochen.add(aktuelleWoche);

        // Schlüssel erst hier einsammeln – sonst fehlt die eben angelegte Woche.
        const wochen = Object.keys(this.daten.wochenplan).sort((a, b) => b.localeCompare(a));
        const heutigerIndex = DatenSpeicher.getHeutigerIndex();

        const rezeptOptionen = this.daten.rezepte
            .map(r => `<option value="${r.id}">${this.escapeHtml(r.titel)}</option>`)
            .join('');

        container.innerHTML = wochen.map((wochenKey) => {
            const offen = this.aufgeklappteWochen.has(wochenKey);
            const istAktuell = wochenKey === aktuelleWoche;
            const woche = this.daten.wochenplan[wochenKey] || {};

            let zeilen = '';
            for (let i = 0; i < 7; i++) {
                const tag = woche[i] || { text: '', rezeptId: null };
                const rezept = tag.rezeptId ? this.findeRezept(tag.rezeptId) : null;
                const istHeute = istAktuell && i === heutigerIndex;
                const datum = DatenSpeicher.getDatumInWoche(wochenKey, i);

                const feld = rezept
                    ? `<span class="rezept-link" data-aktion="rezept-oeffnen" data-rezept-id="${rezept.id}">
                           📖 ${this.escapeHtml(rezept.titel)}
                           <span class="mini-sterne">${this.sterneHtml(rezept.bewertung)}</span>
                       </span>
                       <button type="button" class="btn-icon" data-aktion="rezept-loesen" title="Verknüpfung lösen" aria-label="Verknüpfung lösen">✕</button>`
                    : `<input type="text" class="tag-text" data-aktion="text" value="${this.escapeHtml(tag.text || '')}" placeholder="Was gibt's?" aria-label="Essen am ${WOCHENTAGE[i]}" />
                       <select class="rezept-auswahl" data-aktion="rezept-waehlen" aria-label="Rezept auswählen">
                           <option value="">📖</option>
                           ${rezeptOptionen}
                       </select>`;

                zeilen += `
                    <div class="tages-zeile${istHeute ? ' heute' : ''}" data-woche="${wochenKey}" data-tag="${i}">
                        <div class="tag-name">${WOCHENTAGE[i]}<span class="tag-datum">${DatenSpeicher.formatTagMonat(datum)}</span></div>
                        <div class="tag-essen">${feld}</div>
                    </div>`;
            }

            return `
                <div class="wochen-kachel${offen ? ' geoeffnet' : ''}" data-woche="${wochenKey}">
                    <div class="wochen-kachel-header" data-aktion="woche-toggle" role="button" tabindex="0" aria-expanded="${offen}">
                        <span>${DatenSpeicher.getZeitraumText(wochenKey)}${istAktuell ? ' <span class="badge">Diese Woche</span>' : ''}</span>
                        <span class="pfeil">▼</span>
                    </div>
                    <div class="wochen-kachel-body">${zeilen}</div>
                </div>`;
        }).join('');
    }

    toggleWoche(headerEl) {
        const kachel = headerEl.closest('.wochen-kachel');
        if (!kachel) return;
        const wochenKey = kachel.dataset.woche;

        if (this.aufgeklappteWochen.has(wochenKey)) {
            this.aufgeklappteWochen.delete(wochenKey);
        } else {
            this.aufgeklappteWochen.add(wochenKey);
        }
        const offen = kachel.classList.toggle('geoeffnet');
        headerEl.setAttribute('aria-expanded', String(offen));
    }

    // Einzige Stelle, an der in die Wochenstruktur geschrieben wird.
    setzeTag(wochenKey, tagIndex, aenderung) {
        if (!this.daten.wochenplan[wochenKey]) {
            this.daten.wochenplan[wochenKey] = DatenSpeicher.erstelleLeereWoche();
        }
        const woche = this.daten.wochenplan[wochenKey];
        const alt = woche[tagIndex] || { text: '', rezeptId: null };
        woche[tagIndex] = Object.assign({ text: '', rezeptId: null }, alt, aenderung);
        this.sichere('wochenplan');
    }

    // =====================================================================
    // Einkaufsliste
    // =====================================================================

    fuelleKategorieAuswahl() {
        document.getElementById('produktKategorie').innerHTML = KATEGORIEN
            .map(k => `<option value="${this.escapeHtml(k)}">${this.escapeHtml(k)}</option>`)
            .join('');
    }

    rendereEinkaufsliste() {
        const container = document.getElementById('einkaufslisteContainer');
        const produkte = this.daten.einkaufsliste;

        if (produkte.length === 0) {
            container.innerHTML = `
                <div class="leer-hinweis">
                    <div class="leer-icon">🛒</div>
                    <p>Die Einkaufsliste ist leer.</p>
                    <p class="klein">Tippe auf „＋ Produkt“, um etwas hinzuzufügen.</p>
                </div>`;
            return;
        }

        // Gruppierung entsteht erst beim Rendern – gespeichert wird ein flaches Array.
        const gruppen = new Map(KATEGORIEN.map(k => [k, []]));
        produkte.forEach((p) => {
            const kategorie = gruppen.has(p.kategorie) ? p.kategorie : STANDARD_KATEGORIE;
            gruppen.get(kategorie).push(p);
        });

        const gruppenHtml = Array.from(gruppen.entries())
            .filter(([, arr]) => arr.length > 0)
            .map(([kategorie, arr]) => {
                // Offene Produkte oben, erledigte unten – erledigte bleiben in der Liste.
                const sortiert = arr.slice().sort((a, b) => (a.erledigt ? 1 : 0) - (b.erledigt ? 1 : 0));
                return `
                    <div class="kategorie-gruppe">
                        <h3 class="kategorie-titel">${this.escapeHtml(kategorie)}<span class="kategorie-anzahl">${arr.length}</span></h3>
                        ${sortiert.map(p => this.produktZeileHtml(p)).join('')}
                    </div>`;
            }).join('');

        container.innerHTML = `<div class="listen-info" id="listenInfo">${this.listenInfoText()}</div>${gruppenHtml}`;
    }

    produktZeileHtml(produkt) {
        return `
            <div class="produkt-zeile${produkt.erledigt ? ' erledigt' : ''}" data-id="${produkt.id}" data-aktion="produkt-toggle" role="button" tabindex="0" aria-pressed="${!!produkt.erledigt}">
                <span class="checkbox" aria-hidden="true">✓</span>
                <span class="produkt-name">${this.escapeHtml(produkt.name)}</span>
                <button type="button" class="produkt-aktion" data-aktion="produkt-bearbeiten" title="Bearbeiten" aria-label="Produkt bearbeiten">✏️</button>
                <button type="button" class="produkt-aktion" data-aktion="produkt-loeschen" title="Löschen" aria-label="Produkt löschen">🗑️</button>
            </div>`;
    }

    listenInfoText() {
        const gesamt = this.daten.einkaufsliste.length;
        const offen = this.daten.einkaufsliste.filter(p => !p.erledigt).length;
        return `${offen} offen · ${gesamt} gesamt`;
    }

    // Bewusst kein vollständiges Neu-Rendern: Scrollposition bleibt erhalten.
    toggleProdukt(id, zeile) {
        const produkt = this.daten.einkaufsliste.find(p => p.id === id);
        if (!produkt) return;

        produkt.erledigt = !produkt.erledigt;
        this.sichere('einkaufsliste');

        zeile.classList.toggle('erledigt', produkt.erledigt);
        zeile.setAttribute('aria-pressed', String(produkt.erledigt));

        const info = document.getElementById('listenInfo');
        if (info) info.textContent = this.listenInfoText();
    }

    loescheProdukt(id) {
        this.daten.einkaufsliste = this.daten.einkaufsliste.filter(p => p.id !== id);
        this.sichere('einkaufsliste');
        this.rendereEinkaufsliste();
    }

    // Ein Formular für beide Fälle: leeres Feld "produktId" = neues Produkt,
    // gefülltes = Bearbeiten. Beim Bearbeiten wird die Massen-Eingabe ausgeblendet.
    oeffneProduktModal(produktId) {
        const produkt = produktId ? this.findeProdukt(produktId) : null;
        const nameFeld = document.getElementById('produktName');
        const kategorieFeld = document.getElementById('produktKategorie');

        this.modalKontext = 'einkauf';
        document.getElementById('produktKategorieGruppe').style.display = 'block';
        document.getElementById('punktFaelligGruppe').style.display = 'none';
        document.getElementById('massenHinweis').textContent =
            'Nutzt die oben gewählte Kategorie. Aufzählungszeichen und Nummerierungen werden entfernt.';

        document.getElementById('produktId').value = produkt ? produkt.id : '';
        document.getElementById('produktModalTitel').textContent = produkt ? 'Produkt bearbeiten' : 'Produkt hinzufügen';
        document.getElementById('btnProduktSpeichern').textContent = produkt ? '💾 Speichern' : 'Hinzufügen';
        document.getElementById('massenBereich').style.display = produkt ? 'none' : 'block';

        nameFeld.value = produkt ? produkt.name : '';
        if (produkt) {
            kategorieFeld.value = KATEGORIEN.includes(produkt.kategorie) ? produkt.kategorie : STANDARD_KATEGORIE;
        }

        document.getElementById('produktModal').style.display = 'flex';
        nameFeld.focus();
        if (produkt) nameFeld.select();
    }

    schliesseProduktModal() {
        document.getElementById('produktModal').style.display = 'none';
        document.getElementById('produktId').value = '';
    }

    findeProdukt(id) {
        return this.daten.einkaufsliste.find(p => p.id === id) || null;
    }

    erstelleProdukt(name, kategorie) {
        return {
            id: DatenSpeicher.generiereId(),
            name: name,
            kategorie: KATEGORIEN.includes(kategorie) ? kategorie : STANDARD_KATEGORIE,
            erledigt: false,
            erstellt: new Date().toISOString(),
        };
    }

    speichereProdukt() {
        if (this.modalKontext === 'liste') return this.speicherePunkt();

        const nameFeld = document.getElementById('produktName');
        const name = nameFeld.value.trim();
        const kategorie = document.getElementById('produktKategorie').value;
        const id = document.getElementById('produktId').value;

        if (!name) {
            this.zeigeToast('Bitte einen Produktnamen eingeben.');
            return;
        }

        if (id) {
            const produkt = this.findeProdukt(id);
            if (!produkt) {
                this.zeigeToast('Produkt nicht gefunden.');
                this.schliesseProduktModal();
                return;
            }
            produkt.name = name;
            produkt.kategorie = KATEGORIEN.includes(kategorie) ? kategorie : STANDARD_KATEGORIE;
            this.sichere('einkaufsliste');
            this.schliesseProduktModal();
            this.rendereEinkaufsliste();
            this.zeigeToast('Produkt aktualisiert');
            return;
        }

        this.daten.einkaufsliste.push(this.erstelleProdukt(name, kategorie));
        this.sichere('einkaufsliste');
        this.rendereEinkaufsliste();

        // Modal bleibt offen – mehrere Produkte nacheinander sind der Normalfall.
        nameFeld.value = '';
        nameFeld.focus();
        this.zeigeToast(`„${name}“ hinzugefügt`);
    }

    fuegeMassenProdukteHinzu() {
        if (this.modalKontext === 'liste') return this.fuegeMassenPunkteHinzu();

        const feld = document.getElementById('produktMassenEingabe');
        const kategorie = document.getElementById('produktKategorie').value;
        const namen = this.zerlegeZeilen(feld.value);

        if (namen.length === 0) {
            this.zeigeToast('Keine verwertbaren Zeilen gefunden.');
            return;
        }

        // Ein Durchgang, ein Schreibvorgang – auch bei langen Listen schnell.
        namen.forEach((name) => {
            this.daten.einkaufsliste.push(this.erstelleProdukt(name, kategorie));
        });
        this.sichere('einkaufsliste');

        feld.value = '';
        this.schliesseProduktModal();
        this.rendereEinkaufsliste();
        this.zeigeToast(`${namen.length} Produkte hinzugefügt`);
    }

    // Zerlegt eingefügten Text in einzelne Zeilen.
    // Entfernt führende Aufzählungszeichen und Nummerierungen, lässt
    // Mengenangaben aber bewusst im Namen stehen ("500 g Nudeln").
    zerlegeZeilen(text) {
        return String(text || '')
            .split(/\r?\n/)
            .map(zeile => zeile.replace(/^\s*(?:[-*•‣▪]\s+|\d+[.)]\s+)/, '').trim())
            .filter(zeile => zeile.length > 0);
    }

    // =====================================================================
    // Listen – frei anlegbare Listen mit Kacheln, Detailansicht, Mehrfachauswahl
    // =====================================================================

    fuelleListenFormular() {
        document.getElementById('listeFarbe').innerHTML = LISTEN_FARBEN.map((f, i) => `
            <label class="farb-option farbe-${f}">
                <input type="radio" name="listeFarbe" value="${f}"${i === 0 ? ' checked' : ''} />
                <span class="farb-punkt" aria-hidden="true"></span>
                <span class="farb-name">${this.escapeHtml(f)}</span>
            </label>`).join('');

        document.getElementById('listeArt').innerHTML = Object.keys(LISTEN_ARTEN)
            .map(k => `<option value="${k}">${this.escapeHtml(LISTEN_ARTEN[k])}</option>`)
            .join('');
    }

    bindListenEvents() {
        // --- Übersicht ---
        document.getElementById('btnNeueListe').addEventListener('click', () => {
            this.oeffneListeModal(null, null);
        });

        document.getElementById('listenKacheln').addEventListener('click', (e) => {
            const aktion = e.target.closest('[data-aktion]');
            const kachel = e.target.closest('[data-liste-id]');
            if (!kachel) return;
            const id = kachel.dataset.listeId;

            if (aktion && aktion.dataset.aktion === 'liste-duplizieren') {
                this.dupliziereListe(id);
            } else if (aktion && aktion.dataset.aktion === 'liste-loeschen') {
                this.loescheListe(id);
            } else {
                this.zeigeListeDetail(id);
            }
        });

        document.getElementById('listenKacheln').addEventListener('keydown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            const kachel = e.target.closest('[data-liste-id]');
            if (kachel && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                this.zeigeListeDetail(kachel.dataset.listeId);
            }
        });

        // --- Detailansicht ---
        document.getElementById('btnListeZurueck').addEventListener('click', () => {
            this.zeigeSeite('listen');
        });

        document.getElementById('btnListeBearbeiten').addEventListener('click', () => {
            if (this.aktuelleListeId) this.oeffneListeModal(this.aktuelleListeId, null);
        });

        document.getElementById('btnListeAuswahl').addEventListener('click', () => {
            if (this.auswahlAktiv) this.beendeAuswahl(); else this.starteAuswahl();
        });

        document.getElementById('btnPunktHinzufuegen').addEventListener('click', () => {
            this.oeffnePunktModal(null);
        });

        const container = document.getElementById('listeDetailContainer');

        container.addEventListener('click', (e) => {
            const el = e.target.closest('[data-aktion]');
            if (!el) return;
            const zeile = el.closest('.produkt-zeile');
            if (!zeile) return;

            if (this.auswahlAktiv) {
                // Im Auswahlmodus wählt jeder Tipp auf die Zeile aus, statt abzuhaken.
                this.toggleAuswahl(zeile.dataset.id, zeile);
                return;
            }

            if (el.dataset.aktion === 'produkt-loeschen') {
                this.loeschePunkt(zeile.dataset.id);
            } else if (el.dataset.aktion === 'produkt-bearbeiten') {
                this.oeffnePunktModal(zeile.dataset.id);
            } else if (el.dataset.aktion === 'produkt-toggle') {
                this.togglePunkt(zeile.dataset.id, zeile);
            }
        });

        container.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            const zeile = e.target.closest('.produkt-zeile');
            if (zeile && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                if (this.auswahlAktiv) this.toggleAuswahl(zeile.dataset.id, zeile);
                else this.togglePunkt(zeile.dataset.id, zeile);
            }
        });

        document.getElementById('listeDetailFuss').addEventListener('click', (e) => {
            if (e.target.closest('[data-aktion="erledigte-aufraeumen"]')) this.raeumeErledigteAuf();
        });

        // --- Auswahlleiste ---
        document.getElementById('btnAuswahlAbbrechen').addEventListener('click', () => this.beendeAuswahl());

        document.getElementById('btnAuswahlKopieren').addEventListener('click', () => {
            const punkte = this.ausgewaehltePunkteAlsVorlage();
            if (punkte.length === 0) return;
            this.oeffneZielModal(punkte, 'Kopieren nach …', this.aktuelleListeId);
        });

        document.getElementById('btnAuswahlNeueListe').addEventListener('click', () => {
            const punkte = this.ausgewaehltePunkteAlsVorlage();
            if (punkte.length === 0) return;
            this.oeffneListeModal(null, punkte);
        });

        // --- Modal: Liste anlegen / bearbeiten ---
        document.getElementById('btnListeModalSchliessen').addEventListener('click', () => this.schliesseListeModal());
        document.getElementById('listeModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.schliesseListeModal();
        });
        document.getElementById('listeForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.speichereListe();
        });

        // --- Modal: Ziel wählen ---
        document.getElementById('btnZielModalSchliessen').addEventListener('click', () => this.schliesseZielModal());
        document.getElementById('zielModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.schliesseZielModal();
        });
        document.getElementById('zielListe').addEventListener('click', (e) => {
            const ziel = e.target.closest('[data-ziel]');
            if (!ziel) return;
            this.waehleZiel(ziel.dataset.ziel);
        });
    }

    // --- Übersicht ---

    rendereListen() {
        const container = document.getElementById('listenKacheln');
        const listen = this.daten.listen;

        if (listen.length === 0) {
            container.innerHTML = `
                <div class="leer-hinweis">
                    <div class="leer-icon">📋</div>
                    <p>Noch keine Listen angelegt.</p>
                    <p class="klein">Tippe auf „＋ Neue Liste“ – Packliste, Putzplan, Geschenkideen …</p>
                </div>`;
            return;
        }

        container.innerHTML = listen.map(l => this.listeKachelHtml(l)).join('');
    }

    listeKachelHtml(liste) {
        const punkte = DatenSpeicher.sortierePunkte(liste);
        const gesamt = punkte.length;
        const erledigt = punkte.filter(p => p.erledigt).length;
        const teaser = punkte.slice(0, 4);
        const rest = gesamt - teaser.length;

        const meta = [];
        const zeitraum = DatenSpeicher.formatZeitraum(liste.von, liste.bis);
        if (zeitraum) meta.push(this.escapeHtml(zeitraum));
        meta.push(gesamt === 0 ? 'leer' : `${erledigt} von ${gesamt} erledigt`);

        const teaserHtml = teaser.length > 0
            ? `<ul class="kachel-teaser">
                   ${teaser.map(p => `<li class="${p.erledigt ? 'erledigt' : ''}">${this.escapeHtml(p.name)}</li>`).join('')}
                   ${rest > 0 ? `<li class="mehr">+${rest} weitere</li>` : ''}
               </ul>`
            : '';

        return `
            <div class="liste-kachel farbe-${this.escapeHtml(liste.farbe)}" data-liste-id="${liste.id}" role="button" tabindex="0" aria-label="Liste ${this.escapeHtml(liste.titel)} öffnen">
                <div class="kachel-streifen" aria-hidden="true"></div>
                <div class="kachel-body">
                    <div class="kachel-kopf">
                        <div class="kachel-titel">${this.escapeHtml(liste.titel)}</div>
                        ${liste.art === 'todos' ? '<span class="kachel-art">Todos</span>' : ''}
                    </div>
                    <div class="kachel-meta">${meta.join(' · ')}</div>
                    ${teaserHtml}
                </div>
                <div class="kachel-aktionen">
                    <button type="button" class="produkt-aktion" data-aktion="liste-duplizieren" title="Liste duplizieren" aria-label="Liste duplizieren">📑</button>
                    <button type="button" class="produkt-aktion" data-aktion="liste-loeschen" title="Liste löschen" aria-label="Liste löschen">🗑️</button>
                </div>
            </div>`;
    }

    findeListe(id) {
        return this.daten.listen.find(l => l.id === id) || null;
    }

    aktuelleListe() {
        return this.aktuelleListeId ? this.findeListe(this.aktuelleListeId) : null;
    }

    // Jede Änderung an einer Liste läuft hier durch: Zeitstempel setzen, speichern.
    sichereListe(liste) {
        liste.geaendert = new Date().toISOString();
        return this.sichere('listen');
    }

    dupliziereListe(id) {
        const liste = this.findeListe(id);
        if (!liste) return;
        const kopie = DatenSpeicher.dupliziereListe(liste);
        const index = this.daten.listen.indexOf(liste);
        this.daten.listen.splice(index + 1, 0, kopie);
        this.sichere('listen');
        this.rendereListen();
        this.zeigeToast(`„${kopie.titel}“ angelegt`);
    }

    loescheListe(id) {
        const liste = this.findeListe(id);
        if (!liste) return;
        const anzahl = (liste.punkte || []).length;
        const frage = anzahl > 0
            ? `„${liste.titel}“ mit ${anzahl} Punkt(en) wirklich löschen?`
            : `„${liste.titel}“ wirklich löschen?`;
        if (!confirm(frage)) return;

        this.daten.listen = this.daten.listen.filter(l => l.id !== id);
        this.sichere('listen');
        if (this.aktuelleListeId === id) {
            this.aktuelleListeId = null;
            this.zeigeSeite('listen');
        } else {
            this.rendereListen();
        }
        this.zeigeToast('Liste gelöscht.');
    }

    // --- Detailansicht ---

    zeigeListeDetail(id) {
        const liste = this.findeListe(id);
        if (!liste) {
            this.zeigeToast('Liste nicht gefunden.');
            this.zeigeSeite('listen');
            return;
        }
        if (this.aktuelleListeId !== id) this.beendeAuswahl();
        this.aktuelleListeId = id;
        this.zeigeSeite('listen-detail');
        this.rendereListeDetail();
    }

    rendereListeDetail() {
        const liste = this.aktuelleListe();
        if (!liste) return;

        const header = document.getElementById('listeDetailHeader');
        header.className = 'page-header detail-header farbe-' + liste.farbe;
        document.getElementById('listeDetailTitel').innerHTML =
            `<span class="farb-punkt" aria-hidden="true"></span>${this.escapeHtml(liste.titel)}`;

        const punkte = DatenSpeicher.sortierePunkte(liste);
        const gesamt = punkte.length;
        const erledigt = punkte.filter(p => p.erledigt).length;

        const kopfTeile = [];
        const zeitraum = DatenSpeicher.formatZeitraum(liste.von, liste.bis);
        if (zeitraum) kopfTeile.push(`📆 ${this.escapeHtml(zeitraum)}`);
        kopfTeile.push(liste.art === 'todos' ? '☑️ Todos' : '📋 Allgemeine Liste');
        kopfTeile.push(`<span id="listeInfo">${gesamt - erledigt} offen · ${gesamt} gesamt</span>`);
        document.getElementById('listeDetailKopf').innerHTML = kopfTeile.join('<span class="trenner">·</span>');

        const container = document.getElementById('listeDetailContainer');
        if (gesamt === 0) {
            container.innerHTML = `
                <div class="leer-hinweis">
                    <div class="leer-icon">📝</div>
                    <p>Diese Liste ist noch leer.</p>
                    <p class="klein">Tippe auf „＋ Punkt“, um etwas einzutragen.</p>
                </div>`;
        } else {
            container.innerHTML = punkte.map(p => this.punktZeileHtml(liste, p)).join('');
        }
        container.classList.toggle('auswahl-modus', this.auswahlAktiv);

        document.getElementById('listeDetailFuss').innerHTML = erledigt > 0
            ? `<button type="button" class="btn btn-secondary btn-block" data-aktion="erledigte-aufraeumen">🧹 ${erledigt} erledigte aufräumen</button>`
            : '';

        this.aktualisiereAuswahlLeiste();
    }

    punktZeileHtml(liste, punkt) {
        const istTodo = liste.art === 'todos';
        const ueberfaellig = istTodo && DatenSpeicher.istUeberfaellig(punkt);
        const faelligHtml = istTodo && punkt.faellig
            ? `<span class="punkt-faellig${ueberfaellig ? ' ueberfaellig' : ''}">${this.escapeHtml(DatenSpeicher.formatTagMonat(DatenSpeicher.datumAusKey(punkt.faellig)))}</span>`
            : '';
        const ausgewaehlt = this.ausgewaehltePunkte.has(punkt.id);

        return `
            <div class="produkt-zeile${punkt.erledigt ? ' erledigt' : ''}${ausgewaehlt ? ' ausgewaehlt' : ''}" data-id="${punkt.id}" data-aktion="produkt-toggle" role="button" tabindex="0" aria-pressed="${!!punkt.erledigt}">
                <span class="checkbox" aria-hidden="true">✓</span>
                <span class="produkt-name">${this.escapeHtml(punkt.name)}${faelligHtml}</span>
                <button type="button" class="produkt-aktion" data-aktion="produkt-bearbeiten" title="Bearbeiten" aria-label="Punkt bearbeiten">✏️</button>
                <button type="button" class="produkt-aktion" data-aktion="produkt-loeschen" title="Löschen" aria-label="Punkt löschen">🗑️</button>
            </div>`;
    }

    findePunkt(liste, id) {
        return (liste.punkte || []).find(p => p.id === id) || null;
    }

    // Punktuelles Update wie in der Einkaufsliste: Scrollposition bleibt.
    togglePunkt(id, zeile) {
        const liste = this.aktuelleListe();
        const punkt = liste ? this.findePunkt(liste, id) : null;
        if (!punkt) return;

        punkt.erledigt = !punkt.erledigt;
        this.sichereListe(liste);

        zeile.classList.toggle('erledigt', punkt.erledigt);
        zeile.setAttribute('aria-pressed', String(punkt.erledigt));

        const gesamt = liste.punkte.length;
        const offen = liste.punkte.filter(p => !p.erledigt).length;
        const info = document.getElementById('listeInfo');
        if (info) info.textContent = `${offen} offen · ${gesamt} gesamt`;

        // Der Aufräum-Button hängt von der Anzahl erledigter Punkte ab.
        const erledigt = gesamt - offen;
        document.getElementById('listeDetailFuss').innerHTML = erledigt > 0
            ? `<button type="button" class="btn btn-secondary btn-block" data-aktion="erledigte-aufraeumen">🧹 ${erledigt} erledigte aufräumen</button>`
            : '';
    }

    loeschePunkt(id) {
        const liste = this.aktuelleListe();
        if (!liste) return;
        liste.punkte = (liste.punkte || []).filter(p => p.id !== id);
        this.ausgewaehltePunkte.delete(id);
        this.sichereListe(liste);
        this.rendereListeDetail();
    }

    raeumeErledigteAuf() {
        const liste = this.aktuelleListe();
        if (!liste) return;
        const anzahl = liste.punkte.filter(p => p.erledigt).length;
        if (anzahl === 0) return;
        if (!confirm(`${anzahl} erledigte Punkte aus „${liste.titel}“ entfernen?`)) return;

        liste.punkte = liste.punkte.filter(p => !p.erledigt);
        this.sichereListe(liste);
        this.rendereListeDetail();
        this.zeigeToast(`${anzahl} Punkte entfernt`);
    }

    // --- Punkt anlegen / bearbeiten (nutzt das Produkt-Modal im Listen-Kontext) ---

    oeffnePunktModal(punktId) {
        const liste = this.aktuelleListe();
        if (!liste) return;
        const punkt = punktId ? this.findePunkt(liste, punktId) : null;
        const nameFeld = document.getElementById('produktName');

        this.modalKontext = 'liste';
        document.getElementById('produktKategorieGruppe').style.display = 'none';
        document.getElementById('punktFaelligGruppe').style.display = liste.art === 'todos' ? 'block' : 'none';
        document.getElementById('punktFaellig').value = punkt && punkt.faellig ? punkt.faellig : '';
        document.getElementById('massenHinweis').textContent =
            'Aufzählungszeichen und Nummerierungen werden entfernt.';

        document.getElementById('produktId').value = punkt ? punkt.id : '';
        document.getElementById('produktModalTitel').textContent = punkt ? 'Punkt bearbeiten' : 'Punkt hinzufügen';
        document.getElementById('btnProduktSpeichern').textContent = punkt ? '💾 Speichern' : 'Hinzufügen';
        document.getElementById('massenBereich').style.display = punkt ? 'none' : 'block';

        nameFeld.value = punkt ? punkt.name : '';
        document.getElementById('produktModal').style.display = 'flex';
        nameFeld.focus();
        if (punkt) nameFeld.select();
    }

    speicherePunkt() {
        const liste = this.aktuelleListe();
        if (!liste) { this.schliesseProduktModal(); return; }

        const nameFeld = document.getElementById('produktName');
        const name = nameFeld.value.trim();
        const faellig = liste.art === 'todos' ? (document.getElementById('punktFaellig').value || null) : null;
        const id = document.getElementById('produktId').value;

        if (!name) {
            this.zeigeToast('Bitte einen Namen eingeben.');
            return;
        }

        if (id) {
            const punkt = this.findePunkt(liste, id);
            if (!punkt) {
                this.zeigeToast('Punkt nicht gefunden.');
                this.schliesseProduktModal();
                return;
            }
            punkt.name = name;
            punkt.faellig = faellig;
            this.sichereListe(liste);
            this.schliesseProduktModal();
            this.rendereListeDetail();
            this.zeigeToast('Punkt aktualisiert');
            return;
        }

        liste.punkte.push(DatenSpeicher.erstellePunkt(name, faellig));
        this.sichereListe(liste);
        this.rendereListeDetail();

        // Modal bleibt offen – mehrere Punkte nacheinander sind der Normalfall.
        nameFeld.value = '';
        nameFeld.focus();
        this.zeigeToast(`„${name}“ hinzugefügt`);
    }

    fuegeMassenPunkteHinzu() {
        const liste = this.aktuelleListe();
        if (!liste) { this.schliesseProduktModal(); return; }

        const feld = document.getElementById('produktMassenEingabe');
        const faellig = liste.art === 'todos' ? (document.getElementById('punktFaellig').value || null) : null;
        const namen = this.zerlegeZeilen(feld.value);

        if (namen.length === 0) {
            this.zeigeToast('Keine verwertbaren Zeilen gefunden.');
            return;
        }

        namen.forEach((name) => liste.punkte.push(DatenSpeicher.erstellePunkt(name, faellig)));
        this.sichereListe(liste);

        feld.value = '';
        this.schliesseProduktModal();
        this.rendereListeDetail();
        this.zeigeToast(`${namen.length} Punkte hinzugefügt`);
    }

    // --- Mehrfachauswahl ---

    starteAuswahl() {
        if (!this.aktuelleListe()) return;
        this.auswahlAktiv = true;
        this.ausgewaehltePunkte.clear();
        document.getElementById('btnListeAuswahl').setAttribute('aria-pressed', 'true');
        this.rendereListeDetail();
    }

    beendeAuswahl() {
        this.auswahlAktiv = false;
        this.ausgewaehltePunkte.clear();
        document.getElementById('btnListeAuswahl').setAttribute('aria-pressed', 'false');
        document.getElementById('listeDetailContainer').classList.remove('auswahl-modus');
        document.querySelectorAll('#listeDetailContainer .ausgewaehlt').forEach(z => z.classList.remove('ausgewaehlt'));
        this.aktualisiereAuswahlLeiste();
    }

    toggleAuswahl(id, zeile) {
        if (this.ausgewaehltePunkte.has(id)) this.ausgewaehltePunkte.delete(id);
        else this.ausgewaehltePunkte.add(id);
        zeile.classList.toggle('ausgewaehlt', this.ausgewaehltePunkte.has(id));
        this.aktualisiereAuswahlLeiste();
    }

    aktualisiereAuswahlLeiste() {
        const leiste = document.getElementById('auswahlLeiste');
        const sichtbar = this.auswahlAktiv && this.aktuelleSeite === 'listen-detail';
        leiste.style.display = sichtbar ? 'flex' : 'none';
        document.body.classList.toggle('auswahl-offen', sichtbar);
        if (!sichtbar) return;
        const n = this.ausgewaehltePunkte.size;
        document.getElementById('auswahlAnzahl').textContent = `${n} ausgewählt`;
        document.getElementById('btnAuswahlKopieren').disabled = n === 0;
        document.getElementById('btnAuswahlNeueListe').disabled = n === 0;
    }

    // Die markierten Punkte als Vorlage: nur Name und Fälligkeit, keine IDs.
    // Beim Kopieren entstehen immer neue Punkte, das Original bleibt unberührt.
    ausgewaehltePunkteAlsVorlage() {
        const liste = this.aktuelleListe();
        if (!liste) return [];
        return DatenSpeicher.sortierePunkte(liste)
            .filter(p => this.ausgewaehltePunkte.has(p.id))
            .map(p => ({ name: p.name, faellig: p.faellig || null }));
    }

    // --- Liste anlegen / bearbeiten ---

    oeffneListeModal(listeId, vorgemerktePunkte) {
        const liste = listeId ? this.findeListe(listeId) : null;
        this.vorgemerktePunkte = Array.isArray(vorgemerktePunkte) && vorgemerktePunkte.length > 0 ? vorgemerktePunkte : null;

        document.getElementById('listeForm').reset();
        document.getElementById('listeId').value = liste ? liste.id : '';
        document.getElementById('listeModalTitel').textContent = liste ? 'Liste bearbeiten' : 'Neue Liste';
        document.getElementById('btnListeSpeichern').textContent = liste ? '💾 Speichern' : 'Anlegen';

        const farbe = liste ? liste.farbe : STANDARD_LISTEN_FARBE;
        const radio = document.querySelector(`#listeFarbe input[value="${farbe}"]`) || document.querySelector('#listeFarbe input');
        if (radio) radio.checked = true;

        document.getElementById('listeTitel').value = liste ? liste.titel : '';
        document.getElementById('listeArt').value = liste ? liste.art : 'allgemein';
        document.getElementById('listeVon').value = liste && liste.von ? liste.von : '';
        document.getElementById('listeBis').value = liste && liste.bis ? liste.bis : '';

        const hinweis = document.getElementById('listeVorgemerktHinweis');
        if (this.vorgemerktePunkte) {
            hinweis.textContent = `${this.vorgemerktePunkte.length} Punkte werden in die neue Liste übernommen.`;
            hinweis.style.display = 'block';
        } else {
            hinweis.style.display = 'none';
        }

        document.getElementById('listeModal').style.display = 'flex';
        document.getElementById('listeTitel').focus();
    }

    schliesseListeModal() {
        document.getElementById('listeModal').style.display = 'none';
        this.vorgemerktePunkte = null;
    }

    speichereListe() {
        const id = document.getElementById('listeId').value;
        const titel = document.getElementById('listeTitel').value.trim();
        const farbeFeld = document.querySelector('#listeFarbe input:checked');
        const farbe = farbeFeld ? farbeFeld.value : STANDARD_LISTEN_FARBE;
        const art = document.getElementById('listeArt').value;
        const von = document.getElementById('listeVon').value || null;
        const bis = document.getElementById('listeBis').value || null;

        if (!titel) {
            this.zeigeToast('Bitte einen Titel eingeben.');
            return;
        }
        if (von && bis && bis < von) {
            this.zeigeToast('Das Ende des Zeitraums liegt vor dem Anfang.');
            return;
        }

        if (id) {
            const liste = this.findeListe(id);
            if (!liste) {
                this.zeigeToast('Liste nicht gefunden.');
                this.schliesseListeModal();
                return;
            }
            Object.assign(liste, { titel, farbe, art, von, bis });
            this.sichereListe(liste);
            this.schliesseListeModal();
            if (this.aktuelleSeite === 'listen-detail') this.rendereListeDetail(); else this.rendereListen();
            this.zeigeToast('Liste aktualisiert');
            return;
        }

        const punkte = (this.vorgemerktePunkte || []).map(v => DatenSpeicher.erstellePunkt(v.name, art === 'todos' ? v.faellig : null));
        const liste = DatenSpeicher.erstelleListe({ titel, farbe, art, von, bis, punkte });
        this.daten.listen.unshift(liste);
        this.sichere('listen');
        this.schliesseListeModal();
        this.beendeAuswahl();
        this.zeigeToast(punkte.length > 0 ? `„${titel}“ mit ${punkte.length} Punkten angelegt` : `„${titel}“ angelegt`);
        this.zeigeListeDetail(liste.id);
    }

    // --- Ziel wählen: Punkte in eine andere Liste oder die Einkaufsliste kopieren ---

    oeffneZielModal(punkte, titel, quelleListeId) {
        this.zielPunkte = punkte;
        document.getElementById('zielModalTitel').textContent = titel || 'Kopieren nach …';

        const listen = this.daten.listen.filter(l => l.id !== quelleListeId);
        const eintraege = listen.map(l => `
            <button type="button" class="ziel-eintrag farbe-${this.escapeHtml(l.farbe)}" data-ziel="${l.id}">
                <span class="farb-punkt" aria-hidden="true"></span>
                <span class="ziel-titel">${this.escapeHtml(l.titel)}</span>
                <span class="ziel-anzahl">${(l.punkte || []).length}</span>
            </button>`);

        eintraege.push(`
            <button type="button" class="ziel-eintrag ziel-einkauf" data-ziel="einkaufsliste">
                <span class="ziel-icon" aria-hidden="true">🛒</span>
                <span class="ziel-titel">Einkaufsliste</span>
                <span class="ziel-anzahl">${this.daten.einkaufsliste.length}</span>
            </button>`);

        eintraege.push(`
            <button type="button" class="ziel-eintrag ziel-neu" data-ziel="neu">
                <span class="ziel-icon" aria-hidden="true">✨</span>
                <span class="ziel-titel">Neue Liste daraus</span>
            </button>`);

        document.getElementById('zielListe').innerHTML = eintraege.join('');
        document.getElementById('zielModal').style.display = 'flex';
    }

    schliesseZielModal() {
        document.getElementById('zielModal').style.display = 'none';
    }

    waehleZiel(ziel) {
        const punkte = this.zielPunkte || [];
        this.schliesseZielModal();
        if (punkte.length === 0) return;

        if (ziel === 'neu') {
            this.oeffneListeModal(null, punkte);
            return;
        }

        if (ziel === 'einkaufsliste') {
            punkte.forEach(p => this.daten.einkaufsliste.push(this.erstelleProdukt(p.name, STANDARD_KATEGORIE)));
            this.sichere('einkaufsliste');
            if (this.aktuelleSeite === 'einkaufsliste') this.rendereEinkaufsliste();
            this.zeigeToast(`${punkte.length} Punkte auf die Einkaufsliste kopiert`);
            this.beendeAuswahl();
            return;
        }

        const liste = this.findeListe(ziel);
        if (!liste) {
            this.zeigeToast('Zielliste nicht gefunden.');
            return;
        }
        punkte.forEach(p => liste.punkte.push(DatenSpeicher.erstellePunkt(p.name, liste.art === 'todos' ? p.faellig : null)));
        this.sichereListe(liste);
        this.zeigeToast(`${punkte.length} Punkte nach „${liste.titel}“ kopiert`);
        this.beendeAuswahl();
    }

    // =====================================================================
    // Datensicherung – Export, Import, Schutz vor veralteter App
    // =====================================================================

    bindDaten() {
        document.getElementById('btnDatenOeffnen').addEventListener('click', () => this.oeffneDatenModal());
        document.getElementById('btnDatenSchliessen').addEventListener('click', () => this.schliesseDatenModal());
        document.getElementById('datenModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.schliesseDatenModal();
        });

        document.getElementById('btnDatenExport').addEventListener('click', () => this.exportiereDaten());

        document.getElementById('datenImportDatei').addEventListener('change', (e) => {
            const datei = e.target.files && e.target.files[0];
            if (datei) this.liesImportDatei(datei);
            e.target.value = ''; // dieselbe Datei darf erneut gewählt werden
        });

        document.getElementById('btnImportZusammenfuehren').addEventListener('click', () => this.importiereDaten('zusammenfuehren'));
        document.getElementById('btnImportErsetzen').addEventListener('click', () => this.importiereDaten('ersetzen'));
        document.getElementById('btnImportAbbrechen').addEventListener('click', () => this.zeigeImportVorschau(null));

        // Abwärtsschutz: Banner, sobald Daten einer neueren App auftauchen.
        document.getElementById('btnNeuLaden').addEventListener('click', () => window.location.reload());
        DatenSpeicher.beiVeraltet((info) => {
            document.getElementById('veraltetText').textContent =
                `Die Daten stammen von einer neueren Version der App (Version ${info.version}, diese kennt ${info.eigene}). ` +
                'Änderungen werden nicht gespeichert, bis die App neu geladen ist.';
            document.getElementById('veraltetBanner').style.display = 'flex';
        });
    }

    oeffneDatenModal() {
        this.zeigeImportVorschau(null);
        const zaehler = BEREICHE.map((b) => {
            const label = { rezepte: 'Rezepte', wochenplan: 'Wochen', einkaufsliste: 'Produkte', listen: 'Listen' }[b] || b;
            return `<div class="daten-kachel"><div class="daten-zahl">${DatenSpeicher.zaehle(b, this.daten[b])}</div><div class="daten-label">${label}</div></div>`;
        }).join('');
        document.getElementById('datenUebersicht').innerHTML =
            zaehler + `<div class="daten-version">Datenformat Version ${SCHEMA_VERSION}</div>`;
        document.getElementById('datenModal').style.display = 'flex';
    }

    schliesseDatenModal() {
        document.getElementById('datenModal').style.display = 'none';
        this.zeigeImportVorschau(null);
    }

    exportiereDaten() {
        const paket = DatenSpeicher.exportiereAlles();
        const blob = new Blob([JSON.stringify(paket, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = DatenSpeicher.exportDateiname();
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.zeigeToast('Sicherung erstellt: ' + a.download);
    }

    liesImportDatei(datei) {
        const leser = new FileReader();
        leser.onerror = () => this.zeigeToast('Die Datei konnte nicht gelesen werden.');
        leser.onload = () => {
            try {
                const paket = JSON.parse(String(leser.result));
                this.importVorbereitet = DatenSpeicher.pruefeImport(paket);
                this.zeigeImportVorschau(this.importVorbereitet, paket.exportiert);
            } catch (e) {
                this.importVorbereitet = null;
                this.zeigeToast(e && e.message ? e.message : 'Die Datei ist keine gültige Sicherung.');
            }
        };
        leser.readAsText(datei);
    }

    zeigeImportVorschau(gepruefte, exportiert) {
        const vorschau = document.getElementById('datenVorschau');
        const aktionen = document.getElementById('datenAktionen');
        if (!gepruefte) {
            this.importVorbereitet = null;
            vorschau.style.display = 'none';
            aktionen.style.display = 'block';
            return;
        }
        const labels = { rezepte: 'Rezepte', wochenplan: 'Wochen', einkaufsliste: 'Produkte', listen: 'Listen' };
        const teile = Object.keys(gepruefte.bereiche).map(b => `${DatenSpeicher.zaehle(b, gepruefte.bereiche[b])} ${labels[b] || b}`);
        const datum = exportiert ? new Date(exportiert) : null;
        const datumText = datum && !isNaN(datum) ? ` vom ${DatenSpeicher.formatKurz(datum)}` : '';
        const versionText = gepruefte.version < SCHEMA_VERSION ? ` Datenformat Version ${gepruefte.version}, wird beim Laden auf ${SCHEMA_VERSION} gehoben.` : '';
        document.getElementById('datenVorschauText').innerHTML =
            `<strong>Sicherung${this.escapeHtml(datumText)}</strong><br>${this.escapeHtml(teile.join(' · '))}${this.escapeHtml(versionText)}`;
        aktionen.style.display = 'none';
        vorschau.style.display = 'block';
    }

    importiereDaten(modus) {
        if (!this.importVorbereitet) return;
        if (modus === 'ersetzen' && !confirm('Wirklich alle vorhandenen Daten durch die Sicherung ersetzen?\nDas gilt auch für alle verbundenen Geräte.')) return;

        try {
            const ergebnis = DatenSpeicher.importiere(this.importVorbereitet, modus);
            this.daten = DatenSpeicher.ladeAlle();
            this.schliesseDatenModal();
            this.aktuellesRezeptId = null;
            this.aktuelleListeId = null;
            this.zeigeSeite('dashboard');
            const summe = Object.values(ergebnis).reduce((a, b) => a + b, 0);
            this.zeigeToast(modus === 'ersetzen' ? `Sicherung geladen – ${summe} Einträge` : `Sicherung ergänzt – jetzt ${summe} Einträge`);
        } catch (e) {
            this.zeigeToast(e && e.message ? e.message : 'Import fehlgeschlagen.');
        }
    }

    // =====================================================================
    // Hilfsfunktionen
    // =====================================================================

    sichere(bereich) {
        let ok = true;
        if (bereich === 'rezepte') ok = DatenSpeicher.speichereRezepte(this.daten.rezepte);
        if (bereich === 'wochenplan') ok = DatenSpeicher.speichereWochenplan(this.daten.wochenplan);
        if (bereich === 'einkaufsliste') ok = DatenSpeicher.speichereEinkaufsliste(this.daten.einkaufsliste);
        if (bereich === 'listen') ok = DatenSpeicher.speichereListen(this.daten.listen);
        if (!ok) {
            this.zeigeToast(DatenSpeicher.veraltet
                ? 'Nicht gespeichert: Die App ist veraltet, bitte neu laden.'
                : 'Speichern fehlgeschlagen – Speicher voll?');
        }
        return ok;
    }

    // Bittet den Browser, die Website-Daten nicht bei Platzmangel oder nach
    // längerer Nichtbenutzung zu räumen (Safari löscht sonst nach 7 Tagen).
    // Wird still abgelehnt oder ignoriert, wenn der Browser es nicht kann.
    bittePersistentenSpeicher() {
        try {
            if (navigator.storage && navigator.storage.persist) {
                navigator.storage.persist().catch(() => {});
            }
        } catch (e) { /* nicht verfügbar */ }
    }

    zeigeToast(text) {
        const toast = document.getElementById('toast');
        toast.textContent = text;
        toast.style.display = 'block';
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => { toast.style.display = 'none'; }, 2600);
    }

    escapeHtml(wert) {
        if (wert === null || wert === undefined) return '';
        return String(wert).replace(/[&<>"']/g, (z) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        })[z]);
    }
}

let app = null;
document.addEventListener('DOMContentLoaded', () => {
    app = new MjamOrgaApp();
    window.app = app;
});
