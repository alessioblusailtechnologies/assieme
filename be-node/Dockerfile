# VELIA backend: un'immagine sola per API e worker, il comando decide.
#
#   API:    node dist/src/api/server.js      (porta $PORT, health /api/salute)
#   worker: node dist/src/worker/main.js     (nessuna porta: solo Postgres in uscita)
#
# Immagine Debian slim, non Alpine: l'Agent SDK lancia la CLI di Claude Code
# come processo figlio, e i binari che porta con sé (ripgrep) sono glibc.

# ---------- build: compila TypeScript con le dipendenze di sviluppo ----------
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
RUN npm run build

# ---------- runtime: solo produzione ----------
FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app

# L'utente non privilegiato ha bisogno di una cartella scrivibile per la
# cache delle workspace (CARTELLA_WORKER): su Railway ci si monta il volume.
RUN mkdir -p /app/.velia-worker && chown -R node:node /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist
# I dati di piattaforma letti a runtime (agenti predefiniti, catalogo).
COPY dati ./dati

USER node
ENV CARTELLA_WORKER=/app/.velia-worker
EXPOSE 3002

CMD ["node", "dist/src/api/server.js"]
