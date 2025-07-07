#!/bin/sh
# Wait for Redis to be available before starting the app
set -e

HOST=${REDIS_HOST:-redis}
PORT=${REDIS_PORT:-6379}

until nc -z "$HOST" "$PORT"; do
  echo "[WAIT] Waiting for Redis at $HOST:$PORT..."
  sleep 1
done

echo "[WAIT] Redis is available at $HOST:$PORT!"
exec "$@"
