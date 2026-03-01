#!/usr/bin/env bash
# Копирование локального .env на сервер в /var/www/analytics/Analytics_backend/.env

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
KEY_FILE="$PROJECT_ROOT/bash_scripts/matchai-server.pem"
REMOTE_USER="ubuntu"
REMOTE_HOST="ec2-40-172-162-13.me-central-1.compute.amazonaws.com"
REMOTE_PATH="/var/www/analytics/Analytics_backend/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Файл .env не найден по пути $ENV_FILE" >&2
  exit 1
fi

if [ ! -f "$KEY_FILE" ]; then
  echo "SSH ключ не найден по пути $KEY_FILE" >&2
  exit 1
fi

scp -i "$KEY_FILE" "$ENV_FILE" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH"

echo "Файл .env успешно отправлен на $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH"
