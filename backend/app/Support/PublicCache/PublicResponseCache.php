<?php

namespace App\Support\PublicCache;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;

/**
 * Per-tenant versioned cache for anonymous public API GETs (tenant, site-status, builder pages/globals/templates).
 * Any Eloquent write on a tenant-scoped model (or the Tenant itself) bumps that tenant's version, so saves
 * are visible immediately. Store-agnostic (no cache tags needed).
 */
final class PublicResponseCache
{
    public const TTL = 300;

    public const NEGATIVE_TTL = 60;

    public static function version(int $tenantId): string
    {
        return (string) Cache::rememberForever("pubcache:v:{$tenantId}", fn () => (string) microtime(true));
    }

    public static function bump(int $tenantId): void
    {
        if ($tenantId > 0) {
            Cache::forever("pubcache:v:{$tenantId}", (string) microtime(true));
        }
    }

    public static function register(): void
    {
        $handler = static function (string $event, array $payload): void {
            $model = $payload[0] ?? null;
            if (! $model instanceof Model) {
                return;
            }
            try {
                if ($model instanceof \App\Models\Tenant) {
                    self::bump((int) $model->getKey());
                } elseif (($tid = $model->getAttribute('tenant_id')) !== null) {
                    self::bump((int) $tid);
                }
            } catch (\Throwable) {
            }
        };
        Event::listen('eloquent.saved: *', $handler);
        Event::listen('eloquent.deleted: *', $handler);
    }

    /** Replace inline base64 images in a JSON body with stored files (/storage/inline/<sha1>.<ext>). */
    public static function hoistDataUrls(string $json): string
    {
        if (! str_contains($json, 'data:image')) {
            return $json;
        }

        return (string) preg_replace_callback(
            '#data:image\\\\?/(png|jpe?g|webp|gif|avif|svg\+xml);base64,([A-Za-z0-9+=\\\\/]{512,})#',
            static function (array $m): string {
                $bin = base64_decode(str_replace('\\/', '/', $m[2]), true);
                if ($bin === false) {
                    return $m[0];
                }
                $ext = ['jpeg' => 'jpg', 'svg+xml' => 'svg'][$m[1]] ?? $m[1];
                $path = 'inline/'.sha1($bin).'.'.$ext;
                try {
                    $disk = Storage::disk('public');
                    if (! $disk->exists($path)) {
                        $disk->put($path, $bin);
                    }
                } catch (\Throwable) {
                    return $m[0];
                }

                return '\/storage\/'.str_replace('/', '\/', $path);
            },
            $json,
        );
    }
}
