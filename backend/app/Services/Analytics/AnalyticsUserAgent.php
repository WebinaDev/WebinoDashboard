<?php

namespace App\Services\Analytics;

final class AnalyticsUserAgent
{
    /** @return array{browser: string, os: string, device: string} */
    public static function parse(string $ua): array
    {
        $ua = trim($ua);
        $browser = 'Other';
        if (stripos($ua, 'Edg/') !== false || stripos($ua, 'Edge/') !== false) {
            $browser = 'Edge';
        } elseif (stripos($ua, 'Firefox/') !== false) {
            $browser = 'Firefox';
        } elseif (stripos($ua, 'Chrome/') !== false && stripos($ua, 'Chromium') === false) {
            $browser = 'Chrome';
        } elseif (stripos($ua, 'Safari/') !== false && stripos($ua, 'Chrome/') === false) {
            $browser = 'Safari';
        } elseif (stripos($ua, 'OPR/') !== false || stripos($ua, 'Opera') !== false) {
            $browser = 'Opera';
        }

        $os = 'Other';
        if (stripos($ua, 'Android') !== false) {
            $os = 'Android';
        } elseif (stripos($ua, 'iPhone') !== false || stripos($ua, 'iPad') !== false || stripos($ua, 'iOS') !== false) {
            $os = 'iOS';
        } elseif (stripos($ua, 'Windows') !== false) {
            $os = 'Windows';
        } elseif (stripos($ua, 'Mac OS') !== false || stripos($ua, 'Macintosh') !== false) {
            $os = 'macOS';
        } elseif (stripos($ua, 'Linux') !== false) {
            $os = 'Linux';
        }

        $device = 'Desktop';
        if (stripos($ua, 'Mobile') !== false || stripos($ua, 'iPhone') !== false || stripos($ua, 'Android') !== false) {
            $device = stripos($ua, 'iPad') !== false || stripos($ua, 'Tablet') !== false ? 'Tablet' : 'Mobile';
        } elseif (stripos($ua, 'iPad') !== false || stripos($ua, 'Tablet') !== false) {
            $device = 'Tablet';
        }

        return compact('browser', 'os', 'device');
    }

    public static function isBot(string $ua): bool
    {
        $ua = trim($ua);
        if ($ua === '') {
            return true;
        }

        return (bool) preg_match('/bot|spider|crawl|slurp|mediapartners|facebookexternalhit|preview/i', $ua);
    }
}
