<?php

namespace App\Services\Marketplace;

use App\Services\Marketplace\Adapters\BasalamAdapter;
use App\Services\Marketplace\Adapters\DigikalaAdapter;
use App\Services\Marketplace\Adapters\EmallsAdapter;
use App\Services\Marketplace\Adapters\SnapppaySearchAdapter;
use App\Services\Marketplace\Adapters\SnappshopAdapter;
use App\Services\Marketplace\Adapters\TapsishopAdapter;
use App\Services\Marketplace\Adapters\TechnolifeAdapter;
use App\Services\Marketplace\Adapters\TorobAdapter;
use App\Services\Marketplace\Adapters\ZarehbinAdapter;
use InvalidArgumentException;

final class MarketplaceAdapterRegistry
{
    /** @var array<string, class-string<MarketplaceAdapter>> */
    public const ADAPTERS = [
        'basalam' => BasalamAdapter::class,
        'digikala' => DigikalaAdapter::class,
        'snappshop' => SnappshopAdapter::class,
        'tapsishop' => TapsishopAdapter::class,
        'technolife' => TechnolifeAdapter::class,
        'emalls' => EmallsAdapter::class,
        'torob' => TorobAdapter::class,
        'zarehbin' => ZarehbinAdapter::class,
        'snapppay-search' => SnapppaySearchAdapter::class,
    ];

    public static function make(string $platform, int $tenantId): MarketplaceAdapter
    {
        $class = self::ADAPTERS[$platform] ?? null;
        if (! $class) {
            throw new InvalidArgumentException("Unknown marketplace platform [{$platform}]");
        }

        return app()->make($class, ['tenantId' => $tenantId]);
    }
}
