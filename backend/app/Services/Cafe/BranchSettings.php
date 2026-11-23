<?php

namespace App\Services\Cafe;

use App\Services\Modules\ModuleSettingsService;

/**
 * The multi-branch switchboard, stored in `cafe.branches` module settings.
 *
 * The owner's answers are the defaults here: shared catalogue, per-branch stock, and an
 * offline sale that is recorded rather than refused. The screen exists so they can be
 * changed later without a deploy, and so an admin can see which mode the shop is in.
 */
final class BranchSettings
{
    public const MODULE = 'cafe';

    public const SUBMODULE = 'branches';

    /** Catalogue is shared; a branch may still override a price. */
    public const PRICING_SHARED = 'shared_with_overrides';

    /** Each branch keeps its own stock figure. */
    public const STOCK_PER_BRANCH = 'per_branch';

    /** A sale always wins; the branch goes negative and is flagged. */
    public const OFFLINE_ALLOW_NEGATIVE = 'allow_negative';

    public function __construct(private readonly ModuleSettingsService $settings) {}

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            'enabled' => true,
            'pricing_mode' => self::PRICING_SHARED,
            'stock_mode' => self::STOCK_PER_BRANCH,
            'offline_sales' => self::OFFLINE_ALLOW_NEGATIVE,
            // Prompt for a branch at the till when the tenant has more than one. With a
            // single branch the till can skip the question entirely.
            'require_branch_selection' => true,
            // Keep a settled sale even when stock cannot cover it, and surface it in the
            // shortfall report. Turning this off makes the till strict instead.
            'flag_oversold' => true,
            'require_station_for_kds' => false,
        ];
    }

    /** @return array<string, mixed> */
    public function get(int $tenantId): array
    {
        $stored = $this->settings->get($tenantId, self::MODULE, self::SUBMODULE, self::defaults());

        return array_merge(self::defaults(), is_array($stored) ? $stored : []);
    }

    /** @param  array<string, mixed>  $payload */
    public function put(int $tenantId, array $payload): array
    {
        return $this->settings->put($tenantId, self::MODULE, self::SUBMODULE, $payload);
    }

    public function allowsNegativeStock(int $tenantId): bool
    {
        return ($this->get($tenantId)['offline_sales'] ?? self::OFFLINE_ALLOW_NEGATIVE) === self::OFFLINE_ALLOW_NEGATIVE;
    }

    public function stocksPerBranch(int $tenantId): bool
    {
        return ($this->get($tenantId)['stock_mode'] ?? self::STOCK_PER_BRANCH) === self::STOCK_PER_BRANCH;
    }
}
