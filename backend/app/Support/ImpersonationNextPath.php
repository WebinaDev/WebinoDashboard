<?php

namespace App\Support;

/**
 * Relative dashboard paths only.
 * Keep the pattern in sync with WebinoERP Modules\SiteBuilder\Support\ImpersonationNextPath.
 */
final class ImpersonationNextPath
{
    public static function normalize(?string $next): string
    {
        $next = trim((string) $next);
        if ($next === '') {
            return '/dashboard';
        }

        $decoded = rawurldecode($next);
        if (! is_string($decoded) || $decoded === '') {
            return '/dashboard';
        }

        if (
            ! str_starts_with($decoded, '/dashboard')
            || str_contains($decoded, '\\')
            || str_contains($decoded, '..')
            || str_contains($decoded, '//')
            || str_contains($decoded, '?')
            || str_contains($decoded, '#')
        ) {
            return '/dashboard';
        }

        if (! preg_match('#^/dashboard(?:/[A-Za-z0-9][A-Za-z0-9_-]{0,64}){0,6}$#', $decoded)) {
            return '/dashboard';
        }

        return $decoded;
    }
}
