<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DashboardModule;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Services\Webino\WebinoLicenseClient;
use Illuminate\Http\Request;
use Throwable;

class LicenseController extends Controller
{
    public function sync(Request $request, WebinoLicenseClient $client): \Illuminate\Http\JsonResponse
    {
        $tenant = Tenant::query()->findOrFail($request->user()->tenant_id);

        try {
            $crm = $client->check(
                $tenant->domain ?: $request->getHost(),
                $tenant->license_key
            );
        } catch (Throwable $e) {
            return response()->json([
                'message' => 'CRM license check failed.',
                'error' => $e->getMessage(),
            ], 502);
        }

        $allowed = data_get($crm, 'data.status') === 'valid';

        $moduleSlugs = data_get($crm, 'data.licensed_modules')
            ?? data_get($crm, 'data.modules')
            ?? data_get($crm, 'data.entitlements');

        if (is_array($moduleSlugs) && count($moduleSlugs) > 0) {
            TenantModule::query()
                ->where('tenant_id', $tenant->id)
                ->whereHas('definition', fn ($q) => $q->where('requires_license', true))
                ->update(['licensed' => false]);

            foreach ($moduleSlugs as $entry) {
                $slug = is_string($entry)
                    ? $entry
                    : data_get($entry, 'slug') ?? data_get($entry, 'module');

                if (! is_string($slug) || $slug === '') {
                    continue;
                }

                TenantModule::query()
                    ->where('tenant_id', $tenant->id)
                    ->where('module_slug', $slug)
                    ->update(['licensed' => true]);
            }
        } elseif ($allowed) {
            TenantModule::query()
                ->where('tenant_id', $tenant->id)
                ->whereHas('definition', fn ($q) => $q->where('requires_license', true))
                ->update(['licensed' => true]);
        }

        $gitRepos = data_get($crm, 'data.module_git_repos');
        if (is_array($gitRepos)) {
            foreach ($gitRepos as $slug => $url) {
                if (is_string($slug) && $slug !== '' && is_string($url) && $url !== '') {
                    DashboardModule::query()->where('slug', $slug)->update(['git_repo' => $url]);
                }
            }
        }

        if ($allowed) {
            $tenant->fill([
                'vertical' => data_get($crm, 'data.vertical') ?? $tenant->vertical,
                'package_sku' => data_get($crm, 'data.sku') ?? $tenant->package_sku,
                'business_category_slug' => data_get($crm, 'data.business_category') ?? $tenant->business_category_slug,
                'business_type_slug' => data_get($crm, 'data.business_type') ?? $tenant->business_type_slug,
                'theme_preset' => data_get($crm, 'data.theme_preset') ?? $tenant->theme_preset,
                'nav_preset' => data_get($crm, 'data.nav_preset') ?? $tenant->nav_preset,
            ]);
            $tenant->save();
        }

        return response()->json([
            'crm' => $crm,
            'tenant_id' => $tenant->id,
        ]);
    }
}
