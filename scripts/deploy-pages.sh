#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC_URL="$(git -C "$ROOT" remote get-url pages)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -a "$ROOT/web/." "$TMP/"
git -C "$TMP" init -q
git -C "$TMP" checkout -qb gh-pages
git -C "$TMP" config user.name 'TRIGG4'
git -C "$TMP" config user.email 'trigg4@users.noreply.github.com'
git -C "$TMP" add .
git -C "$TMP" commit -qm 'eVidy US web app'
git -C "$TMP" remote add public "$PUBLIC_URL"
git -C "$TMP" push --force public gh-pages:gh-pages
printf 'Published %s\n' "$(git -C "$TMP" rev-parse HEAD)"
