FROM php:8.3-cli-bookworm

ARG REDIS_PECL_VERSION=6.0.2

COPY docker/php/install-redis.sh /tmp/install-redis.sh

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        $PHPIZE_DEPS \
        git unzip libzip-dev libpq-dev libxml2-dev libsqlite3-dev \
        libbrotli-dev curl \
    && docker-php-ext-install dom xml zip pdo_sqlite opcache pcntl \
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
