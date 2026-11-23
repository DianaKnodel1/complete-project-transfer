#!/usr/bin/env bash
# =============================================================================
#  setup-all-in-one.sh — Neue, LEERE Instanz auf EINEM Hauptserver
#    Backend (Datenbank, Logins, Dateien) + Mitarbeiter-/Admin-Portal + WebID
#  Keine alten Daten: neue Schlüssel, nur das leere Datenbank-Gerüst.
#
#  AUF DEM HAUPTSERVER (z. B. 190.97.165.55) ALS ROOT:
#    PORTAL_DOMAIN=portal.example.de API_DOMAIN=api.example.de \
#    WEBID_DOMAIN=webid.example.de ADMIN_EMAIL=admin@example.de \
#    BACKUP_SERVER_IP=190.97.165.56 bash scripts/setup-all-in-one.sh
#
#  Debian/Ubuntu (apt) und AlmaLinux/Rocky (dnf) werden automatisch erkannt.
#  Sicher wiederholbar: vorhandene Schlüssel und Datenbank bleiben erhalten.
# =============================================================================
set -euo pipefail

: "${PORTAL_DOMAIN:?PORTAL_DOMAIN fehlt (z. B. portal.example.de)}"
: "${API_DOMAIN:?API_DOMAIN fehlt (z. B. api.example.de)}"
: "${WEBID_DOMAIN:?WEBID_DOMAIN fehlt (z. B. webid.example.de)}"
: "${ADMIN_EMAIL:?ADMIN_EMAIL fehlt (für HTTPS-Zertifikate)}"
BACKUP_SERVER_IP="${BACKUP_SERVER_IP:-}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SUPABASE_DIR="${SUPABASE_DIR:-/opt/supabase}"
PORTAL_DIR="${PORTAL_DIR:-/opt/apps/portal}"
WEBID_DIR="${WEBID_DIR:-/opt/apps/webid-sim}"
SECRETS_FILE="$SUPABASE_DIR/.instance-secrets"

log()  { printf "\n\033[1;36m▸ %s\033[0m\n" "$*"; }
ok()   { printf "\033[1;32m  ✓ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m  ! %s\033[0m\n" "$*"; }

# ── 1) Pakete ──────────────────────────────────────────────────────────────
log "1/8  Pakete (Docker, nginx, certbot, Node, Bun)"
if command -v apt-get >/dev/null; then
  PM=apt
  apt-get update -qq
  apt-get install -y -qq git curl unzip openssl ca-certificates nginx certbot python3-certbot-nginx ufw python3
  command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_22.x | bash -; apt-get install -y -qq nodejs; }
elif command -v dnf >/dev/null; then
  PM=dnf
  dnf install -y -q epel-release || true
  dnf install -y -q git curl unzip openssl nginx certbot python3-certbot-nginx firewalld python3 tar
  command -v node >/dev/null || { curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -; dnf install -y -q nodejs; }
  setsebool -P httpd_can_network_connect 1 2>/dev/null || true
else
  echo "Weder apt noch dnf gefunden." >&2; exit 1
fi
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
if ! command -v bun >/dev/null; then
  curl -fsSL https://bun.sh/install | bash
  ln -sf /root/.bun/bin/bun /usr/local/bin/bun
fi
ok "Pakete bereit ($PM)"

# ── 2) Backend-Stack mit NEUEN Schlüsseln ──────────────────────────────────
log "2/8  Backend-Stack in $SUPABASE_DIR"
if [ ! -f "$SUPABASE_DIR/docker-compose.yml" ]; then
  tmp="$(mktemp -d)"
  git clone --depth 1 https://github.com/supabase/supabase "$tmp/sb"
  mkdir -p "$SUPABASE_DIR"
  cp -a "$tmp/sb/docker/." "$SUPABASE_DIR/"
  rm -rf "$tmp"
  cp "$SUPABASE_DIR/.env.example" "$SUPABASE_DIR/.env"
fi

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
make_jwt() { # $1=role $2=secret
  local h p s now exp
  now=$(date +%s); exp=$((now + 10*365*24*3600))
  h=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  p=$(printf '{"role":"%s","iss":"supabase","iat":%d,"exp":%d}' "$1" "$now" "$exp" | b64url)
  s=$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$2" -binary | b64url)
  printf '%s.%s.%s' "$h" "$p" "$s"
}
rnd() { openssl rand -hex "$1"; }

if [ ! -f "$SECRETS_FILE" ]; then
  JWT_SECRET=$(rnd 32)
  cat > "$SECRETS_FILE" <<EOF
