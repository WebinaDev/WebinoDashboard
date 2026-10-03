<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DashboardModule;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Services\Webino\WebinoMarketplaceClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class ModuleMarketplaceController extends Controller
{
    public function catalog(Request $request, WebinoMarketplaceClient $client): JsonResponse
    {
        $tenant = Tenant::query()->findOrFail($request->user()->tenant_id);
        try {
            $res = $client->catalog(
                $tenant->domain ?: $request->getHost(),
                config('services.webino.product', 'webinodashboard'),
                $request->boolean('include_core')
            );
        } catch (Throwable $e) {
            return response()->json([
                'ok' => false,
                'unavailable' => true,
                'message' => $e->getMessage(),
                'data' => ['modules' => [], 'categories' => []],
            ], 200);
        }

        if (! $res['ok']) {
            return response()->json([
                'ok' => false,
                'unavailable' => true,
                'message' => $res['message'] ?? 'ERP marketplace unavailable',
                'data' => ['modules' => [], 'categories' => []],
            ], 200);
        }

        $payload = is_array($res['data']) ? ($res['data']['data'] ?? $res['data']) : [];

        return response()->json(['ok' => true, 'data' => $payload]);
    }

    public function purchase(Request $request, WebinoMarketplaceClient $client): JsonResponse
    {
        $tenant = Tenant::query()->findOrFail($request->user()->tenant_id);
        if (! filled($tenant->domain)) {
            return response()->json(['message' => 'Site domain required for marketplace purchase'], 422);
        }

        $data = $request->validate([
            'module_slug' => 'nullable|string|max:64',
            'module_id' => 'nullable|integer',
            'callback_url' => 'nullable|url',
        ]);

        if (empty($data['module_slug']) && empty($data['module_id'])) {
            return response()->json(['message' => 'module_slug or module_id required'], 422);
        }

        // Client mark_paid / pay are never forwarded. This action only opens a payment session.
        $callback = $data['callback_url'] ?? url('/dashboard/modules/payment-callback');
        $forward = array_filter([
            'module_slug' => $data['module_slug'] ?? null,
            'module_id' => $data['module_id'] ?? null,
            'callback_url' => $callback,
            'pay' => true,
        ], fn ($value) => $value !== null);
        $res = $client->purchase(
            $tenant->domain ?: $request->getHost(),
            $forward,
            config('services.webino.product', 'webinodashboard')
        );

        if (! $res['ok']) {
            return response()->json([
                'message' => $res['message'] ?? 'Purchase failed',
                'unavailable' => true,
            ], $res['status'] >= 400 && $res['status'] < 600 ? $res['status'] : 502);
        }

        $payload = is_array($res['data']) ? ($res['data']['data'] ?? $res['data']) : [];

        // If ERP granted immediately, mark local TenantModule licensed.
        $slug = $data['module_slug'] ?? data_get($payload, 'order.items.0.module_slug');
        $license = data_get($payload, 'license');
        if (is_string($slug) && $slug !== '' && is_array($license) && $license !== []) {
            TenantModule::query()->updateOrCreate(
                ['tenant_id' => $tenant->id, 'module_slug' => $slug],
                ['licensed' => true]
            );
            $git = data_get($payload, 'license.meta.module_repos');
            // also try module_git_repos shape
            if (is_array($git)) {
                foreach ($git as $entry) {
                    if (is_array($entry) && ($entry['slug'] ?? null) === $slug && ! empty($entry['repo_url'])) {
                        DashboardModule::query()->where('slug', $slug)->update(['git_repo' => $entry['repo_url']]);
                    }
                }
            }
        }

        return response()->json(['ok' => true, 'data' => $payload], 201);
    }

    public function paymentCallback(Request $request, WebinoMarketplaceClient $client): JsonResponse
    {
        $res = $client->paymentCallback($request->except(['mark_paid', 'pay']));
        if (! $res['ok']) {
            return response()->json([
                'message' => $res['message'] ?? 'Callback failed',
                'unavailable' => true,
            ], $res['status'] >= 400 ? $res['status'] : 502);
        }

        $payload = is_array($res['data']) ? ($res['data']['data'] ?? $res['data']) : [];
        $slug = data_get($payload, 'order.items.0.module_slug');
        $license = data_get($payload, 'license');
        if (is_string($slug) && $slug !== '' && is_array($license) && $license !== []) {
            $tenantId = $request->user()?->tenant_id;
            if ($tenantId) {
                TenantModule::query()->updateOrCreate(
                    ['tenant_id' => $tenantId, 'module_slug' => $slug],
                    ['licensed' => true]
                );
            }
        }

        return response()->json(['ok' => true, 'data' => $payload]);
    }
}
