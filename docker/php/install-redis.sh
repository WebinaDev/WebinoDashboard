#!/bin/sh
# Install phpredis: try PECL first, fall back to GitHub source when pecl.php.net is unreachable.
set -eux

REDIS_PECL_VERSION="${REDIS_PECL_VERSION:-6.0.2}"

install_via_pecl() {
  if pecl install "redis-${REDIS_PECL_VERSION}" 2>/dev/null; then
    return 0
  fi
  if pecl install redis 2>/dev/null; then
    return 0
  fi
  return 1
}

install_via_github() {
  local tmpdir archive srcdir url
  tmpdir=$(mktemp -d)
  archive="${tmpdir}/phpredis.tar.gz"
  srcdir="${tmpdir}/phpredis-${REDIS_PECL_VERSION}"
  url="https://github.com/phpredis/phpredis/archive/refs/tags/${REDIS_PECL_VERSION}.tar.gz"

  curl -fSL "$url" -o "$archive"
  tar -xzf "$archive" -C "$tmpdir"
  cd "$srcdir"
  phpize
  ./configure
  make -j"$(nproc)"
  make install
  cd /
  rm -rf "$tmpdir"
}

if install_via_pecl; then
  exit 0
fi

printf 'PECL redis unavailable — building from GitHub phpredis %s...\n' "$REDIS_PECL_VERSION" >&2
install_via_github
