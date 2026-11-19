#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
install_backend=true
if [[ "${1:-}" == "--frontend-only" ]]; then
  install_backend=false
elif [[ $# -gt 0 ]]; then
  echo "Usage: bash scripts/install-local.sh [--frontend-only]" >&2
  exit 2
fi
test -f frontend/dist/routes.json
frontend_id=$(docker compose ps -q frontend)
test -n "$frontend_id"
if $install_backend; then
  test -f backend/target/whomds-0.1.0.omod
  backend_id=$(docker compose ps -q backend)
  test -n "$backend_id"
fi
# nginx serves SPA asset paths with a 1-year immutable Cache-Control, so a fixed directory
# name would pin whatever bundle a browser fetched first. Real O3 apps version the directory
# (e.g. openmrs-esm-home-app-12.1.1/); mirror that with a per-build hash so each install
# gets a fresh URL that no stale cache entry can shadow.
# Hash every emitted asset, not just the entry bundle: a CSS-only or chunk-only change leaves
# the entry file byte-identical, and reusing the directory would serve the old assets from
# nginx's 1-year immutable cache.
spa_dir="who-mds-$(find frontend/dist -type f -exec shasum -a 256 {} + | sort -k2 | shasum -a 256 | cut -c1-12)"
backup_dir="$(pwd)/.local-install/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir/original" "$backup_dir/patched"
docker cp "$frontend_id:/usr/share/nginx/html/importmap.json" "$backup_dir/original/importmap.json"
docker cp "$frontend_id:/usr/share/nginx/html/routes.registry.json" "$backup_dir/original/routes.registry.json"
cp "$backup_dir/original/"*.json "$backup_dir/patched/"
node scripts/register-frontend.mjs "$backup_dir/patched" "./$spa_dir/who-mds-esm-who-mds-app.js"
# RefApp's persisted application-data directory. Fail before copying if it is unavailable.
if $install_backend; then
  docker compose exec -T backend test -d /openmrs/data
  docker compose exec -T backend mkdir -p /openmrs/data/modules
  docker cp backend/target/whomds-0.1.0.omod "$backend_id:/openmrs/data/modules/whomds-0.1.0.omod"
fi
docker compose exec -T frontend mkdir -p "/usr/share/nginx/html/$spa_dir"
docker cp frontend/dist/. "$frontend_id:/usr/share/nginx/html/$spa_dir/"
docker cp "$backup_dir/patched/importmap.json" "$frontend_id:/usr/share/nginx/html/importmap.json"
docker cp "$backup_dir/patched/routes.registry.json" "$frontend_id:/usr/share/nginx/html/routes.registry.json"
# nginx is built with gzip_static/brotli_static, so it prefers a sibling .gz/.br over the
# plaintext file whenever the client sends Accept-Encoding. The image ships pre-compressed
# copies of both registries; leaving them in place means every browser keeps getting the
# original, unpatched registry while only `curl` without Accept-Encoding sees the new one.
# Rewrite the variants from the patched files so all encodings agree.
for registry in importmap.json routes.registry.json; do
  if docker compose exec -T frontend test -f "/usr/share/nginx/html/$registry.gz"; then
    gzip -9 -c "$backup_dir/patched/$registry" > "$backup_dir/patched/$registry.gz"
    docker cp "$backup_dir/patched/$registry.gz" "$frontend_id:/usr/share/nginx/html/$registry.gz"
  fi
  # No portable brotli encoder is guaranteed here; drop the stale .br so nginx falls back
  # to .gz or plaintext rather than serving October's registry to every browser.
  docker compose exec -T frontend rm -f "/usr/share/nginx/html/$registry.br"
done
if $install_backend; then
  docker compose restart backend
  echo "Backend restarting; wait for OpenMRS to become healthy."
fi
echo "Installed files at /openmrs/spa/$spa_dir/. Registry backups: $backup_dir/original"
echo "Sign in, grant reporting privileges if needed and reload the app."
echo "Frontend changes are in the container layer; rerun after recreating the frontend container."
