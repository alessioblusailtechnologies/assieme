#!/bin/sh
# Avvio della sandbox, da root:
#  1. un network namespace `lavoro` senza rotta di default, collegato al
#     namespace principale da un solo cavo virtuale (10.200.0.1 ↔ 10.200.0.2):
#     è lì che girano Claude Code e il Bash del modello, e da lì si raggiunge
#     SOLO il proxy della chiave. Niente Internet per costruzione, niente
#     iptables, niente moduli del kernel che su Fly non ci sono.
#     Dove i namespace non si possono creare (Render: niente NET_ADMIN) si
#     parte con SANDBOX_RETE=aperta: CLI e comandi girano come utente
#     `lavoro` ma con la rete del container. La chiave resta nel proxy, con
#     un altro utente; è la rete in uscita del modello che non si può chiudere.
#  2. il proxy della chiave (utente `proxy`, namespace principale, con rete).
#  3. le skill Anthropic nella workspace.
#  4. il runner (root, namespace principale: deve entrare nel namespace
#     `lavoro` per lanciare la CLI e i comandi del modello).
# Tutto finisce anche in /tmp/avvio.log, per capire una Machine che non parte.
LOG=/tmp/avvio.log
nota() { echo "$*"; echo "$*" >> "$LOG"; }
: > "$LOG"

if [ "${SANDBOX_RETE:-isolata}" = "aperta" ]; then
  SANDBOX_NETNS=0
  nota "rete: APERTA (SANDBOX_RETE=aperta): nessun namespace, il modello ha la rete del container"
elif ip netns add lavoro 2>>"$LOG"; then
  ip link add veth-root type veth peer name veth-lav
  ip link set veth-lav netns lavoro
  ip addr add 10.200.0.1/30 dev veth-root
  ip link set veth-root up
  ip netns exec lavoro ip addr add 10.200.0.2/30 dev veth-lav
  ip netns exec lavoro ip link set veth-lav up
  ip netns exec lavoro ip link set lo up
  SANDBOX_NETNS=1
  nota "rete: namespace lavoro isolato (solo 10.200.0.1)"
else
  nota "rete: IMPOSSIBILE creare il namespace: la sandbox non parte (SANDBOX_RETE=aperta per rinunciare all'isolamento)"
  exit 1
fi
export SANDBOX_NETNS

# Il proxy delle chiavi, con le chiavi; poi le chiavi spariscono dall'ambiente.
# Dal 21/09/2026 anche DeepSeek: la sandbox segue il livello dell'agenzia.
# SANDBOX_FORNITORI dice al runner chi il proxy sa raggiungere.
SANDBOX_FORNITORI=""
[ -n "${ANTHROPIC_API_KEY:-}" ] && SANDBOX_FORNITORI="anthropic"
[ -n "${DEEPSEEK_API_KEY:-}" ] && SANDBOX_FORNITORI="$SANDBOX_FORNITORI deepseek"
SANDBOX_FORNITORI=$(echo $SANDBOX_FORNITORI)
if [ -n "$SANDBOX_FORNITORI" ]; then
  su -s /bin/sh proxy -c "ANTHROPIC_API_KEY='${ANTHROPIC_API_KEY:-}' DEEPSEEK_API_KEY='${DEEPSEEK_API_KEY:-}' DEEPSEEK_BASE_URL='${DEEPSEEK_BASE_URL:-}' PORTA_PROXY=8787 exec node /opt/sandbox/proxy.mjs" >> "$LOG" 2>&1 &
  nota "proxy: avviato per $SANDBOX_FORNITORI"
else
  nota "proxy: nessuna chiave"
fi
# SANDBOX_CHIAVE resta per chi guarda /salute: è la chiave Anthropic.
case " $SANDBOX_FORNITORI " in *" anthropic "*) SANDBOX_CHIAVE=1 ;; *) SANDBOX_CHIAVE=0 ;; esac
unset ANTHROPIC_API_KEY DEEPSEEK_API_KEY
export SANDBOX_CHIAVE SANDBOX_FORNITORI

# Le skill Anthropic come skill di progetto della workspace.
mkdir -p /lavoro/.claude/skills
cp -r /opt/skills/. /lavoro/.claude/skills/
chown -R lavoro:lavoro /lavoro
nota "skill: copiate"

# Le piattaforme (Render) assegnano la porta in PORT: vince su PORTA.
[ -n "${PORT:-}" ] && export PORTA="$PORT"

nota "runner: avvio"
cd /lavoro
exec node /opt/sandbox/server.mjs
