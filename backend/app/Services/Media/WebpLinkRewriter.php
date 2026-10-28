<?php

namespace App\Services\Media;

use App\Models\MediaAsset;
use Illuminate\Support\Facades\Cache;

/**
 * Serve-time safety net for WebP: rewrites any reference to a converted original (JPG/PNG kept in
 * original_path) to its WebP path in public JSON payloads, so links missed by media:convert-webp
 * repointing (settings, builder JSON, theme data, poet pages...) still serve WebP. Tenant-scoped,
 * plain + JSON-escaped. On by default; MEDIA_SERVE_WEBP=false disables.
 */
class WebpLinkRewriter
{
    private const TTL = 600;

    public static function rewrite(int $tenantId, string $body): string
    {
        if ($tenantId < 1 || $body === '' || ! config('webino_runtime.serve_webp', true)
            || ! preg_match('/\.(jpe?g|png|gif)/i', $body)) {
            return $body;
        }
        $map = self::map($tenantId);

        return $map === [] ? $body : strtr($body, $map);
    }

    /** @return array<string,string> */
    public static function map(int $tenantId): array
    {
        try {
            return Cache::remember('media:webp-map:'.$tenantId, self::TTL, function () use ($tenantId) {
                $map = [];
                MediaAsset::query()->withoutGlobalScopes()->where('tenant_id', $tenantId)
                    ->whereNotNull('original_path')->where('mime', 'image/webp')
                    ->select(['id', 'path', 'original_path'])
                    ->orderBy('id')->chunkById(1000, function ($rows) use (&$map) {
                        foreach ($rows as $r) {
                            $from = ltrim((string) $r->original_path, '/');
                            $to = ltrim((string) $r->path, '/');
                            if ($from === '' || $to === '' || $from === $to) {
                                continue;
                            }
                            $map[$from] = $to;
                            $map[str_replace('/', '\\/', $from)] = str_replace('/', '\\/', $to);
                        }
                    });

                return $map;
            });
        } catch (\Throwable) {
            return [];
        }
    }

    public static function forget(int $tenantId): void
    {
        try {
            Cache::forget('media:webp-map:'.$tenantId);
        } catch (\Throwable) {
        }
    }
}
