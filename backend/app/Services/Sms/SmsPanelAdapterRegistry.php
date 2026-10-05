<?php

namespace App\Services\Sms;

use App\Models\Tenant;
use App\Services\Modules\ModuleSettingsService;

/**
 * Secondary SMS panel adapters (ModirPayamak remains primary via ERP proxy).
 */
class SmsPanelAdapterRegistry
{
    public const MODULE = 'sms_panels';

    public function __construct(
        protected ModuleSettingsService $settings,
        protected KavenegarSmsAdapter $kavenegar,
    ) {}

    /** @return array<string, mixed> */
    public function hub(int $tenantId): array
    {
        $hub = $this->settings->get($tenantId, self::MODULE, 'hub', $this->defaultHub());

        return is_array($hub) ? $hub : $this->defaultHub();
    }

    /** @return array<string, mixed> */
    public function defaultHub(): array
    {
        return [
            'active' => 'modirpayamak',
            'kavenegar' => [
                'enabled' => false,
                'api_key' => '',
                'sender' => '',
                'has_api_key' => false,
            ],
        ];
    }

    /** @param  array<string, mixed>  $payload */
    public function send(Tenant $tenant, array $payload): array
    {
        $hub = $this->hub((int) $tenant->id);
        $active = (string) ($hub['active'] ?? 'modirpayamak');
        if ($active === 'kavenegar' && ! empty($hub['kavenegar']['enabled'])) {
            return $this->kavenegar->send($hub['kavenegar'] ?? [], $payload);
        }

        return ['ok' => false, 'reason' => 'modirpayamak_only'];
    }
}
