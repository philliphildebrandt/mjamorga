// === MjamOrga – PWA: Service Worker, Installation, Update-Hinweis ===
//
// Klassisches Skript ohne Abhängigkeiten. Stellt window.MjamPwa bereit und
// meldet Zustandsänderungen über das DOM-Ereignis "pwa-status", auf das app.js
// hört. So kennt app.js nur einen kleinen Zustand, keine Browser-Schnittstellen.

(function () {
    const zustand = {
        installierbar: false,   // Android/Chrome: beforeinstallprompt ist da
        installiert: false,     // läuft als installierte App (standalone)
        istIOS: false,          // iPhone/iPad: kein Prompt, nur Anleitung
        updateBereit: false,    // neuer Service Worker hat installiert
    };
    let installPrompt = null;

    function melde() {
        document.dispatchEvent(new CustomEvent('pwa-status', { detail: Object.assign({}, zustand) }));
    }

    function erkenneUmgebung() {
        const ua = navigator.userAgent || '';
        const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
        zustand.istIOS = /iPhone|iPad|iPod/.test(ua) || iPadOS;
        zustand.installiert = window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
    }

    // --- Installation (Android/Chrome) ---
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault(); // eigener Knopf statt Browser-Leiste
        installPrompt = e;
        zustand.installierbar = true;
        melde();
    });

    window.addEventListener('appinstalled', () => {
        installPrompt = null;
        zustand.installierbar = false;
        zustand.installiert = true;
        melde();
    });

    async function installiere() {
        if (!installPrompt) return false;
        installPrompt.prompt();
        const wahl = await installPrompt.userChoice;
        installPrompt = null;
        zustand.installierbar = false;
        melde();
        return wahl && wahl.outcome === 'accepted';
    }

    // --- Service Worker ---
    function registriereWorker() {
        if (!('serviceWorker' in navigator)) return;
        // Nur über http(s), nicht unter file://; und nicht in Testumgebungen ohne Worker.
        if (!/^https?:$/.test(location.protocol)) return;

        navigator.serviceWorker.register('./sw.js').then((reg) => {
            // Neuer Worker gefunden: sobald er installiert ist und schon eine alte
            // Version die Seite steuert, liegt ein Update bereit.
            reg.addEventListener('updatefound', () => {
                const neu = reg.installing;
                if (!neu) return;
                neu.addEventListener('statechange', () => {
                    if (neu.state === 'installed' && navigator.serviceWorker.controller) {
                        zustand.updateBereit = true;
                        melde();
                    }
                });
            });
            // Beim Rückkehren in die App nach Updates schauen (PWA bleibt lange offen).
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') reg.update().catch(() => {});
            });
        }).catch((e) => {
            console.warn('Service Worker nicht registriert:', e);
        });
    }

    function ladeNeu() {
        window.location.reload();
    }

    window.MjamPwa = {
        get zustand() { return Object.assign({}, zustand); },
        installiere,
        ladeNeu,
    };

    erkenneUmgebung();
    registriereWorker();
    // Erster Stand für app.js, falls es schon lauscht; sonst holt es ihn sich selbst.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', melde);
    } else {
        melde();
    }
})();
