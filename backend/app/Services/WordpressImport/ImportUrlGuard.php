<?php

namespace App\Services\WordpressImport;

use InvalidArgumentException;

/**
 * Shape checks for operator-supplied URLs. Probe never opens a connection.
 * Remote media fetch reuses these checks and then pins DNS.
 */
final class ImportUrlGuard
{
    /** @var list<string> */
    private const BLOCKED_HOSTS = [
        'localhost',
        'localhost.localdomain',
        'metadata',
        'metadata.google.internal',
        'metadata.google',
        'instance-data',
        '0.0.0.0',
    ];

    /**
     * @return array{scheme: string, host: string, port: int, path: string}
     */
    public static function parseHttp(string $url): array
    {
        $url = trim($url);
        if ($url === '' || strlen($url) > 2000) {
            throw new InvalidArgumentException('URL is empty or too long.');
        }
        if (preg_match('/[\x00-\x20\x7f]/', $url)) {
            throw new InvalidArgumentException('URL contains illegal characters.');
        }

        $parts = parse_url($url);
        if (! is_array($parts)) {
            throw new InvalidArgumentException('URL could not be parsed.');
        }
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        if (! in_array($scheme, ['http', 'https'], true)) {
            throw new InvalidArgumentException('Only http and https URLs are allowed.');
        }
        if (isset($parts['user']) || isset($parts['pass'])) {
            throw new InvalidArgumentException('URLs must not include credentials.');
        }

        $host = strtolower(trim((string) ($parts['host'] ?? ''), '[]'));
        if ($host === '' || strlen($host) > 253) {
            throw new InvalidArgumentException('URL host is missing.');
        }
        if (self::isBlockedHost($host)) {
            throw new InvalidArgumentException('That host is not allowed.');
        }

        $port = isset($parts['port']) ? (int) $parts['port'] : ($scheme === 'https' ? 443 : 80);
        if ($port < 1 || $port > 65535) {
            throw new InvalidArgumentException('URL port is invalid.');
        }

        $path = (string) ($parts['path'] ?? '');
        if (str_contains($path, '..')) {
            throw new InvalidArgumentException('URL path is invalid.');
        }

        return [
            'scheme' => $scheme,
            'host' => $host,
            'port' => $port,
            'path' => $path,
        ];
    }

    public static function normalizeSource(string $url): string
    {
        $parts = self::parseHttp($url);
        $origin = $parts['scheme'].'://'.$parts['host'];
        $default = $parts['scheme'] === 'https' ? 443 : 80;
        if ($parts['port'] !== $default) {
            $origin .= ':'.$parts['port'];
        }
        if ($parts['path'] !== '' && $parts['path'] !== '/') {
            $origin .= rtrim($parts['path'], '/');
        }

        return $origin;
    }

    public static function isBlockedHost(string $host): bool
    {
        $host = strtolower(trim($host, '.'));
        if ($host === '' || in_array($host, self::BLOCKED_HOSTS, true)) {
            return true;
        }
        foreach (['.local', '.internal', '.localhost', '.localdomain'] as $suffix) {
            if (str_ends_with($host, $suffix)) {
                return true;
            }
        }
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return self::isBlockedIp($host);
        }
        if (! preg_match('/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/', $host)) {
            return true;
        }

        return false;
    }

    public static function isBlockedIp(string $ip): bool
    {
        if (! filter_var($ip, FILTER_VALIDATE_IP)) {
            return true;
        }
        if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return true;
        }

        // Carrier-grade NAT and unspecified addresses are not public targets.
        if (str_contains($ip, ':')) {
            $packed = inet_pton($ip);
            if ($packed === false) {
                return true;
            }
            $first = ord($packed[0]);
            if (($first & 0xFE) === 0xFC || ($first & 0xC0) === 0x80) {
                return true;
            }

            return false;
        }

        $long = ip2long($ip);
        if ($long === false) {
            return true;
        }
        $cgnatStart = ip2long('100.64.0.0');
        $cgnatEnd = ip2long('100.127.255.255');

        return $long >= $cgnatStart && $long <= $cgnatEnd;
    }

    /** @param list<string> $allowedHosts */
    public static function hostAllowed(string $host, array $allowedHosts): bool
    {
        $host = strtolower($host);
        foreach ($allowedHosts as $allowed) {
            $allowed = strtolower(trim($allowed));
            if ($allowed !== '' && $host === $allowed) {
                return true;
            }
        }

        return false;
    }
}
