# Dev / base PHP tooling image only (no app code, default CMD is php -a).
# Tenant production images MUST be built from Dockerfile.platform:
#   docker build -t webino-backend:beta -f docker/php/Dockerfile.platform .
# See also WebinoERP/scripts/build-webino-dashboard-images.sh
FROM php:8.3-cli-bookworm

ARG REDIS_PECL_VERSION=6.0.2

COPY docker/php/install-redis.sh /tmp/install-redis.sh

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        $PHPIZE_DEPS \
        git unzip libzip-dev libpq-dev libxml2-dev libsqlite3-dev \
        libbrotli-dev curl \
        libjpeg62-turbo-dev libpng-dev libwebp-dev libfreetype6-dev \
    && docker-php-ext-configure gd --with-jpeg --with-webp --with-freetype \
    && docker-php-ext-install dom xml zip pdo_sqlite opcache pcntl gd \
    && chmod +x /tmp/install-redis.sh \
    && REDIS_PECL_VERSION="$REDIS_PECL_VERSION" /tmp/install-redis.sh \
    && rm -f /tmp/install-redis.sh \
    && docker-php-ext-enable redis opcache \
    && rm -rf /var/lib/apt/lists/*

RUN echo "opcache.enable=1" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.memory_consumption=256" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.max_accelerated_files=20000" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.validate_timestamps=0" >> /usr/local/etc/php/conf.d/opcache.ini

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY --from=dunglas/frankenphp:1-php8.3-bookworm /usr/local/bin/frankenphp /usr/local/bin/frankenphp

WORKDIR /var/www/html