POSTGRES_PASSWORD=$(rnd 24)
JWT_SECRET=$JWT_SECRET
ANON_KEY=$(make_jwt anon "$JWT_SECRET")
SERVICE_ROLE_KEY=$(make_jwt service_role "$JWT_SECRET")
DASHBOARD_PASSWORD=$(rnd 16)
SECRET_KEY_BASE=$(rnd 32)
VAULT_ENC_KEY=$(rnd 16)
PG_META_CRYPTO_KEY=$(rnd 16)
LOGFLARE_PUBLIC_ACCESS_TOKEN=$(rnd 24)
LOGFLARE_PRIVATE_ACCESS_TOKEN=$(rnd 24)
EOF
  chmod 600 "$SECRETS_FILE"
  ok "Neue Schlüssel erzeugt → $SECRETS_FILE (in den Passwortmanager übernehmen!)"
else
  ok "Vorhandene Schlüssel wiederverwendet"
fi
# shellcheck disable=SC1090
. "$SECRETS_FILE"

setenv() { # in .env setzen oder ergänzen
  if grep -q "^$1=" "$SUPABASE_DIR/.env"; then
    sed -i "s|^$1=.*|$1=$2|" "$SUPABASE_DIR/.env"
  else echo "$1=$2" >> "$SUPABASE_DIR/.env"; fi
}
for k in POSTGRES_PASSWORD JWT_SECRET ANON_KEY SERVICE_ROLE_KEY DASHBOARD_PASSWORD SECRET_KEY_BASE VAULT_ENC_KEY PG_META_CRYPTO_KEY LOGFLARE_PUBLIC_ACCESS_TOKEN LOGFLARE_PRIVATE_ACCESS_TOKEN; do
  setenv "$k" "${!k}"
done
setenv DASHBOARD_USERNAME admin
setenv SITE_URL "https://$PORTAL_DOMAIN"
setenv API_EXTERNAL_URL "https://$API_DOMAIN"
setenv SUPABASE_PUBLIC_URL "https://$API_DOMAIN"
setenv ADDITIONAL_REDIRECT_URLS "https://$PORTAL_DOMAIN/**"
setenv ENABLE_EMAIL_AUTOCONFIRM false
setenv DISABLE_SIGNUP false
chmod 600 "$SUPABASE_DIR/.env"

# Edge Functions des Portals
mkdir -p "$SUPABASE_DIR/volumes/functions"
cp -a "$REPO_DIR/supabase/functions/." "$SUPABASE_DIR/volumes/functions/"

# Ports nur lokal: Kong (8000) und Postgres nur über nginx bzw. SSH erreichbar
(cd "$SUPABASE_DIR" && docker compose pull -q && docker compose up -d)
for i in $(seq 1 60); do
  docker exec supabase-db pg_isready -U postgres >/dev/null 2>&1 && break; sleep 3
done
ok "Backend läuft"

