// === MjamOrga – Firebase-Konfiguration ===
//
// Den Block aus der Firebase-Konsole hier eintragen:
//   Projektübersicht -> Zahnrad -> Projekteinstellungen -> "Meine Apps"
//   -> Web-App -> "SDK-Einrichtung und -Konfiguration" -> "Konfiguration"
//
// Der apiKey ist KEIN Geheimnis: er identifiziert nur das Projekt. Wer damit
// schreiben darf, regeln ausschließlich die Firestore-Sicherheitsregeln
// (siehe firestore.rules). Die Datei darf daher öffentlich im Repo liegen.
//
// Bleibt apiKey leer, startet die App ohne Sync – rein mit localStorage.

window.FIREBASE_CONFIG = {
    apiKey: "AIzaSyB_nztupIw8KDiDTJ8-nz28y1gxWo6vZVU",
    authDomain: "mjamorga.firebaseapp.com",
    projectId: "mjamorga",
    storageBucket: "mjamorga.firebasestorage.app",
    messagingSenderId: "79790720367",
    appId: "1:79790720367:web:a7953300483e05070e949a"
};
