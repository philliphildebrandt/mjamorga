// === MjamOrga – Anwendungslogik ===
//
// Diese Datei kennt die Oberfläche, storage.js kennt die Daten.
// Rendering läuft immer in eine Richtung: Daten -> Ansicht.

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

        this.init();
    }

    init() {
        this.fuelleKategorieAuswahl();
        this.bindNavigation();
        this.bindEvents();
        this.bindSync();
        this.zeigeSeite('dashboard');
    }

    // =====================================================================
    // Navigation
    // =====================================================================

    bindNavigation() {
        document.querySelectorAll('.nav-item').forEach((item) => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.zeigeSeite(item.dataset.page);
            });
        });
    }

    zeigeSeite(seite) {
        const seitenMap = {
            dashboard: 'page-dashboard',
            rezepte: 'page-rezepte',
            'rezept-detail': 'page-rezept-detail',
            'rezept-form': 'page-rezept-form',
            wochenplan: 'page-wochenplan',
            einkaufsliste: 'page-einkaufsliste',
        };

        this.aktuelleSeite = seite;

        document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
        const ziel = document.getElementById(seitenMap[seite] || 'page-dashboard');
        if (ziel) ziel.classList.add('active');

        // Bottom-Navigation: Unterseiten der Rezepte halten den Rezepte-Tab aktiv
        const navSeite = (seite === 'rezept-detail' || seite === 'rezept-form') ? 'rezepte' : seite;
        document.querySelectorAll('.nav-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.page === navSeite);
        });

        if (seite === 'dashboard') this.rendereDashboard();
        if (seite === 'rezepte') this.rendereRezeptListe();
        if (seite === 'wochenplan') this.rendereWochenplan();
        if (seite === 'einkaufsliste') this.rendereEinkaufsliste();

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
                this.schliesseProduktModal();
                this.schliesseSyncModal();
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
    // Hilfsfunktionen
    // =====================================================================

    sichere(bereich) {
        let ok = true;
        if (bereich === 'rezepte') ok = DatenSpeicher.speichereRezepte(this.daten.rezepte);
        if (bereich === 'wochenplan') ok = DatenSpeicher.speichereWochenplan(this.daten.wochenplan);
        if (bereich === 'einkaufsliste') ok = DatenSpeicher.speichereEinkaufsliste(this.daten.einkaufsliste);
        if (!ok) this.zeigeToast('Speichern fehlgeschlagen – Speicher voll?');
        return ok;
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
