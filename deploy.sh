#!/bin/bash

# 1. set -e заставляет скрипт немедленно остановиться, если любая команда вернет ошибку.
# Это предотвратит попытку собрать сломанный код.
set -e

echo -e "\e[34m 1. Синхронизирую код с GitHub (принудительный сброс до origin/main)...\e[0m"
git fetch origin
git reset --hard origin/main
git clean -fd

echo -e "\e[34m 2. Собираю и перезапускаю контейнеры...\e[0m"
docker compose up -d --build --remove-orphans

echo -e "\e[34m 3. Очищаю неиспользуемые образы, кэш и остановленные контейнеры...\e[0m"
# system prune более эффективен, чем просто image prune
docker system prune -f

echo -e "\e[32m✅ Готово! Приложение и база данных успешно обновлены и запущены.\e[0m"