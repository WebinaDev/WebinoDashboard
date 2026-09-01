<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Kernel\ThemeCatalog;
use App\Models\Tenant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class ThemeController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        /** @var Tenant $tenant */
        $tenant = $request->user()->tenant;
        $siteType = $tenant->site_type_slug ?? $tenant->business_type_slug;

        return response()->json([
            'data' => [
                'site_type_slug' => $siteType,
                'active_theme_slug' => $tenant->active_theme_slug,
                'branding' => ThemeCatalog::normalizeBranding($tenant->branding),
                'themes' => ThemeCatalog::forSiteType($siteType),
                'accents' => ThemeCatalog::ACCENTS,
                'fonts' => ThemeCatalog::FONTS,
            ],
        ])->header('Cache-Control', 'private, max-age=30');
    }

    public function activate(Request $request, string $slug): \Illuminate\Http\JsonResponse
    {
        /** @var Tenant $tenant */
        $tenant = $request->user()->tenant;
        $siteType = $tenant->site_type_slug ?? $tenant->business_type_slug;

        if (! ThemeCatalog::isAllowedForSiteType($slug, $siteType)) {
            return response()->json(['message' => __('api.theme_not_allowed')], 422);
        }

        $tenant->active_theme_slug = $slug;
        $tenant->save();

        $this->bustTenantCache($tenant);

        return response()->json([
            'data' => [
                'active_theme_slug' => $tenant->active_theme_slug,
                'branding' => ThemeCatalog::normalizeBranding($tenant->branding),
            ],
        ]);
    }

    public function updateBranding(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'reset' => ['sometimes', 'boolean'],
            'logo_url' => ['nullable', 'string', 'max:2048'],
            'logo_dark_url' => ['nullable', 'string', 'max:2048'],
            'favicon_url' => ['nullable', 'string', 'max:2048'],
            'accent' => ['nullable', 'string', 'in:'.implode(',', ThemeCatalog::ACCENTS)],
            'font' => ['nullable', 'string', 'in:'.implode(',', ThemeCatalog::FONTS)],
        ]);

        /** @var Tenant $tenant */
        $tenant = $request->user()->tenant;

        if (! empty($data['reset'])) {
            $tenant->branding = ThemeCatalog::defaultBranding();
        } else {
            $current = ThemeCatalog::normalizeBranding($tenant->branding);
            $merged = $current;
            foreach (['logo_url', 'logo_dark_url', 'favicon_url', 'accent', 'font'] as $key) {
                if (array_key_exists($key, $data)) {
                    $value = $data[$key];
                    $merged[$key] = is_string($value) && $value === '' ? null : $value;
                }
            }
            $tenant->branding = ThemeCatalog::normalizeBranding($merged);
        }

        $tenant->save();
        $this->bustTenantCache($tenant);

        return response()->json([
            'data' => [
                'branding' => ThemeCatalog::normalizeBranding($tenant->branding),
            ],
        ]);
    }

    private function bustTenantCache(Tenant $tenant): void
    {
        Cache::forget('modules:tenant:'.$tenant->id);
        Cache::forget('kernel:tenant:'.$tenant->id.':activations');
    }
}
