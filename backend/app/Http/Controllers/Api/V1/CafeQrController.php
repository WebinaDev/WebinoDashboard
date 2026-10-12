<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Menu;
use App\Models\Product;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Http\Request;

class CafeQrController extends Controller
{
    public function menuQr(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        $tenant = $request->user()->tenant;
        $saved = trim((string) ($settings->get($request->user()->tenant_id, 'cafe', 'qr', ModuleSettingsService::cafeQrDefaults())['public_base_url'] ?? ''));
        // Auto-detect: saved URL, else the origin the dashboard is open on, else the tenant domain.
        $origin = $request->query('origin');
        $detected = is_string($origin) && preg_match('#^https?://[^/\s?#]+$#i', rtrim($origin, '/')) ? rtrim($origin, '/') : null;
        $baseUrl = $saved !== '' ? $saved : ($detected ?? ($tenant?->domain ? 'https://'.$tenant->domain : ''));
        if ($baseUrl !== '' && ! preg_match('#^https?://#i', $baseUrl)) {
            $baseUrl = 'https://'.$baseUrl;
        }

        $menuSlug = $request->query('menu');
        $branch = $request->query('branch');
        $table = $request->query('table');

        $url = rtrim((string) $baseUrl, '/').'/catalogue';
        $params = [];
        if (is_string($menuSlug) && $menuSlug !== '') {
            $params['menu'] = $menuSlug;
        }
        if (is_string($branch) && $branch !== '') {
            $params['branch'] = $branch;
        }
        if (is_string($table) && $table !== '') {
            $params['table'] = $table;
        }
        if ($params !== []) {
            $url .= '?'.http_build_query($params);
        }

        return response()->json([
            'data' => [
                'url' => $url,
                'qr_svg' => $this->qrSvg($url),
                'type' => $table ? 'table' : 'menu',
            ],
        ]);
    }

    public function updateSettings(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'public_base_url' => ['nullable', 'string', 'max:2048'],
            'default_table_prefix' => ['nullable', 'string', 'max:32'],
        ]);

        $tenantId = $request->user()->tenant_id;
        $merged = array_merge(ModuleSettingsService::cafeQrDefaults(), $data);

        return response()->json([
            'data' => $settings->put($tenantId, 'cafe', 'qr', $merged),
        ]);
    }

    public function showSettings(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        return response()->json([
            'data' => $settings->get($request->user()->tenant_id, 'cafe', 'qr', ModuleSettingsService::cafeQrDefaults()),
        ]);
    }

    private function qrSvg(string $url): string
    {
        $encoded = rawurlencode($url);
        $api = "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={$encoded}";

        return $api;
    }
}
