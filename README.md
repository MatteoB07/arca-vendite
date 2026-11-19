# Arca Vendite

Web app per segnare le vendite solidali dell'associazione L'Arca di Annalisa O.D.V. (calendari, panettoni, uova di Pasqua…).

- Si installa su iPhone da Safari: **Condividi → Aggiungi alla schermata Home**.
- **Campagne**: ogni vendita (es. «Natale 2026», «Pasqua 2027») ha prodotti, prezzi, magazzino e righe separati. Si crea, si apre, si chiude (sola consultazione) e si riapre dal nome in alto. I nomi delle persone vengono suggeriti in tutte le campagne.
- **Nessun dato è nel codice o su un server**: vendite e nomi restano solo sul telefono (memoria locale di Safari).
- Backup e ripristino da **Altro → Fai il backup / Importa backup** (file `.json` da salvare in iCloud Drive; contiene tutte le campagne). I backup della versione 1 vengono convertiti da soli nella campagna «Natale 2026».
- Funziona anche offline dopo la prima apertura.

File: `index.html`, `styles.css`, `app.js`, `sw.js` (cache offline), `manifest.webmanifest`, `icons/`.

Per pubblicare una nuova versione: aggiorna i file e cambia `CACHE` in `sw.js` (es. `arca-vendite-v3`).
