#!/usr/bin/env bash
set -euo pipefail
LOCAL='http://127.0.0.1:4280/healthz'
PUBLIC='https://vmi3492066-1.tail1b7515.ts.net:8443/healthz'
if ! curl -fsS --max-time 5 "$LOCAL" >/dev/null; then
  systemctl restart evidy-api.service
  sleep 2
fi
if ! curl -fsS --max-time 8 "$PUBLIC" >/dev/null; then
  /usr/bin/tailscale funnel --bg --https=8443 --yes 4280 >/dev/null
  sleep 2
  curl -fsS --max-time 8 "$PUBLIC" >/dev/null
fi
