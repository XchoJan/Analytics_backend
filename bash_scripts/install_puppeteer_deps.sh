#!/usr/bin/env bash
# Зависимости для запуска Chrome (Puppeteer) на Ubuntu-сервере.
# Запускать НА СЕРВЕРЕ (после ssh), не локально:
#   ssh ... "bash -s" < bash_scripts/install_puppeteer_deps.sh
# или скопировать на сервер и выполнить: sudo bash install_puppeteer_deps.sh

set -e

echo "Установка зависимостей для Puppeteer/Chrome..."
sudo apt-get update
# Варианты для Ubuntu 24 (t64) и более старых версий
sudo apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libasound2t64 \
  libatk-bridge2.0-0t64 \
  libatk1.0-0t64 \
  libc6 \
  libcairo2 \
  libcups2t64 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc-s1 \
  libglib2.0-0t64 \
  libgtk-3-0t64 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  lsb-release \
  wget \
  xdg-utils

echo "Готово. Перезапустите бэкенд (pm2 restart analytics-backend)."
