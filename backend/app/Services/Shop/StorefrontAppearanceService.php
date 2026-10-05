<?php

namespace App\Services\Shop;

use App\Services\Modules\ModuleSettingsService;

final class StorefrontAppearanceService
{
    public const MODULE = 'shop';

    public const KEY = 'storefront_appearance';

    public function __construct(protected ModuleSettingsService $settings) {}

    /** @return array<string, mixed> */
    public function defaults(): array
    {
        return [
            'primary_color' => '#ea580c',
            'accent_color' => '#0f172a',
            'header_style' => 'classic',
            'mega_menu' => true,
            'dark_mode_default' => false,
            'show_top_bar' => true,
            'top_bar_text' => '',
            'product_card_style' => 'classic',
            'pdp_gallery_style' => 'thumbs',
            'sticky_add_to_cart' => true,
            'show_installment_badge' => true,
            'footer_columns' => 4,
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
            } elseif (is_int($default)) {
                $current[$key] = (int) $value;
            } elseif (str_ends_with($key, '_color') && is_string($value)) {
                $v = trim($value);
                if (preg_match('/^#?[0-9a-fA-F]{6}$/', $v)) {
                    $current[$key] = str_starts_with($v, '#') ? strtolower($v) : '#'.strtolower($v);
                }
            } else {
                $current[$key] = is_scalar($value) ? mb_substr(trim((string) $value), 0, 255) : $default;
            }
        }
        $this->settings->put($tenantId, self::MODULE, self::KEY, $current);

        return $this->get($tenantId);
    }
}
