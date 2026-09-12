#!/usr/bin/env bash
set -euo pipefail
ROOT=/srv/evidy
LOCAL=http://127.0.0.1:4280/healthz
LOG=/var/log/evidy-quick-tunnel.log
STATE=/var/lib/evidy/public-api-url
mkdir -p /var/lib/evidy

if ! curl -fsS --max-time 5 "$LOCAL" >/dev/null; then
  systemctl restart evidy-api.service
  sleep 2
  curl -fsS --max-time 5 "$LOCAL" >/dev/null
fi

if ! systemctl is-active --quiet evidy-quick-tunnel.service; then
  systemctl restart evidy-quick-tunnel.service
fi

get_url(){ grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | tail -1; }
verify_url(){
  local url="$1" host ip
  host="${url#https://}"; host="${host%%/*}"
  ip="$(getent ahostsv4 "$host" | awk 'NR==1{print $1}')"
  [ -n "$ip" ] || return 1
  curl --resolve "$host:443:$ip" -fsS --max-time 10 "$url/healthz" >/dev/null
}

URL=''
for _ in $(seq 1 30); do
  URL="$(get_url || true)"
  if [ -n "$URL" ] && verify_url "$URL"; then break; fi
  sleep 2
done
if [ -z "$URL" ] || ! verify_url "$URL"; then
  systemctl restart evidy-quick-tunnel.service
  sleep 6
  URL="$(get_url || true)"
  [ -n "$URL" ] && verify_url "$URL"
fi

CURRENT="$(sed -n "s/.*apiBase: '\([^']*\)'.*/\1/p" "$ROOT/web/config.js" | head -1)"
if [ "$CURRENT" != "$URL" ]; then
  printf "window.EVIDY = Object.freeze({\n  apiBase: '%s'\n});\n" "$URL" > "$ROOT/web/config.js"
  printf '%s\n' "$URL" > "$STATE"
  cd "$ROOT"
  git add web/config.js
  git commit -m "ops: rotate browser API endpoint" >/dev/null || true
  git push origin main >/dev/null
  "$ROOT/scripts/deploy-pages.sh" >/dev/null
else
  printf '%s\n' "$URL" > "$STATE"
fi
