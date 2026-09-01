# استقرار WebinoDashboard روی aaPanel (Docker)

این راهنما برای اجرای **کل استک** (PostgreSQL + Redis + Laravel Octane + Next.js + Caddy) روی سرور با [aaPanel](https://www.aapanel.com) است.

## پیش‌نیازها

- Ubuntu 22/24 (یا Debian) با حداقل 2GB RAM
- دامنه با DNS به IP سرور
- در aaPanel: **Docker** و **Docker Manager** نصب باشد

## ۱. آپلود پروژه

روی سرور (SSH):

```bash
cd /www/wwwroot
git clone <آدرس-ریپوی-شما> webino
cd webino/WebinoDashboard
```

> اگر فقط پوشه `WebinoDashboard` را دارید، مسیر `packages/webina-ui` باید در سطح بالاتر موجود باشد (ساختار مونورپو). در غیر این صورت build فرانت شکست می‌خورد.

ساختار مورد انتظار:

```
Plugins/Webina/
├── packages/webina-ui/
└── WebinoDashboard/
    ├── backend/
    ├── frontend/
    └── docker-compose.aapanel.yml
```

## ۲. تنظیم env

```bash
cd /www/wwwroot/webino/WebinoDashboard

# متغیرهای compose (پورت و دیتابیس)
cp .env.docker.example .env
nano .env
```

در `.env` حتماً `POSTGRES_PASSWORD` را عوض کنید. اگر پورت 80/443 روی سرور اشغال است:

```env
WEB_HTTP_PORT=3080
WEB_HTTPS_PORT=3443
```

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

حداقل این موارد را در `backend/.env` تنظیم کنید:

```env
APP_ENV=production
APP_DEBUG=false
APP_URL=https://your-domain.com

DB_CONNECTION=pgsql
# DB_HOST/DB_* توسط docker-compose override می‌شوند

SESSION_DRIVER=redis
CACHE_STORE=redis
QUEUE_CONNECTION=redis

SANCTUM_STATEFUL_DOMAINS=your-domain.com,www.your-domain.com
CORS_ALLOWED_ORIGINS=https://your-domain.com
FRONTEND_URL=https://your-domain.com
```

تولید `APP_KEY`:

```bash
docker run --rm -v "$(pwd)/backend:/app" -w /app composer:2 php -r "copy('.env.example', '.env');" 2>/dev/null || true
docker run --rm -v "$(pwd)/backend:/app" -w /app composer:2 bash -lc "composer install --no-interaction && php artisan key:generate"
```

یا اگر PHP روی سرور دارید: `cd backend && composer install && php artisan key:generate`

## ۳. Build و اجرا

```bash
cd /www/wwwroot/webino/WebinoDashboard
docker compose -f docker-compose.aapanel.yml up -d --build
```

بررسی وضعیت:

```bash
docker compose -f docker-compose.aapanel.yml ps
docker compose -f docker-compose.aapanel.yml logs -f backend
```

اولین بالا آمدن: migration خودکار اجرا می‌شود (`RUN_MIGRATIONS=1`).

## ۴. اتصال دامنه در aaPanel

### روش A — Reverse Proxy (پیشنهادی)

1. در aaPanel → **Website** → **Add site** → دامنه را اضافه کنید
2. **SSL** → Let's Encrypt را فعال کنید
3. **Reverse Proxy** → Target URL:
   - اگر `WEB_HTTP_PORT=80`: `http://127.0.0.1:80`
   - اگر `WEB_HTTP_PORT=3080`: `http://127.0.0.1:3080`
4. گزینه **WebSocket** را روشن کنید (برای Octane اختیاری)

### روش B — فقط Caddy داخل Docker

اگر پورت 80/443 آزاد است و می‌خواهید Caddy مستقیم گوش دهد، در `.env`:

```env
WEB_HTTP_PORT=80
WEB_HTTPS_PORT=443
```

سپس DNS را به سرور بزنید. برای TLS خودکار Caddy، `Caddyfile` را برای دامنه واقعی گسترش دهید (فعلاً `:80` بدون TLS است؛ در production معمولاً SSL را aaPanel/Nginx مدیریت می‌کند).

## ۵. به‌روزرسانی

```bash
cd /www/wwwroot/webino/WebinoDashboard
git pull
docker compose -f docker-compose.aapanel.yml up -d --build
docker compose -f docker-compose.aapanel.yml exec backend php artisan migrate --force
```

## ۶. عیب‌یابی

| مشکل | راه‌حل |
|------|--------|
| فرانت build نمی‌شود | `packages/webina-ui` در مسیر `../packages/webina-ui` باشد |
| 502 از پروکسی | `docker compose logs backend frontend web` |
| خطای دیتابیس | `POSTGRES_PASSWORD` در `.env` و `backend/.env` هماهنگ باشد |
| کوکی لاگین کار نمی‌کند | `SANCTUM_STATEFUL_DOMAINS` و `APP_URL` با دامنه واقعی |

## سرویس‌ها

| سرویس | نقش | پورت داخلی |
|--------|-----|------------|
| `web` | Caddy reverse proxy | 80 → host |
| `frontend` | Next.js SSR | 3000 |
| `backend` | Laravel Octane (FrankenPHP) | 8080 |
| `worker` | Queue | — |
| `scheduler` | Cron | — |
| `db` | PostgreSQL 15 | 5432 |
| `redis` | Cache/Session/Queue | 6379 |

## تست محلی قبل از deploy

```bash
# Backend tests (PHPUnit)
docker run --rm -v "$(pwd)/backend:/var/www/html" -w /var/www/html \
  $(docker build -q -f docker/php/Dockerfile.platform .) php artisan test

# Frontend typecheck + build
cd frontend && npm ci && npx tsc --noEmit && npm run build
```
