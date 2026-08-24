# Strumenti del FE

## screenshot-mobile.mjs

Fotografa l'applicazione a 390×844 (smartphone) e 820×1180 (tablet) con il
Chrome installato sulla macchina, entrando col login demo contro lo stack dev
(`npm run dev` acceso, proxy verso il BE). Per ogni rotta stampa anche
l'overflow orizzontale della pagina, che deve essere 0.

    npm i -D puppeteer-core          # una volta, non scarica browser
    node tools/screenshot-mobile.mjs "chat,archivio/pubblico,memoria"
    node tools/screenshot-mobile.mjs "chat#menu"   # col cassetto aperto

Le immagini finiscono in `fe-angular/.screenshot/` (ignorata da git).
