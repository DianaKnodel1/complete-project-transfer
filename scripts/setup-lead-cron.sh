#!/usr/bin/env bash
# Richtet den Lead-Versand-Zeitplan (alle 10 Minuten) auf dem Portal-Server ein.
# Idempotent: ein vorhandener Eintrag wird ersetzt, nie doppelt angelegt.
#   bash scripts/setup-lead-cron.sh            (Domain: mb-portal.com)
#   PORTAL_DOMAIN=portal.example.com bash scripts/setup-lead-cron.sh
set -euo pipefail
REPO_DIR="${REPO_DIR:-/opt/apps/portal}"
PORTAL_DOMAIN="${PORTAL_DOMAIN:-mb-portal.com}"
if [ -z "${CRON_SECRET:-}" ]; then
  for f in "$REPO_DIR/.env.server" "$REPO_DIR/.env"; do
    [ -f "$f" ] || continue
    val="$(grep -E '^CRON_SECRET=' "$f" | tail -1 | cut -d= -f2- | tr -d "\"'")"
    [ -n "$val" ] && CRON_SECRET="$val" && break
  done
fi
if [ -z "${CRON_SECRET:-}" ]; then echo "✗ CRON_SECRET fehlt in $REPO_DIR/.env.server – Lead-Zeitplan nicht eingerichtet."; exit 1; fi
URL="https://${PORTAL_DOMAIN}/api/public/lead-mailing-cron?key=${CRON_SECRET}"
(crontab -l 2>/dev/null | grep -v 'lead-mailing-cron' || true; echo "*/10 * * * * curl -fsS \"$URL\" >/dev/null 2>&1") | crontab -
echo "✓ Lead-Versand-Zeitplan aktiv (alle 10 Minuten, ${PORTAL_DOMAIN})"
