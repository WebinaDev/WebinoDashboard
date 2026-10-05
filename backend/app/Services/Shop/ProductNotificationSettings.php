<?php

namespace App\Services\Shop;

use App\Services\Modules\ModuleSettingsService;

final class ProductNotificationSettings
{
    public const MODULE = 'shop';

    public const KEY = 'product_notifications';

    public function __construct(protected ModuleSettingsService $settings) {}

    /** @return array<string, mixed> */
    public function defaults(): array
    {
        return [
            'back_in_stock_enabled' => true,
            'on_sale_enabled' => true,
            'channel_email' => true,
            'channel_sms' => false,
            'from_name' => '',
            'sms_template_back_in_stock' => '',
            'sms_template_on_sale' => '',
        ];
    }

    /** @return array<string, mixed> */
    public function get(int $tenantId): array
    {
        $stored = $this->settings->get($tenantId, self::MODULE, self::KEY, []);

        return array_merge($this->defaults(), is_array($stored) ? $stored : []);
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function save(int $tenantId, array $input): array
    {
        $current = $this->get($tenantId);
        foreach ($this->defaults() as $key => $default) {
            if (! array_key_exists($key, $input)) {
                continue;
            }
            $value = $input[$key];
            if (is_bool($default)) {
                $current[$key] = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? (bool) $value;
            } else {
                $current[$key] = is_scalar($value) ? mb_substr((string) $value, 0, 500) : $default;
            }
        }
        $this->settings->put($tenantId, self::MODULE, self::KEY, $current);

        return $this->get($tenantId);
    }
}
