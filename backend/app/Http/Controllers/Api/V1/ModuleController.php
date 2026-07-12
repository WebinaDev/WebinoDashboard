<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DashboardModule;
use App\Models\TenantModule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class ModuleController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tenantId = $request->user()->tenant_id;
        $cacheKey = "modules:tenant:{$tenantId}";

        $data = Cache::remember($cacheKey, 60, function () use ($tenantId) {
            $defs = DashboardModule::query()->orderBy('slug')->get();

            $rows = TenantModule::query()
                ->where('tenant_id', $tenantId)
                ->get()
                ->keyBy('module_slug');

            return $defs->map(function (DashboardModule $def) use ($rows) {
                /** @var TenantModule|null $tm */
                $tm = $rows->get($def->slug);

                return [
                    'slug' => $def->slug,
                    'requires_license' => $def->requires_license,
                    'git_repo' => $def->git_repo,
                    'enabled' => $tm?->enabled ?? false,
                    'licensed' => $tm?->licensed ?? false,
                    'installed_version' => $tm?->installed_version,
                ];
            })->values();
        });

        return response()->json(['data' => $data])
            ->header('Cache-Control', 'private, max-age=30');
    }

    public function update(Request $request, string $slug): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        $tenantId = $request->user()->tenant_id;

        $def = DashboardModule::query()->findOrFail($slug);

        /** @var TenantModule $tm */
        $tm = TenantModule::query()->firstOrCreate(
            ['tenant_id' => $tenantId, 'module_slug' => $slug],
            ['enabled' => false, 'licensed' => false]
        );

        if ($data['enabled'] && $def->requires_license && ! $tm->licensed) {
            return response()->json([
                'message' => 'Module not licensed. Sync CRM license first.',
                'slug' => $slug,
            ], 422);
        }

        $tm->enabled = $data['enabled'];
        $tm->save();

        Cache::forget("modules:tenant:{$tenantId}");

        return response()->json(['data' => $tm]);
    }
}
