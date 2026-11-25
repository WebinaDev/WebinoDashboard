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
                })->values()->all();

                return [
                    'slug' => $def->slug,
                    'distribution' => $def->distribution ?? 'bundled',
                    'requires_license' => $def->requires_license,
                    'git_repo' => $def->git_repo,
                    'enabled' => $tm?->enabled ?? false,
                    'licensed' => $tm?->licensed ?? false,
                    'installed_version' => $tm?->installed_version,
                    'submodules' => $subs,
                ];
            })->values()->all();
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

        // Route middleware reads submodule rows, not this top-level switch, so
        // toggling a module here must flip its submodules too — otherwise the
        // module looks on in this list while its API still answers 403.
        $this->syncSubmodules((int) $tenantId, $slug, (bool) $data['enabled'], (bool) $tm->licensed);

        // A freshly enabled ledger needs a chart and a fiscal year before the
        // first invoice can post. Best-effort, like site-type provisioning.
        if ($data['enabled'] && $slug === 'accounting') {
            try {
                app(\Modules\Accounting\Services\AccountingProvisioningService::class)
                    ->ensureSeededForTenant((int) $tenantId);
            } catch (\Throwable) {
                // The module is on; the operator can seed from Settings.
            }
        }

        Cache::forget("modules:tenant:{$tenantId}");
        Cache::forget("kernel:tenant:{$tenantId}:activations");

        return response()->json(['data' => $tm]);
    }

    /**
     * Mirror the module switch onto its submodule rows.
     *
     * Enabling turns every known submodule on (licensed with the module); disabling
     * turns them off. Rows are upserted so a module whose catalog entry exists but
     * whose activations were never seeded still becomes usable from this screen.
     */
    private function syncSubmodules(int $tenantId, string $slug, bool $enabled, bool $licensed): void
    {
        $subSlugs = Submodule::query()
            ->where('module_slug', $slug)
            ->pluck('slug')
            ->all();

        foreach ($subSlugs as $subSlug) {
            TenantSubmoduleActivation::query()->updateOrCreate(
                ['tenant_id' => $tenantId, 'module_slug' => $slug, 'submodule_slug' => $subSlug],
                ['enabled' => $enabled, 'licensed' => $licensed]
            );
        }
    }
}
