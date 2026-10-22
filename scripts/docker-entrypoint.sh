#!/bin/bash
set -Eeuo pipefail

cd /app
./node_modules/.bin/prisma db push --skip-generate

cd /app/mini-services/tiktok-comments
bun run index.ts &
comments_pid=$!

cd /app
node .next/standalone/server.js &
app_pid=$!

stop_children() {
  trap - INT TERM
  kill -TERM "$comments_pid" "$app_pid" 2>/dev/null || true
  wait "$comments_pid" 2>/dev/null || true
  wait "$app_pid" 2>/dev/null || true
}

trap 'stop_children; exit 130' INT
trap 'stop_children; exit 143' TERM

set +e
wait -n -p exited_pid "$comments_pid" "$app_pid"
status=$?
set -e

if [[ "$exited_pid" == "$comments_pid" ]]; then
  echo "TikTok comments service exited; stopping Libcut." >&2
elif [[ "$exited_pid" == "$app_pid" ]]; then
  echo "Libcut server exited; stopping the TikTok comments service." >&2
else
  echo "A Libcut child process exited; stopping the remaining service." >&2
fi

stop_children
if [[ "$status" -eq 0 ]]; then
  exit 1
fi
exit "$status"
