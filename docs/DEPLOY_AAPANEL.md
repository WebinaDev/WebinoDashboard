# استقرار WebinoDashboard روی aaPanel (Docker)

این سند برای **یک سایت / یک استک** است (`docker-compose.aapanel.yml` با سرویس `web` روی پورت ۸۰/۴۴۳).

اگر چند مشتری جدا (دیتابیس و پوشهٔ ایزوله) روی یک سرور می‌خواهید، از [`DEPLOY_MULTI_CLIENT.md`](./DEPLOY_MULTI_CLIENT.md) و `deploy/hosting/` استفاده کنید — نه پورت `web` داخل هر استک.

## اینستالر تک‌خطی

```bash
WEBINO_DOMAIN=shop.example.com \
  bash <(curl -fsSL https://raw.githubusercontent.com/WebinaDev/WebinoDashboard/main/bootstrap.sh)
```

اسکریپت Docker را نصب می‌کند (اگر نباشد)، ریپو را در `/www/wwwroot/WebinoDashboard` می‌گذارد، `.env` می‌سازد و استک را بالا می‌آورد.

اگر پورت 80 اشغال باشد (Nginx aaPanel)، Docker روی **3080** bind می‌شود. بعد در aaPanel پروکسی معکوس بزنید.

---

## پیش‌نیازها

- Ubuntu 22/24 (یا Debian) با حداقل 2GB RAM
- دامنه با DNS به IP سرور
- در aaPanel: **Docker** و **Docker Manager** نصب باشد (اگر نصب نباشد اینستالر تلاش می‌کند Docker را بگذارد)

## اینستالر چه می‌کند

1. کلون/دانلود [WebinaDev/WebinoDashboard](https://github.com/WebinaDev/WebinoDashboard)
2. ساخت `/.env` (Postgres) و `backend/.env` (APP_KEY، دامنه)
3. `docker compose -f docker-compose.aapanel.yml up -d --build`

متغیرهای اختیاری:

| متغیر | پیش‌فرض |
|--------|---------|
| `WEBINO_DOMAIN` | `localhost` |
| `WEBINO_HTTP_PORT` | `80` یا `3080` اگر 80 اشغال باشد |
| `WEBINO_HTTPS_PORT` | `3443` |
| `WEBINO_INSTALL_DIR` | `/www/wwwroot/WebinoDashboard` روی aaPanel |
| `WEBINO_BRANCH` | `main` |

## اتصال دامنه در aaPanel

1. **Website** → **Add site** → دامنه
2. **SSL** → Let's Encrypt
3. **Reverse Proxy** → Target URL: `http://127.0.0.1:3080` (یا پورتی که اینستالر چاپ کرده)
4. **WebSocket** را روشن کنید

## به‌روزرسانی

**نصب با git:**

```bash
cd /www/wwwroot/WebinoDashboard
git pull
docker compose -f docker-compose.aapanel.yml up -d --build
docker compose -f docker-compose.aapanel.yml exec backend php artisan migrate --force
```

**نصب با tarball / اینستالر (بدون `.git`) — یک خط:**

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/WebinaDev/WebinoDashboard/main/scripts/update.sh)
```

یا دستی:

```bash
bash /www/wwwroot/WebinoDashboard/scripts/update.sh
```

اسکریپت آخرین نسخه را از GitHub دانلود می‌کند، `.env` و `backend/.env` را نگه می‌دارد، rebuild می‌کند و migration اجرا می‌کند.

یا دوباره همان one-liner نصب را اجرا کنید (روی checkout موجود، فقط استک را دوباره بالا می‌آورد — **کد را آپدیت نمی‌کند**).

## عیب‌یابی

| مشکل | راه‌حل |
|------|--------|
| 502 از پروکسی | `docker compose -f docker-compose.aapanel.yml logs -f` |
| کوکی لاگین کار نمی‌کند | `SANCTUM_STATEFUL_DOMAINS` و `APP_URL` با دامنه واقعی |
| پورت 80 اشغال | `WEBINO_HTTP_PORT=3080` و reverse proxy |

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
