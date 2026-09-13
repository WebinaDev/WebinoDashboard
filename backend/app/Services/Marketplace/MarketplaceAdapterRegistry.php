<?php

namespace App\Services\Marketplace;

final class MarketplaceAdapterRegistry
{
    /** @var array<string, MarketplaceAdapter> */
    private static array $adapters = [];

    public static function get(string $platform): MarketplaceAdapter
    {
        if (! isset(self::$adapters[$platform])) {
            self::$adapters[$platform] = new NullMarketplaceAdapter($platform);
        }

        return self::$adapters[$platform];
    }

    public static function register(string $platform, MarketplaceAdapter $adapter): void
    {
        self::$adapters[$platform] = $adapter;
    }
}
