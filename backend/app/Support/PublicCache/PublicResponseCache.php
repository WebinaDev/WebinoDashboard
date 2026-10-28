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
            FrontendRevalidator::schedule();
        }
    }

    /**
     * High-churn models written by ordinary visitor traffic (analytics hits, carts, sessions, logs, orders...).
     * They never change public catalog/builder output, and bumping on them emptied the cache (and fired a
     * frontend revalidate) on practically every page view.
     */
    private const VOLATILE = '/(Log|Logs|SecurityEvent|LinkHubEvent|AnalyticsEvent|Hit|Hits|Visit|PageView|Session|Cart|CartItem|Analytics|Metric|Metrics|Token|Otp|Attempt|Notification|Job|Order|OrderItem|Payment|Transaction|Audit|Activity|Snapshot|Stat|Stats|Alert|Subscriber|Lead|Message|Webhook|Sync|Usage|Heartbeat|Queue|Import|Export|Report)$/';

    public static function isVolatile(Model $model): bool
    {
        if (preg_match(self::VOLATILE, class_basename($model))) {
            return true;
        }
        // Only timestamp churn (touch()) is not a content change.
        $changed = array_diff(array_keys($model->getChanges()), [$model->getUpdatedAtColumn() ?? 'updated_at', 'last_seen_at', 'last_used_at', 'views', 'view_count', 'hits']);

        return $model->wasRecentlyCreated === false && $model->exists && $model->getChanges() !== [] && $changed === [];
    }

    public static function register(): void
    {
        $handler = static function (string $event, array $payload): void {
            $model = $payload[0] ?? null;
            if (! $model instanceof Model || self::isVolatile($model)) {
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
