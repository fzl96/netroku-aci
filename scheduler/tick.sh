#!/bin/sh
# Stateless scheduler ticker. Holds no schedule state — the app decides what is due.
set -eu

: "${TICK_URL:?TICK_URL is required}"
: "${SCHEDULER_TOKEN:?SCHEDULER_TOKEN is required}"

while true; do
  if ! curl -fsS --max-time 900 \
    -X POST "${TICK_URL}" \
    -H "Authorization: Bearer ${SCHEDULER_TOKEN}"; then
    echo "$(date -Iseconds) tick failed" >&2
  fi
  sleep "${TICK_INTERVAL_SECONDS:-60}"
done
