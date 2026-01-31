#!/bin/bash
# Добавляет переменные из .env.local в Vercel (Production).
# Запуск: из корня проекта, при установленном Vercel CLI (npm i -g vercel).
#   ./scripts/add-vercel-env.sh

set -e
cd "$(dirname "$0")/.."
ENV_FILE="${1:-.env.local}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Файл $ENV_FILE не найден. Укажите путь к .env.local."
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "Установите Vercel CLI: npm i -g vercel"
  exit 1
fi

# Читаем значение переменной из .env.local (убираем кавычки и экспорт)
get_val() {
  grep -E "^${1}=" "$ENV_FILE" | sed 's/^[^=]*=//' | sed 's/^["'\'']//;s/["'\'']$//' | head -1
}

vars=(
  MINIO_ENDPOINT
  MINIO_BUCKET
  MINIO_ACCESS_KEY
  MINIO_SECRET_KEY
  APOLLO_API_KEY
)

for key in "${vars[@]}"; do
  val=$(get_val "$key")
  if [ -n "$val" ]; then
    echo "Добавляю $key в Vercel (Production)..."
    echo -n "$val" | vercel env add "$key" production
    echo " OK"
  else
    echo "Пропуск $key (нет в $ENV_FILE)"
  fi
done

echo "Готово. Передеплойте проект в Vercel, чтобы переменные применились."
