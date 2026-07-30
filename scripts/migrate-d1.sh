#!/usr/bin/env bash
set -euo pipefail

mode="${1:-remote}"
case "${mode}" in
  local) flag="--local" ;;
  remote) flag="--remote" ;;
  *) echo "usage: scripts/migrate-d1.sh [local|remote]" >&2; exit 64 ;;
esac

database="${SHARVAOS_D1_DATABASE:-}"
if [[ -z "${database}" ]]; then
  echo "SHARVAOS_D1_DATABASE must contain the D1 database name or id." >&2
  exit 64
fi

migration="drizzle/0000_spooky_pet_avengers.sql"
if [[ ! -f "${migration}" ]]; then
  echo "Missing migration: ${migration}" >&2
  exit 66
fi

echo "Applying ${migration} to ${database} (${mode})"
exec bash scripts/sites-env.sh -- wrangler d1 execute "${database}" "${flag}" --file "${migration}"
