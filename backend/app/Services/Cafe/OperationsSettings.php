<?php

namespace App\Services\Cafe;

use App\Services\Modules\ModuleSettingsService;

/**
 * Operational defaults for the workbench, POS, KDS and delivery.
 *
 * Kept in one place so the seven feature PRs read the same numbers instead of each
 * hard-coding its own copy. Everything here is editable from the settings screen.
 */
final class OperationsSettings
{
    public const MODULE = 'cafe';

    public const SUBMODULE = 'operations';

    public function __construct(private readonly ModuleSettingsService $settings) {}

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            // How long a paid order stays editable before it freezes (requirement #3.7).
            'paid_edit_window_minutes' => 30,
            // A paid edit always needs a manager; the window only decides when it closes.
            'paid_edit_requires_approval' => true,
            // Kitchen overtime thresholds, in minutes from the order being accepted.
            'kds_warn_after_minutes' => 10,
            'kds_late_after_minutes' => 20,
            // Workbench: what counts as an overdue table.
            'table_overdue_after_minutes' => 90,
            // A ticket with no one working it for this long is surfaced first.
            'queue_stale_after_minutes' => 8,
            // Delivery: block an order under the zone minimum rather than silently accepting it.
            'enforce_delivery_minimum' => true,
            'default_delivery_eta_minutes' => 35,
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

    public function int(int $tenantId, string $key): int
    {
        return max(0, (int) ($this->get($tenantId)[$key] ?? self::defaults()[$key] ?? 0));
    }

    public function bool(int $tenantId, string $key): bool
    {
        return (bool) ($this->get($tenantId)[$key] ?? self::defaults()[$key] ?? false);
    }

    /** How long a paid order may still be amended. Zero means "never after payment". */
    public function paidEditWindowMinutes(int $tenantId): int
    {
        return $this->int($tenantId, 'paid_edit_window_minutes');
    }
}
