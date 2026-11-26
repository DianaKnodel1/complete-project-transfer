#!/usr/bin/env bash
# =============================================================================
#  set-git-token.sh — Server Zugang zum privaten GitHub-Repo geben
# =============================================================================
#  Einmalig auf dem Portal-Server ausführen, danach läuft deploy.sh ohne
#  nach einem Zugang zu fragen.
#
#  Verwendung:
#    GITHUB_TOKEN=ghp_xxx bash scripts/set-git-token.sh
#  oder interaktiv:
#    bash scripts/set-git-token.sh
#
#  Benötigt ein GitHub-Token mit Lesezugriff auf das Repo.
#  Empfohlen: Fine-grained Token, Scope "Contents: Read-only",
#  nur auf das betreffende Repository beschränkt.
# =============================================================================
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/DianaKnodel1/complete-project-transfer.git}"
PROJECT_DIR="${PROJECT_DIR:-/opt/apps/portal}"
CRED_FILE="${GIT_CREDENTIALS_FILE:-$HOME/.git-credentials}"

log() { printf "\n\033[1;36m▸ %s\033[0m\n" "$*"; }
ok()  { printf "\n\033[1;32m  ✓ %s\033[0m\n" "$*"; }
warn(){ printf "\n\033[1;33m  ! %s\033[0m\n" "$*"; }

TOKEN="${GITHUB_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  read -r -s -p "GitHub-Token eingeben (wird nicht angezeigt): " TOKEN
  echo
fi

if [ -z "$TOKEN" ]; then
  warn "Kein Token erhalten. Abbruch."
  exit 1
fi

# Token niemals in die Shell-History oder in .git/config schreiben.
umask 077
touch "$CRED_FILE"
chmod 600 "$CRED_FILE"

# Eintrag für github.com anlegen bzw. ersetzen (x-access-token = üblicher User)
if grep -q "@github.com" "$CRED_FILE" 2>/dev/null; then
  tmp="$(mktemp)"
  grep -v "@github.com" "$CRED_FILE" > "$tmp" || true
  printf 'https://x-access-token:%s@github.com\n' "$TOKEN" >> "$tmp"
  mv "$tmp" "$CRED_FILE"
  chmod 600 "$CRED_FILE"
  ok "Bestehender github.com-Eintrag in $CRED_FILE ersetzt"
else
  printf 'https://x-access-token:%s@github.com\n' "$TOKEN" >> "$CRED_FILE"
  chmod 600 "$CRED_FILE"
  ok "Zugang in $CRED_FILE gespeichert"
fi

# Git soll diese Datei benutzen (nur für dieses Repo, global wenn kein Repo da ist)
if [ -d "$PROJECT_DIR/.git" ]; then
  git -C "$PROJECT_DIR" config credential.helper store
  ok "credential.helper für $PROJECT_DIR gesetzt"
else
  git config --global credential.helper store
  ok "credential.helper global gesetzt"
fi

log "Teste Zugang zum Repo ..."
if git ls-remote --heads "$REPO_URL" >/dev/null 2>&1; then
  ok "Repo ist lesbar – Deploy kann laufen"
else
  warn "Repo konnte NICHT gelesen werden. Token prüfen (Lesezugriff auf dieses Repo?)"
  exit 1
fi