# ── 3) Leeres Datenbank-Gerüst ─────────────────────────────────────────────
log "3/8  Datenbank-Gerüst einspielen (keine Daten)"
STATE="$SUPABASE_DIR/.migrations-applied"; touch "$STATE"
for f in $(ls "$REPO_DIR"/supabase/migrations/*.sql "$REPO_DIR"/supabase/manual-migrations/*.sql 2>/dev/null | sort -t/ -k1); do
  name="$(basename "$f")"
  grep -qxF "$name" "$STATE" && continue
  if docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 --single-transaction -q < "$f" >/dev/null; then
    echo "$name" >> "$STATE"; ok "$name"
  else
    warn "$name fehlgeschlagen — Skript stoppt. Fehler oben prüfen, dann erneut starten."; exit 1
  fi
done
docker exec supabase-db psql -U supabase_admin -d postgres -c "NOTIFY pgrst, 'reload schema';" >/dev/null || true
docker restart supabase-rest supabase-edge-functions >/dev/null 2>&1 || true
ok "Gerüst vollständig"

# ── 4) Portal ──────────────────────────────────────────────────────────────
log "4/8  Mitarbeiter-/Admin-Portal in $PORTAL_DIR"
mkdir -p "$PORTAL_DIR"
if [ "$REPO_DIR" != "$PORTAL_DIR" ]; then
  tar -C "$REPO_DIR" --exclude=node_modules --exclude=.git --exclude=.output -cf - . | tar -C "$PORTAL_DIR" -xf -
fi
cat > "$PORTAL_DIR/.env" <<EOF
VITE_SUPABASE_URL=https://$API_DOMAIN
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
SUPABASE_URL=https://$API_DOMAIN
SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
EOF
chmod 600 "$PORTAL_DIR/.env"
(cd "$PORTAL_DIR" && bun install --frozen-lockfile && bun run build)
REL="$PORTAL_DIR/.releases/$(date +%Y%m%d-%H%M%S)"; mkdir -p "$REL"
cp -a "$PORTAL_DIR/.output" "$REL/.output"
ln -sfn "$REL" "$PORTAL_DIR/.current"
cat > /etc/systemd/system/portal.service <<EOF
[Unit]
Description=Mitarbeiter-/Admin-Portal
After=network.target docker.service
[Service]
WorkingDirectory=$PORTAL_DIR
EnvironmentFile=$PORTAL_DIR/.env
Environment=PORTAL_BUILD_DIR=$PORTAL_DIR/.current
ExecStart=/usr/local/bin/bun run start
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload && systemctl enable --now portal.service && systemctl restart portal.service
ok "Portal läuft auf 127.0.0.1:3000"

# ── 5) WebID-Server (ohne Caddy, nginx übernimmt TLS) ──────────────────────
log "5/8  WebID-Server in $WEBID_DIR"
mkdir -p "$WEBID_DIR"
cp -a "$REPO_DIR/webid-sim-server/." "$WEBID_DIR/"
(cd "$WEBID_DIR" && (bun install --production >/dev/null 2>&1 || true) && bun build server.ts --target=node --outfile=server.js)
cat > "$WEBID_DIR/.env" <<EOF
SUPABASE_URL=https://$API_DOMAIN
SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
PORT=3002
SIM_BASE_DOMAIN=$WEBID_DOMAIN
DEFAULT_TARGET_ORIGIN=${DEFAULT_TARGET_ORIGIN:-https://webid-gateway.de}
EOF
chmod 600 "$WEBID_DIR/.env"
cat > /etc/systemd/system/webid-sim.service <<EOF
[Unit]
Description=WebID-Server
After=network.target
[Service]
WorkingDirectory=$WEBID_DIR
EnvironmentFile=$WEBID_DIR/.env
ExecStart=$(command -v node) server.js
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload && systemctl enable --now webid-sim.service && systemctl restart webid-sim.service
ok "WebID läuft auf 127.0.0.1:3002"

# ── 6) nginx + HTTPS ───────────────────────────────────────────────────────
log "6/8  nginx für $PORTAL_DOMAIN, $API_DOMAIN, $WEBID_DOMAIN"
systemctl disable --now caddy 2>/dev/null || true
proxy() { cat <<EOF
  location / {
    proxy_pass http://127.0.0.1:$1;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 300s;
  }
EOF
}
CONF_DIR=/etc/nginx/conf.d
cat > "$CONF_DIR/neuinstanz.conf" <<EOF
server { listen 80; server_name $PORTAL_DOMAIN; client_max_body_size 50M;
$(proxy 3000)
}
server { listen 80; server_name $API_DOMAIN; client_max_body_size 50M;
$(proxy 8000)
}
server { listen 80; server_name $WEBID_DOMAIN *.$WEBID_DOMAIN;
$(proxy 3002)
}
EOF
nginx -t && systemctl enable --now nginx && systemctl reload nginx
if certbot --nginx --non-interactive --agree-tos -m "$ADMIN_EMAIL" --redirect \
     -d "$PORTAL_DOMAIN" -d "$API_DOMAIN" -d "$WEBID_DOMAIN"; then
  ok "HTTPS-Zertifikate aktiv"
else
  warn "HTTPS noch nicht möglich — zeigen die 3 DNS-Einträge schon auf diesen Server? Dann Skript erneut starten."
fi
warn "Für Unteradressen *.$WEBID_DOMAIN wird ein Wildcard-Zertifikat (z. B. Cloudflare Origin) benötigt."

# ── 7) Firewall ────────────────────────────────────────────────────────────
log "7/8  Firewall: nur SSH, HTTP, HTTPS offen"
if [ "$PM" = apt ]; then
  ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
else
  systemctl enable --now firewalld
  firewall-cmd -q --permanent --add-service=ssh --add-service=http --add-service=https
  firewall-cmd -q --reload
fi
ok "Firewall aktiv (Datenbank und Backend-Ports nicht öffentlich)"

# ── 8) Prüfung ─────────────────────────────────────────────────────────────
log "8/8  Gesundheits-Check"
sleep 5
chk() { local c; c=$(curl -s -o /dev/null -w '%{http_code}' "$2" || true); [ "$c" != "000" ] && ok "$1 antwortet ($c)" || warn "$1 antwortet nicht"; }
chk "Portal" http://127.0.0.1:3000/
chk "Backend" "http://127.0.0.1:8000/auth/v1/health"
chk "WebID" http://127.0.0.1:3002/
tables=$(docker exec supabase-db psql -U postgres -d postgres -tAc "select count(*) from information_schema.tables where table_schema='public'")
ok "$tables Tabellen im leeren Gerüst"

cat <<EOF

Fertig. Nächste Schritte:
  1. Schlüssel sichern:  cat $SECRETS_FILE   → Passwortmanager
  2. Ersten Admin anlegen: im Portal https://$PORTAL_DOMAIN registrieren, dann
       bash $PORTAL_DIR/scripts/make-admin.sh deine@mail.de
  3. Backup-Server ${BACKUP_SERVER_IP:-<IP>} einrichten (siehe docs/NEUINSTANZ.md, Teil B)
EOF
