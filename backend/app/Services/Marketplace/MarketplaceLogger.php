<?php

namespace App\Services\Marketplace;

use App\Models\MarketplaceLog;
use Throwable;

class MarketplaceLogger
{
    /** @param  array<string, mixed>  $meta */
    public static function log(int $tenantId, string $platform, string $level, string $channel, string $message, array $meta = []): void
    {
        try {
            MarketplaceLog::query()->create([
                'tenant_id' => $tenantId,
                'platform' => $platform,
                'level' => $level,
                'channel' => $channel,
                'message' => mb_substr($message, 0, 5000),
                'meta' => $meta ?: null,
            ]);
        } catch (Throwable) {
        }
    }

    /** @param  array<string, mixed>  $meta */
    public static function info(int $tenantId, string $platform, string $channel, string $message, array $meta = []): void
    {
        self::log($tenantId, $platform, 'info', $channel, $message, $meta);
    }

    /** @param  array<string, mixed>  $meta */
    public static function warning(int $tenantId, string $platform, string $channel, string $message, array $meta = []): void
    {
        self::log($tenantId, $platform, 'warning', $channel, $message, $meta);
    }

    /** @param  array<string, mixed>  $meta */
    public static function error(int $tenantId, string $platform, string $channel, string $message, array $meta = []): void
    {
        self::log($tenantId, $platform, 'error', $channel, $message, $meta);
    }
}
