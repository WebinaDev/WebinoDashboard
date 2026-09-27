<?php

namespace App\Services\Analytics;

final class AnalyticsReferrer
{
    private const SEARCH = [
        'google.', 'bing.com', 'yahoo.', 'duckduckgo.com', 'yandex.', 'baidu.com', 'ask.com', 'search.yahoo',
    ];

    private const SOCIAL = [
        'facebook.com', 'fb.com', 'instagram.com', 'twitter.com', 'x.com', 't.co', 'linkedin.com',
        'pinterest.com', 'reddit.com', 'tiktok.com', 'telegram.org', 't.me', 'whatsapp.com',
    ];

    /** @return array{category: string, source: string} */
    public static function categorize(string $referrer, string $siteHost = ''): array
    {
        $referrer = trim($referrer);
        if ($referrer === '') {
            return ['category' => 'direct', 'source' => ''];
        }
        $host = strtolower((string) (parse_url($referrer, PHP_URL_HOST) ?: ''));
        if ($host === '') {
            return ['category' => 'referral', 'source' => mb_substr($referrer, 0, 191)];
        }
        $host = preg_replace('/^www\./', '', $host) ?? $host;
        $siteHost = strtolower(preg_replace('/^www\./', '', $siteHost) ?? $siteHost);
        if ($siteHost !== '' && ($host === $siteHost || str_ends_with($host, '.'.$siteHost))) {
            return ['category' => 'direct', 'source' => ''];
        }
        foreach (self::SEARCH as $needle) {
            if (str_contains($host, $needle)) {
                return ['category' => 'search', 'source' => $host];
            }
        }
        foreach (self::SOCIAL as $needle) {
            if (str_contains($host, $needle)) {
                return ['category' => 'social', 'source' => $host];
            }
        }

        return ['category' => 'referral', 'source' => $host];
    }
}
