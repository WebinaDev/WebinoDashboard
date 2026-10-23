<?php

namespace App\Services\Site;

use App\Services\Modules\ModuleSettingsService;
use Illuminate\Support\Carbon;

/** Site lifecycle status: active | coming_soon | suspended (stored in module_settings settings/site.status). */
final class SiteStatusService
{
    public const STATUSES = ['active', 'coming_soon', 'suspended'];

    public function __construct(private ModuleSettingsService $settings) {}

    /** @return array<string, mixed> */
    public function get(int $tenantId): array
    {
        $row = $this->settings->get($tenantId, 'settings', 'site.status', []);
        $status = in_array($row['status'] ?? null, self::STATUSES, true) ? $row['status'] : 'active';

        return [
            'status' => $status,
            'reason' => $row['reason'] ?? null,
            'expires_at' => $row['expires_at'] ?? null,
            'launch_at' => $row['launch_at'] ?? null,
            'renew_url' => $row['renew_url'] ?? null,
            'support_url' => $row['support_url'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
            'updated_by' => $row['updated_by'] ?? null,
        ];
    }

    /** Contract payload for the platform API (fixed shape). */
    public function contract(array $s): array
    {
        return array_intersect_key($s, array_flip(['status', 'reason', 'expires_at', 'launch_at', 'updated_at', 'updated_by']));
    }

    /** @param array<string, mixed> $changes */
    public function put(int $tenantId, array $changes, string $by): array
    {
        $next = array_merge($this->get($tenantId), $changes, [
            'updated_at' => Carbon::now()->toIso8601String(),
            'updated_by' => $by,
        ]);
        foreach (['expires_at', 'launch_at'] as $k) {
            if (! empty($next[$k])) {
                $next[$k] = Carbon::parse($next[$k])->toIso8601String();
            }
        }
        $this->settings->put($tenantId, 'settings', 'site.status', $next);

        return $this->get($tenantId);
    }
}
