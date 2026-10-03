<?php

namespace App\Support;

/**
 * Staff context handed from ERP with a provision HMAC call.
 * The passport stays server-side; publish() is what the browser may see.
 */
final class ImpersonationPayload
{
    /**
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>|null
     */
    public static function sanitize(array $raw): ?array
    {
        $passport = isset($raw['passport']) && is_string($raw['passport']) ? trim($raw['passport']) : '';
        if ($passport === '' || strlen($passport) > 1500) {
            return null;
        }

        $returnUrl = self::returnUrl(isset($raw['return_url']) ? (string) $raw['return_url'] : '');
        $domain = self::host(isset($raw['domain']) ? (string) $raw['domain'] : '');
        $provisionId = (int) ($raw['provision_id'] ?? 0);
        if ($returnUrl === null || $domain === '' || $provisionId < 1) {
            return null;
        }

        $expires = isset($raw['expires_at']) && is_string($raw['expires_at']) ? $raw['expires_at'] : '';
        $expiresTs = strtotime($expires);

        return [
            'staff_id' => max(0, (int) ($raw['staff_id'] ?? 0)),
            'staff_name' => self::text($raw['staff_name'] ?? '', 120),
            'customer_name' => self::text($raw['customer_name'] ?? '', 160),
            'site_name' => self::text($raw['site_name'] ?? '', 160),
            'domain' => $domain,
            'provision_id' => $provisionId,
            'return_url' => $returnUrl,
            'expires_at' => $expiresTs ? gmdate('c', $expiresTs) : null,
            'passport' => $passport,
            'sites' => self::sites($raw['sites'] ?? null, $provisionId),
        ];
    }

    /**
     * @param  array<string, mixed>  $stored
     * @return array<string, mixed>
     */
    public static function publish(array $stored): array
    {
        $public = $stored;
        unset($public['passport']);

        return $public;
    }

    /**
     * @return list<array{provision_id: int, domain: string, name: string, customer_name: string, current: bool}>
     */
    private static function sites(mixed $rows, int $currentId): array
    {
        if (! is_array($rows)) {
            return [];
        }

        $sites = [];
        foreach ($rows as $row) {
            if (! is_array($row) || count($sites) >= 100) {
                break;
            }
            $id = (int) ($row['provision_id'] ?? 0);
            $domain = self::host(isset($row['domain']) ? (string) $row['domain'] : '');
            if ($id < 1 || $domain === '') {
                continue;
            }
            $sites[] = [
                'provision_id' => $id,
                'domain' => $domain,
                'name' => self::text($row['name'] ?? $domain, 160),
                'customer_name' => self::text($row['customer_name'] ?? '', 160),
                'current' => $id === $currentId || ! empty($row['current']),
            ];
        }

        return $sites;
    }

    private static function text(mixed $value, int $max): string
    {
        $text = trim(is_string($value) ? $value : '');
        if ($text === '') {
            return '';
        }

        return mb_substr($text, 0, $max);
    }

    private static function host(string $domain): string
    {
        $domain = trim($domain);
        $domain = preg_replace('#^https?://#i', '', $domain) ?? $domain;
        $host = strtolower(trim(explode('/', $domain)[0] ?? ''));
        if ($host === '' || str_contains($host, ' ') || str_contains($host, '@')) {
            return '';
        }

        return rtrim($host, '.');
    }

    private static function returnUrl(string $url): ?string
    {
        $url = trim($url);
        if (filter_var($url, FILTER_VALIDATE_URL) === false) {
            return null;
        }
        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        if ($scheme === 'https') {
            return $url;
        }
        if ($scheme === 'http' && ! app()->environment('production')) {
            return $url;
        }

        return null;
    }
}
