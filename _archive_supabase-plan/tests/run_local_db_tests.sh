#!/usr/bin/env bash
# Runs the schema + RLS tests against a throwaway local PostgreSQL cluster.
# Needs PostgreSQL server binaries (Ubuntu: `apt install postgresql`). Nothing
# here touches Supabase or any real data; the temporary cluster is deleted after.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/.."
BIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
WORK="$(mktemp -d)"
PORT="${PGTESTPORT:-54329}"
RUNAS=()
if [ "$(id -u)" = "0" ]; then
  id postgres >/dev/null 2>&1 && RUNAS=(su postgres -c) 
fi
run() { if [ ${#RUNAS[@]} -gt 0 ]; then "${RUNAS[@]}" "$*"; else bash -c "$*"; fi; }
[ ${#RUNAS[@]} -gt 0 ] && chown postgres "$WORK"
cleanup() { run "$BIN/pg_ctl -D $WORK/data stop -m immediate >/dev/null 2>&1 || true"; rm -rf "$WORK"; }
trap cleanup EXIT
run "$BIN/initdb -D $WORK/data -A trust -U postgres >/dev/null"
run "$BIN/pg_ctl -D $WORK/data -o '-p $PORT -k $WORK' -l $WORK/log -w start >/dev/null"
PSQL="psql -h $WORK -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c "create database mifrah_test" postgres
export PGDATABASE=mifrah_test
$PSQL -f "$HERE/00_supabase_stub.sql" >/dev/null
for f in "$ROOT"/migrations/*.sql; do echo "applying $(basename "$f")"; $PSQL -f "$f" >/dev/null; done
$PSQL -f "$HERE/rls_and_schema.test.sql" | tee "$WORK/out.txt"
echo "--- seed (applied twice to prove it is re-runnable) ---"
(cd "$ROOT/.." && $PSQL -f supabase/tests/seed_check.sql)
! grep -q '^FAIL' "$WORK/out.txt"
