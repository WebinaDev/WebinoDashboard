#!/bin/sh
# Start php-fpm (worker pool, env passed through) + nginx on :8080 in the foreground.
# Pool sizing comes ONLY from env at container start:
#   PHP_FPM_MAX_CHILDREN (default 8), PHP_FPM_START_SERVERS, PHP_FPM_MIN_SPARE,
#   PHP_FPM_MAX_SPARE, PHP_FPM_MAX_REQUESTS (defaults derived from max_children).
set -e
int() { case "$1" in ''|*[!0-9]*) echo "$2" ;; *) [ "$1" -gt 0 ] && echo "$1" || echo "$2" ;; esac; }

CHILDREN=$(int "${PHP_FPM_MAX_CHILDREN:-}" 8)
d_min=$((CHILDREN / 4)); [ "$d_min" -ge 1 ] || d_min=1
d_max=$((CHILDREN / 2)); [ "$d_max" -gt "$d_min" ] || d_max=$((d_min + 1))
MIN_SPARE=$(int "${PHP_FPM_MIN_SPARE:-}" "$d_min")
MAX_SPARE=$(int "${PHP_FPM_MAX_SPARE:-}" "$d_max")
[ "$MAX_SPARE" -le "$CHILDREN" ] || MAX_SPARE=$CHILDREN
[ "$MIN_SPARE" -lt "$MAX_SPARE" ] || MIN_SPARE=$((MAX_SPARE > 1 ? MAX_SPARE - 1 : 1))
[ "$MAX_SPARE" -gt "$MIN_SPARE" ] || MAX_SPARE=$((MIN_SPARE + 1))
[ "$CHILDREN" -ge "$MAX_SPARE" ] || CHILDREN=$MAX_SPARE
START=$(int "${PHP_FPM_START_SERVERS:-}" $(( (MIN_SPARE + MAX_SPARE) / 2 )))
[ "$START" -ge "$MIN_SPARE" ] || START=$MIN_SPARE
[ "$START" -le "$MAX_SPARE" ] || START=$MAX_SPARE
MAX_REQUESTS=$(int "${PHP_FPM_MAX_REQUESTS:-}" 500)

D=/usr/local/etc/php-fpm.d
# Strip pool sizing from the image's stock pool files (www.conf ships pm.max_children = 5) so only ours applies.
for f in "$D"/*.conf; do
  [ -f "$f" ] && sed -i -E '/^[[:space:]]*(pm|pm\.[a-z_]+)[[:space:]]*=/d' "$f"
done
rm -f "$D/zz-webino.conf"
cat > "$D/zzz-webino.conf" <<CONF
[global]
error_log = /proc/self/fd/2
daemonize = yes
[www]
listen = 127.0.0.1:9000
pm = dynamic
pm.max_children = ${CHILDREN}
pm.start_servers = ${START}
pm.min_spare_servers = ${MIN_SPARE}
pm.max_spare_servers = ${MAX_SPARE}
pm.max_requests = ${MAX_REQUESTS}
clear_env = no
catch_workers_output = yes
decorate_workers_output = no
request_terminate_timeout = 300
CONF
echo "[webino] php-fpm pool: max_children=${CHILDREN} start=${START} min_spare=${MIN_SPARE} max_spare=${MAX_SPARE} max_requests=${MAX_REQUESTS}"
php-fpm -D
exec nginx -c /etc/nginx/webino-backend.conf -g 'daemon off;'
