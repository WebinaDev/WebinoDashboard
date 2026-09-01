<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DashboardModule;
use App\Models\Submodule;
use App\Models\TenantModule;
use App\Models\TenantSubmoduleActivation;
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

            $subRows = TenantSubmoduleActivation::query()
                ->where('tenant_id', $tenantId)
                ->get()
                ->groupBy('module_slug');

            $subDefs = Submodule::query()->get()->groupBy('module_slug');

            return $defs->map(function (DashboardModule $def) use ($rows, $subRows, $subDefs) {
                /** @var TenantModule|null $tm */
                $tm = $rows->get($def->slug);
                $subs = ($subDefs->get($def->slug) ?? collect())->map(function (Submodule $sub) use ($subRows, $def) {
                    $activation = ($subRows->get($def->slug) ?? collect())
                        ->firstWhere('submodule_slug', $sub->slug);

                    return [
                        'slug' => $sub->slug,
                        'name_fa' => $sub->name_fa,
                        'name_en' => $sub->name_en,
                        'enabled' => $activation?->enabled ?? false,
                        'is_core' => $sub->is_core,
                    ];
                })->values();

                return [
                    'slug' => $def->slug,
                    'requires_license' => $def->requires_license,
                    'git_repo' => $def->git_repo,
                    'enabled' => $tm?->enabled ?? false,
                    'licensed' => $tm?->licensed ?? false,
                    'installed_version' => $tm?->installed_version,
                    'submodules' => $subs,
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

        if ($slug === 'core') {
            return response()->json(['message' => __('api.module_disabled')], 422);
        }

        /** @var TenantModule $tm */
        $tm = TenantModule::query()->firstOrCreate(
            ['tenant_id' => $tenantId, 'module_slug' => $slug],
            ['enabled' => false, 'licensed' => false]
        );

        if ($data['enabled'] && $def->requires_license && ! $tm->licensed) {
            return response()->json([
                'message' => __('api.module_not_licensed'),
                'slug' => $slug,
            ], 422);
        }

        $tm->enabled = $data['enabled'];
        $tm->save();

        Cache::forget("modules:tenant:{$tenantId}");
        Cache::forget("kernel:tenant:{$tenantId}:activations");

        return response()->json(['data' => $tm]);
    }
}
