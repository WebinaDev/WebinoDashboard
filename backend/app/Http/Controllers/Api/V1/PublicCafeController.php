<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Http\Request;

class PublicCafeController extends Controller
{
    use ResolvesPublicTenant;

    public function venue(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        $tenant = $this->publicTenant($request);
        $tid = $tenant->id;

        return response()->json([
            'data' => [
                'tenant' => [
                    'name' => $tenant->store_display_name ?? $tenant->name,
                    'active_theme_slug' => $tenant->active_theme_slug,
                ],
                'menu' => $settings->get($tid, 'cafe', 'menu', ModuleSettingsService::cafeMenuDefaults()),
                'hours' => $settings->get($tid, 'cafe', 'hours', ModuleSettingsService::cafeHoursDefaults()),
                'gallery' => $settings->get($tid, 'cafe', 'gallery', ModuleSettingsService::cafeGalleryDefaults()),
                'venue' => $settings->get($tid, 'cafe', 'venue', ModuleSettingsService::cafeVenueDefaults()),
            ],
        ])->header('Cache-Control', 'public, max-age=60, s-maxage=120');
    }
}
