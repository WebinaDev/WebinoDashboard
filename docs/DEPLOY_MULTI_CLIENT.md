# هاستینگ چندمشتری (استک ایزوله per-client)

برای چند مشتری جدا روی **یک سرور**، از این مدل استفاده کنید — نه `docker-compose.aapanel.yml`.

| مدل | چه وقت |
|-----|--------|
| **تک‌استک** (`DEPLOY_AAPANEL.md`) | یک دامنه / یک نصب (مثلاً lynabakery) |
| **چندمشتری** (این سند) | هر مشتری Postgres، Redis، لایسنس و دیتای خودش |

داخل یک استک هنوز می‌توان چند `Tenant.domain` داشت؛ اینجا ایزولاسیون **سطح سرور** است (پوشه، شبکه، دیتابیس جدا).

## معماری

```
Internet → Caddy سراسری (:80/:443) → {slug}-frontend:3000 / {slug}-backend:8080
                                           ↑ فقط روی شبکه webino-edge
هر مشتری: frontend + backend + worker + scheduler + postgres + redis
          (شبکه خصوصی + data/ روی دیسک)
```

چیدمان روی سرور:

```
/opt/webino/
  template/          # قالب طلایی (از ریپو)
  clients/<slug>/    # .env، backend.env، docker-compose.yml، data/
  proxy/             # Caddy سراسری + Caddyfile تولیدشده
  scripts/           # init-host، new-client، render-proxy
```

کانتینر `web` داخل استک مشتری **نیست**. هیچ پورت هاستی از استک مشتری پابلیش نمی‌شود.

## برآورد منابع

- ایمیج‌ها یک‌بار بیلد می‌شوند؛ هر مشتری فقط کانتینر + volume می‌گیرد.
- هر استک ≈ ۶ کانتینر (بدون Caddy). برآورد خام **۰٫۶–۱٫۵ گیگ RAM** per مشتری.
- **۱۰۰ مشتری** از نظر Docker ممکن است؛ محدودیت واقعی RAM/CPU/دیسک است. برای مقیاس بزرگ ممکن است بعداً Postgres/Redis اشتراکی لازم شود.

## نصب اولیه هاست

پیش‌نیاز: Docker + Compose، دامنهٔ آزاد برای پورت ۸۰/۴۴۳ (Nginx/aaPanel روی ۸۰ نباشد، یا پورت‌ها را در `proxy/docker-compose.yml` عوض کنید).

از ریشهٔ ریپوی WebinoDashboard:

```bash
# اختیاری: مسیر نصب و مسیر کد برای بیلد
export WEBINO_ROOT=/opt/webino
export WEBINO_CODE=/path/to/WebinoDashboard

sudo mkdir -p "$WEBINO_ROOT"
sudo chown "$USER:$USER" "$WEBINO_ROOT"

./deploy/hosting/scripts/init-host.sh
```

`init-host.sh`:

1. قالب، proxy و اسکریپت‌ها را به `$WEBINO_ROOT` کپی می‌کند
2. شبکهٔ `webino-edge` را می‌سازد
3. ایمیج‌های `webino-dashboard-frontend:latest` و `webino-dashboard-backend:latest` را بیلد می‌کند
4. Caddy سراسری را بالا می‌آورد

بدون بیلد / بدون proxy:

```bash
SKIP_BUILD=1 SKIP_PROXY=1 ./deploy/hosting/scripts/init-host.sh
```

## مشتری جدید

```bash
/opt/webino/scripts/new-client.sh acme acme.example.com
```

این کار می‌کند:

- `clients/acme/` با `.env`، `backend.env` (APP_KEY تصادفی)، `data/{db,redis,storage}`
- `COMPOSE_PROJECT_NAME=webino-acme` و `docker compose up -d`
- بازسازی Caddyfile و reload

DNS دامنه را به IP سرور بزنید؛ TLS با Let's Encrypt داخل Caddy صادر می‌شود.

## مدیریت روزمره

```bash
# وضعیت یک مشتری
cd /opt/webino/clients/acme
COMPOSE_PROJECT_NAME=webino-acme docker compose --env-file .env ps
COMPOSE_PROJECT_NAME=webino-acme docker compose --env-file .env logs -f backend

# فقط .env همان مشتری را ادیت کنید؛ قالب و ایمیج مشترک می‌ماند
# بعد از عوض کردن CLIENT_DOMAIN:
/opt/webino/scripts/render-proxy.sh

# به‌روزرسانی ایمیج‌ها (همه مشتری‌ها)
WEBINO_CODE=/path/to/WebinoDashboard SKIP_PROXY=1 /opt/webino/scripts/init-host.sh
# سپس per-client:
cd /opt/webino/clients/acme
COMPOSE_PROJECT_NAME=webino-acme docker compose --env-file .env up -d
COMPOSE_PROJECT_NAME=webino-acme docker compose --env-file .env exec backend php artisan migrate --force
```

## Health checks (`/up`)

Both layers expose an unauthenticated `GET /up` that returns plain `ok` (HTTP 200):

| Target | Path | Use |
|--------|------|-----|
| Next.js frontend | `http://{slug}-frontend:3000/up` | Default for Caddy / edge probes (public path hits frontend via `Caddyfile.fragment`) |
| Laravel backend | `http://{slug}-backend:8080/up` | Container / compose healthchecks against the API process |

Caddy may use either. Prefer frontend `/up` for public URL checks; prefer backend `/up` when probing the Octane container directly. Backend `RUN_MIGRATIONS=1` runs `php artisan migrate --force` on start via `docker/php/entrypoint-platform.sh`.

## تأیید سریع

1. دو مشتری `acme` و `foo` همزمان بالا؛ روی هاست فقط ۸۰/۴۴۳ پراکسی.
2. `acme.com` → فرانت/بک acme؛ `foo.com` → foo؛ `data/db` جدا.
3. ادیت `clients/acme/.env` فقط acme را عوض می‌کند.

## سورس در ریپو

| مسیر | نقش |
|------|-----|
| `deploy/hosting/template/` | `docker-compose.yml` بدون `web`/ports، `.env.example`، `backend.env.example` |
| `deploy/hosting/proxy/` | Caddy سراسری + `Caddyfile.fragment` |
| `deploy/hosting/scripts/` | `init-host.sh`، `new-client.sh`، `render-proxy.sh` |

نصب تک‌سایته aaPanel همچنان با [`DEPLOY_AAPANEL.md`](./DEPLOY_AAPANEL.md) و `docker-compose.aapanel.yml` است.
