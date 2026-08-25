# La sandbox dell'Esportazione elaborata: Claude Code (Agent SDK) dentro la
# Machine, con gli strumenti documentali (Python, Node, LibreOffice,
# Chromium, poppler) e le skill Anthropic per docx/xlsx/pptx/pdf. Il worker
# la avvia, le manda i file e il compito, ascolta lo stream, ritira i
# documenti e la distrugge. La chiave Anthropic arriva nell'ambiente del
# runner e resta dietro un proxy locale: il modello non la vede mai.
#
#   docker build -t velia-sandbox -f sandbox/Dockerfile sandbox
#   docker run --rm -e SANDBOX_TOKEN=prova -e ANTHROPIC_API_KEY=… -p 8080:8080 velia-sandbox

FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=it_IT.UTF-8 \
    NODE_PATH=/opt/strumenti/node_modules \
    PIP_BREAK_SYSTEM_PACKAGES=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv \
      libreoffice-writer libreoffice-calc libreoffice-impress \
      chromium \
      poppler-utils unzip zip locales curl ca-certificates git iproute2 \
      fonts-dejavu fonts-liberation fonts-noto-core \
    && sed -i 's/# it_IT.UTF-8/it_IT.UTF-8/' /etc/locale.gen && locale-gen \
    && rm -rf /var/lib/apt/lists/*

# Librerie documentali per Python (anche quelle che le skill Anthropic usano).
RUN pip3 install --no-cache-dir \
      python-docx openpyxl docxtpl pypdf pdfplumber reportlab markdown python-pptx pandas matplotlib \
      pillow defusedxml markitdown

# Librerie documentali per Node, raggiungibili con NODE_PATH.
RUN mkdir -p /opt/strumenti && cd /opt/strumenti \
    && npm init -y >/dev/null \
    && npm install --no-audit --no-fund docx exceljs pdf-lib docxtemplater pizzip marked \
    && npm cache clean --force

# Le skill Anthropic per i documenti (anthropics/skills, Apache 2.0): il
# know-how con cui Claude lavora DOCX, XLSX, PPTX e PDF. Copiate a ogni avvio
# in /lavoro/.claude/skills, dove la CLI le carica come skill di progetto.
RUN mkdir -p /opt/skills && cd /tmp \
    && curl -fsSL https://github.com/anthropics/skills/archive/refs/heads/main.tar.gz -o skills.tgz \
    && tar -xzf skills.tgz \
    && for s in docx xlsx pptx pdf; do cp -r skills-main/skills/$s /opt/skills/$s; done \
    && rm -rf skills.tgz skills-main

# Il runner: l'Agent SDK (porta con sé la CLI di Claude Code) e zod per il tool `consegna`.
RUN mkdir -p /opt/sandbox && cd /opt/sandbox \
    && npm init -y >/dev/null \
    && npm install --no-audit --no-fund @anthropic-ai/claude-agent-sdk@0.3.239 zod@4 \
    && npm cache clean --force

# Chromium senza sandbox del kernel (siamo già in un container) e senza GPU.
RUN printf '#!/bin/sh\nexec /usr/bin/chromium --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage "$@"\n' > /usr/local/bin/chromium-headless \
    && chmod +x /usr/local/bin/chromium-headless

COPY server.mjs /opt/sandbox/server.mjs
COPY proxy.mjs /opt/sandbox/proxy.mjs
COPY avvio.sh /opt/sandbox/avvio.sh
COPY claude-lavoro /opt/sandbox/claude-lavoro
RUN chmod +x /opt/sandbox/avvio.sh /opt/sandbox/claude-lavoro

# `proxy` è un utente di sistema che Debian ha già (uid 13): è lui a tenere la chiave e la rete.
RUN useradd -m -d /lavoro -s /bin/bash lavoro && mkdir -p /lavoro && chown -R lavoro:lavoro /lavoro /opt/strumenti
WORKDIR /lavoro
ENV HOME=/lavoro SANDBOX_RADICE=/lavoro PORTA=8080

EXPOSE 8080
# Parte da root per il firewall (solo Anthropic in uscita), poi cede a `lavoro`.
CMD ["/opt/sandbox/avvio.sh"]
