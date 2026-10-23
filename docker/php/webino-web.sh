#!/bin/sh
# Start php-fpm (worker pool, env passed through) + nginx on :8080 in the foreground.
set -e
CHILDREN="${PHP_FPM_MAX_CHILDREN:-24}"
cat > /usr/local/etc/php-fpm.d/zz-webino.conf <<CONF
[global]
error_log = /proc/self/fd/2
daemonize = yes
[www]
listen = 127.0.0.1:9000
pm = dynamic
pm.max_children = ${CHILDREN}
pm.start_servers = ${PHP_FPM_START_SERVERS:-6}
pm.min_spare_servers = ${PHP_FPM_MIN_SPARE:-4}
pm.max_spare_servers = ${PHP_FPM_MAX_SPARE:-12}
pm.max_requests = ${PHP_FPM_MAX_REQUESTS:-1000}
clear_env = no
catch_workers_output = yes
decorate_workers_output = no
request_terminate_timeout = 300
CONF
php-fpm -D
exec nginx -c /etc/nginx/webino-backend.conf -g 'daemon off;'
