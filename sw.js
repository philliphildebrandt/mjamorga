// === MjamOrga – Service Worker ===
//
// Zweck: Die App-Hülle (HTML, CSS, JS, Icons, Firebase-SDK) offline verfügbar
// halten. Strategie "erst Netz, dann Cache": online kommt immer die aktuelle
// Version von GitHub Pages, der Cache greift nur ohne Netz. Das passt zum
// Abwärtsschutz in storage.js – eine veraltete Hülle wird nie bevorzugt.
//
// Daten (Firestore, Anmeldung) werden hier bewusst NICHT angefasst. Sie haben
// ihren eigenen Offline-Puffer in IndexedDB.
//
// Bei jeder Veröffentlichung CACHE_VERSION erhöhen: Der neue Worker legt einen
// neuen Cache an, räumt den alten weg und meldet der Seite "neue Version".

const CACHE_VERSION = 'mjamorga-v2';

// Die App-Hülle. Relative Pfade, damit es unter /mjamorga/ auf GitHub Pages
// genauso läuft wie lokal unter /.
const HUELLE = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './js/storage.js',
    './js/app.js',
    './js/firebase-config.js',
    './js/sync.js',
    './js/pwa.js',
    './icons/icon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/apple-touch-icon.png',
];

// Firebase-SDK vom Google-CDN. Versionierte Adressen, daher unkritisch zu cachen.
// Wird nur "nach Möglichkeit" vorgeladen: fehlt das Netz beim Installieren,
// scheitert die Installation daran nicht.
const CDN = [
    'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js',
    'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js',
];

// Entscheidet, ob der Worker eine Anfrage überhaupt behandelt.
// Nur GET, nur die eigene Herkunft oder das Firebase-CDN. Alles andere
// (Firestore, Identity Toolkit, fremde Rezeptbilder) läuft am Worker vorbei.
function istHuellenAnfrage(request, eigeneHerkunft) {
    if (request.method !== 'GET') return false;
    let url;
    try { url = new URL(request.url); } catch (e) { return false; }
    if (url.origin === eigeneHerkunft) return true;
    return url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
}

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_VERSION);
        await cache.addAll(HUELLE);
        await Promise.all(CDN.map((url) => cache.add(url).catch(() => null)));
        // Sofort aktiv werden; die Seite erfährt davon über "updatefound".
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const namen = await caches.keys();
        await Promise.all(namen.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    if (!istHuellenAnfrage(event.request, self.location.origin)) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_VERSION);
        try {
            const antwort = await fetch(event.request);
            // Nur brauchbare Antworten ablegen; Fehlerseiten nicht.
            if (antwort && antwort.ok) cache.put(event.request, antwort.clone());
            return antwort;
        } catch (e) {
            const gecacht = await cache.match(event.request, { ignoreSearch: true });
            if (gecacht) return gecacht;
            // Navigation ohne Netz und ohne Treffer: die Startseite aus dem Cache.
            if (event.request.mode === 'navigate') {
                const start = await cache.match('./index.html');
                if (start) return start;
            }
            throw e;
        }
    })());
});

// Testbarkeit außerhalb des Browsers (Node): die Entscheidungsfunktion freigeben.
if (typeof module !== 'undefined') module.exports = { istHuellenAnfrage, HUELLE, CDN, CACHE_VERSION };
