<?php

namespace App\Services\Modules;

use App\Models\ModuleSetting;
use Illuminate\Support\Facades\Cache;

final class ModuleSettingsService
{
    /** @return array<string, mixed> */
    public function get(int $tenantId, string $moduleSlug, string $submoduleSlug, array $defaults = []): array
    {
        $cacheKey = "module_settings:{$tenantId}:{$moduleSlug}.{$submoduleSlug}";

        return Cache::remember($cacheKey, 60, function () use ($tenantId, $moduleSlug, $submoduleSlug, $defaults) {
            $row = ModuleSetting::query()
                ->where('tenant_id', $tenantId)
                ->where('module_slug', $moduleSlug)
                ->where('submodule_slug', $submoduleSlug)
                ->first();

            if (! $row || ! is_array($row->payload)) {
                return $defaults;
            }

            return array_merge($defaults, $row->payload);
        });
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
        ];
    }

    public static function cafeHoursDefaults(): array
    {
        return [
            'timezone' => 'Asia/Tehran',
            'days' => [],
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
