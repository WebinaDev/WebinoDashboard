<?php

namespace App\Services\Modules;

use App\Models\ModuleSetting;
use Illuminate\Support\Facades\Cache;

final class ModuleSettingsService
{
    /** @return array<string, mixed> */
    public function get(int $tenantId, string $moduleSlug, string $submoduleSlug, array $defaults = []): array
    {
        $cacheKey = self::cacheKey($tenantId, $moduleSlug, $submoduleSlug);

        // Cache only the stored payload: callers pass different defaults for the same key.
        $payload = Cache::remember($cacheKey, 60, function () use ($tenantId, $moduleSlug, $submoduleSlug) {
            $row = ModuleSetting::query()
                ->where('tenant_id', $tenantId)
                ->where('module_slug', $moduleSlug)
                ->where('submodule_slug', $submoduleSlug)
                ->first();

            return $row && is_array($row->payload) ? $row->payload : null;
        });

        return is_array($payload) ? array_merge($defaults, $payload) : $defaults;
    }

    public static function cacheKey(int $tenantId, string $moduleSlug, string $submoduleSlug): string
    {
        return "module_settings:{$tenantId}:{$moduleSlug}.{$submoduleSlug}";
    }

    /** @param  array<string, mixed>  $payload */
    public function put(int $tenantId, string $moduleSlug, string $submoduleSlug, array $payload): array
    {
        $row = ModuleSetting::query()->updateOrCreate(
            [
                'tenant_id' => $tenantId,
                'module_slug' => $moduleSlug,
                'submodule_slug' => $submoduleSlug,
            ],
            ['payload' => $payload]
        );

        Cache::forget("module_settings:{$tenantId}:{$moduleSlug}.{$submoduleSlug}");

        return $row->payload ?? [];
    }

    public static function cafeMenuDefaults(): array
    {
        return [
            'default_view' => 'grid',
            'show_search' => true,
            'show_category_bar' => true,
            'show_new_badge' => true,
            'header_cta_label_fa' => null,
            'header_cta_label_en' => null,
            'header_cta_url' => null,
            'placeholder_logo_text_fa' => null,
            'placeholder_logo_text_en' => null,
            'accent_color' => '#c46b3a',
            'seasonal_theme' => 'none',
            'font_preset' => 'sans',
            'teaser_video_url' => null,
            'packaging_fee_minor' => 0,
            'packaging_fee_mode' => 'per_order',
            'packaging_dine_in' => false,
            'packaging_pickup' => true,
            'packaging_delivery' => true,
            'service_fee_percent' => 0,
            'service_fee_dine_in_only' => true,
            'pay_online_enabled' => true,
            'pay_cash_enabled' => true,
            'delivery_radius_km' => 0,
            'cafe_lat' => null,
            'cafe_lng' => null,
            'delivery_require_pin' => true,
            'pickup_slot_minutes' => 15,
            'dine_in_require_table' => true,
            'delivery_fee_minor' => 0,
            'free_delivery_threshold_minor' => 0,
            'prep_minutes' => 20,
            'max_orders_per_day' => null,
            'block_orders_when_closed' => true,
            'fulfillment_dine_in' => true,
            'fulfillment_pickup' => true,
            'fulfillment_delivery' => false,
        ];
    }

    public static function cafeHoursDefaults(): array
    {
        return [
            'timezone' => 'Asia/Tehran',
            'days' => [],
            'closed_dates' => [],
        ];
    }

    public static function cafeGalleryDefaults(): array
    {
        return [
            'images' => [],
        ];
    }

    public static function cafeVenueDefaults(): array
    {
        return [
            'tagline_fa' => null,
            'tagline_en' => null,
            'about_fa' => null,
            'about_en' => null,
            'phone' => null,
            'instagram' => null,
            'address_fa' => null,
            'address_en' => null,
            'map_url' => null,
            'mini_site_enabled' => true,
            'whatsapp_url' => null,
            'telegram_url' => null,
            'bill_pay_url' => null,
        ];
    }

    public static function cafeEngagementDefaults(): array
    {
        return [
            'phone_gate_enabled' => false,
            'likes_enabled' => true,
            'feedback_enabled' => true,
            'share_whatsapp_enabled' => true,
            'share_telegram_enabled' => true,
        ];
    }

    public static function cafeQrDefaults(): array
    {
        return [
            'public_base_url' => null,
            'default_table_prefix' => 'T',
        ];
    }
}
