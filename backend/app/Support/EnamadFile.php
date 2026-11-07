<?php

namespace App\Support;

use Illuminate\Http\Response;

/** Empty public root file used by eNamad domain verification (for example 4534534.txt). */
final class EnamadFile
{
    public static function normalize(mixed $raw): string
    {
        $value = strtolower(trim((string) $raw));
        if (str_ends_with($value, '.txt')) {
            $value = substr($value, 0, -4);
        }

        return preg_match('/^[0-9]{1,64}$/', $value) === 1 ? $value : '';
    }

    public static function response(string $saved, string $requested): Response
    {
        $saved = self::normalize($saved);
        $requested = self::normalize($requested);
        $headers = ['Content-Type' => 'text/plain; charset=UTF-8'];
        if ($saved === '' || $requested === '' || ! hash_equals($saved, $requested)) {
            return response('', 404, $headers);
        }

        return response('', 200, $headers + ['Cache-Control' => 'public, max-age=60']);
    }

    /**
     * Keep only the eNamad/Samandehi-style anchor+img markup admins paste into settings.
     * Strips scripts, handlers, and non-http(s) URLs. Caps length for storage.
     */
    public static function sanitizeHtml(string $raw): string
    {
        $raw = trim($raw);
        if ($raw === '') {
            return '';
        }
        $raw = mb_substr($raw, 0, 4000);
        $allowed = '<a><img><span><div>';
        $html = strip_tags($raw, $allowed);
        // Drop inline event handlers and javascript: URLs.
        $html = preg_replace('/\son[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html) ?? '';
        $html = preg_replace('/\s(href|src)\s*=\s*("|\')\s*javascript:[^"\']*\2/i', '', $html) ?? '';

        return trim($html);
    }
}
