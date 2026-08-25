#!/bin/sh
# Avvio della sandbox, da root:
#  1. un network namespace `lavoro` senza rotta di default, collegato al
#     namespace principale da un solo cavo virtuale (10.200.0.1 ↔ 10.200.0.2):
#     è lì che girano Claude Code e il Bash del modello, e da lì si raggiunge
#     SOLO il proxy della chiave. Niente Internet per costruzione, niente
#     iptables, niente moduli del kernel che su Fly non ci sono.
#  2. il proxy della chiave (utente `proxy`, namespace principale, con rete).
#  3. le skill Anthropic nella workspace.
#  4. il runner (root, namespace principale: deve entrare nel namespace
#     `lavoro` per lanciare la CLI e i comandi del modello).
# Tutto finisce anche in /tmp/avvio.log, per capire una Machine che non parte.
LOG=/tmp/avvio.log
nota() { echo "$*"; echo "$*" >> "$LOG"; }
: > "$LOG"

if ip netns add lavoro 2>>"$LOG"; then
  ip link add veth-root type veth peer name veth-lav
  ip link set veth-lav netns lavoro
  ip addr add 10.200.0.1/30 dev veth-root
  ip link set veth-root up
  ip netns exec lavoro ip addr add 10.200.0.2/30 dev veth-lav
  ip netns exec lavoro ip link set veth-lav up
  ip netns exec lavoro ip link set lo up
  nota "rete: namespace lavoro isolato (solo 10.200.0.1)"
else
  nota "rete: IMPOSSIBILE creare il namespace: la sandbox non parte"
  exit 1
fi

# Il proxy della chiave, con la chiave; poi la chiave sparisce dall'ambiente.
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  su -s /bin/sh proxy -c "ANTHROPIC_API_KEY='$ANTHROPIC_API_KEY' PORTA_PROXY=8787 exec node /opt/sandbox/proxy.mjs" >> "$LOG" 2>&1 &
  SANDBOX_CHIAVE=1
  nota "proxy: avviato"
else
  SANDBOX_CHIAVE=0
  nota "proxy: nessuna chiave"
fi
unset ANTHROPIC_API_KEY
export SANDBOX_CHIAVE

# Le skill Anthropic come skill di progetto della workspace.
mkdir -p /lavoro/.claude/skills
cp -r /opt/skills/. /lavoro/.claude/skills/
chown -R lavoro:lavoro /lavoro
nota "skill: copiate"

nota "runner: avvio"
cd /lavoro
exec node /opt/sandbox/server.mjs
