# Arca Vendite

Web app per segnare le vendite solidali dell'associazione L'Arca di Annalisa O.D.V. (calendari, panettoni, uova di Pasqua…).

Indirizzo: **https://arca-vendite.firebaseapp.com**

- Si installa come app: su iPhone/iPad da Safari **Condividi → Aggiungi alla schermata Home**, su Android da Chrome **⋮ → Installa app**. Funziona anche da computer.
- **Interfaccia adattiva**: su telefono barra in basso; su tablet e computer schede su più colonne e menu laterale.
- **Database online condiviso** (Firebase Firestore): le vendite si vedono da tutti i dispositivi autorizzati e restano disponibili anche offline; le modifiche fatte senza rete partono appena torna la connessione.
- **Accessi**: si entra con un account Google. Solo gli account in elenco leggono e scrivono; l'amministratore li aggiunge o li toglie da **Altro → Accessi**.
- **Campagne**: ogni vendita (es. «Natale 2026», «Pasqua 2027») ha prodotti, prezzi, magazzino, righe e soldi consegnati alla presidente separati. Si crea, si apre, si chiude (sola consultazione) e si riapre.
- Backup e ripristino da **Altro → Fai il backup / Importa backup** (file `.json`, contiene tutte le campagne).
- Animazione del logo all'apertura (`splash.js`, livelli in `img/`).
- **Nessun dato di vendita è nel codice**: sono solo nel database online, protetto dalle regole di sicurezza.

File: `index.html`, `styles.css`, `splash.js`, `app.js`, `sw.js` (cache offline e aggiornamento automatico), `manifest.webmanifest`, `icons/`, `img/`, `firebase.json`.
Le regole del database (`firestore.rules`) non sono nel repository perché contengono l'email dell'amministratore.

## Pubblicare una nuova versione

1. Aggiorna i file, cambia `VERSIONE` in `app.js` e `CACHE` in `sw.js` (es. `arca-vendite-v7`).
2. Pubblica: `firebase deploy --only "firestore:rules,hosting" --project arca-vendite` (su Windows `firebase.cmd`).
3. Le app installate si aggiornano da sole alla successiva apertura.
