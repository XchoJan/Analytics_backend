#!/usr/bin/env bash
# Копирование nginx/default на сервер в /etc/nginx/sites-enabled/default

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NGINX_FILE="$PROJECT_ROOT/nginx/default"
KEY_FILE="$PROJECT_ROOT/bash_scripts/matchai-server.pem"
REMOTE_USER="ubuntu"
REMOTE_HOST="ec2-40-172-162-13.me-central-1.compute.amazonaws.com"
REMOTE_TEMP="/tmp/nginx-default"
REMOTE_PATH="/etc/nginx/sites-enabled/default"

if [ ! -f "$NGINX_FILE" ]; then
  echo "Файл nginx/default не найден по пути $NGINX_FILE" >&2
  exit 1
fi

if [ ! -f "$KEY_FILE" ]; then
  echo "SSH ключ не найден по пути $KEY_FILE" >&2
  exit 1
fi

# Чтобы не зависать: не спрашивать про host key, таймаут 15 сек
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15"

echo "📤 Отправка nginx конфигурации на сервер..."
scp -i "$KEY_FILE" $SSH_OPTS "$NGINX_FILE" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_TEMP"

echo "🔧 Установка конфигурации на сервере..."
ssh -i "$KEY_FILE" $SSH_OPTS "$REMOTE_USER@$REMOTE_HOST" "sudo mv $REMOTE_TEMP $REMOTE_PATH && sudo chown root:root $REMOTE_PATH && sudo chmod 644 $REMOTE_PATH"

echo "🧪 Проверка nginx..."
ssh -i "$KEY_FILE" $SSH_OPTS "$REMOTE_USER@$REMOTE_HOST" "sudo nginx -t"

echo "✅ Конфигурация установлена. Для применения: sudo systemctl reload nginx"
