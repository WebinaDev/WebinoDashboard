<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DashboardModule;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Models\TenantSubmoduleActivation;
use App\Services\Webino\WebinoLicenseClient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

class LicenseController extends Controller
{
    public function status(Request $request): \Illuminate\Http\JsonResponse
    {
        $tenant = Tenant::query()->findOrFail($request->user()->tenant_id);

        return response()->json(['data' => $this->payload($tenant)]);
    }

    public function sync(Request $request, WebinoLicenseClient $client): \Illuminate\Http\JsonResponse
    {
        $tenant = Tenant::query()->findOrFail($request->user()->tenant_id);

        try {
            $crm = $client->check(
                $tenant->domain ?: $request->getHost(),
                config('services.webino.product', 'webinodashboard')
            );
        } catch (Throwable $e) {
            $detail = $this->licenseFailureDetail(null, $e);
            Log::warning('dashboard.license_sync_transport', [
                'tenant_id' => $tenant->id,
                'domain' => $tenant->domain,
                'detail' => $detail,
                'exception' => $e->getMessage(),
            ]);
            $tenant->fill([
                'license_unreachable' => true,
                'license_checked_at' => now(),
                'license_last_error' => $detail,
            ])->save();

            return response()->json([
                'message' => __('api.crm_license_check_failed'),
                'data' => $this->payload($tenant->fresh()),
                'errors' => [
                    'detail' => $detail,
                    'code' => 'LICENSE_UNREACHABLE',
                    'erp' => null,
                ],
            ], 502);
        }

        if (data_get($crm, 'error') || (! is_array($crm)) || data_get($crm, 'data') === null) {
            $detail = $this->licenseFailureDetail($crm);
            Log::warning('dashboard.license_sync_soft_fail', [
                'tenant_id' => $tenant->id,
                'domain' => $tenant->domain,
                'detail' => $detail,
                'erp_error' => data_get($crm, 'error'),
            ]);
            $tenant->fill([
                'license_unreachable' => true,
                'license_checked_at' => now(),
                'license_last_error' => $detail,
            ])->save();

            return response()->json([
                'message' => __('api.crm_license_check_failed'),
                'data' => $this->payload($tenant->fresh()),
                'errors' => [
                    'detail' => $detail,
                    'code' => 'LICENSE_UNREACHABLE',
                    'erp' => data_get($crm, 'error.erp_body') ?? data_get($crm, 'error'),
                ],
            ], 502);
        }

        $rawStatus = (string) data_get($crm, 'data.status', '');
        $validFlag = data_get($crm, 'data.valid');
        $allowed = $validFlag === true
            || in_array($rawStatus, ['valid', 'active', 'demo'], true)
            || data_get($crm, 'data.active') === true;
        if (in_array($rawStatus, ['active', 'expired', 'demo', 'invalid'], true)) {
            $status = $rawStatus;
        } elseif ($allowed) {
            $status = data_get($crm, 'data.demo') ? 'demo' : 'active';
        } else {
            $status = $rawStatus !== '' ? $rawStatus : 'invalid';
        }

        $moduleSlugs = data_get($crm, 'data.licensed_modules')
            ?? data_get($crm, 'data.modules')
            ?? data_get($crm, 'data.entitlements');

        if (is_array($moduleSlugs) && count($moduleSlugs) > 0) {
            TenantModule::query()
                ->where('tenant_id', $tenant->id)
                ->whereHas('definition', fn ($q) => $q->where('requires_license', true))
                ->update(['licensed' => false]);

            TenantSubmoduleActivation::query()
                ->where('tenant_id', $tenant->id)
                ->where('module_slug', '!=', 'core')
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

                TenantSubmoduleActivation::query()
                    ->where('tenant_id', $tenant->id)
                    ->where('module_slug', $slug)
                    ->update(['licensed' => true]);
            }
        } elseif ($allowed) {
            TenantModule::query()
                ->where('tenant_id', $tenant->id)
                ->whereHas('definition', fn ($q) => $q->where('requires_license', true))
                ->update(['licensed' => true]);

            TenantSubmoduleActivation::query()
                ->where('tenant_id', $tenant->id)
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
        }

        $tenant->fill([
            'license_status' => $status,
            'license_checked_at' => now(),
            'license_unreachable' => false,
            'license_last_error' => null,
        ])->save();

        $licensedModules = TenantModule::query()
            ->where('tenant_id', $tenant->id)
            ->where('licensed', true)
            ->pluck('module_slug')
            ->values()
            ->all();

        app(\App\Kernel\TenantActivationService::class)->clearCache($tenant->id);

        return response()->json([
            'data' => array_merge($this->payload($tenant->fresh()), [
                'licensed_modules' => $licensedModules,
                'theme_preset' => $tenant->theme_preset,
                'nav_preset' => $tenant->nav_preset,
                'vertical' => $tenant->vertical,
                'package_sku' => $tenant->package_sku,
                'tenant_id' => $tenant->id,
            ]),
        ]);
    }

    /** @return array<string, mixed> */
    private function payload(Tenant $tenant): array
    {
        $status = $tenant->normalizedLicenseStatus();
        $active = $tenant->isLicenseEntitled();
        $demo = $tenant->isLicenseDemo();
        $expired = $status === 'expired';

        return [
            'status' => $status,
            'active' => $active,
            'demo' => $demo,
            'expired' => $expired,
            // Domain is the license identity (no license code).
            'has_domain' => filled($tenant->domain),
            'has_key' => filled($tenant->domain), // BC alias — means domain configured
            'domain' => $tenant->domain,
            'product' => config('services.webino.product', 'webinodashboard'),
            'checked_at' => $tenant->license_checked_at?->toIso8601String(),
            'unreachable' => (bool) $tenant->license_unreachable,
            'last_error' => $this->friendlyLicenseError((string) ($tenant->license_last_error ?? '')),
        ];
    }

    /** Extract the most useful ERP/transport detail for UI + logs. */
    private function licenseFailureDetail(mixed $crm, ?Throwable $e = null): string
    {
        if ($e !== null) {
            $msg = trim($e->getMessage());
            if ($msg !== '') {
                return $this->friendlyLicenseError($msg) ?? $msg;
            }
        }

        $candidates = [
            data_get($crm, 'error.message'),
            data_get($crm, 'errors.detail'),
            data_get($crm, 'message'),
        ];
        foreach ($candidates as $c) {
            if (is_string($c) && trim($c) !== '') {
                return $this->friendlyLicenseError($c) ?? trim($c);
            }
        }

        $status = data_get($crm, 'error.http_status');
        if (is_numeric($status)) {
            return 'ERP license HTTP '.(int) $status;
        }

        return (string) __('api.crm_license_check_failed');
    }

    /** Map legacy English ops errors to Persian soft messages. Never surface HMAC-config as license identity. */
    private function friendlyLicenseError(string $raw): ?string
    {
        $raw = trim($raw);
        if ($raw === '') {
            return null;
        }
        $lower = strtolower($raw);
        if (str_contains($lower, 'hmac') || str_contains($lower, 'signature')) {
            return __('api.crm_license_check_failed');
        }
        if (
            str_contains($lower, 'upstream error')
            || str_contains($lower, 'could not resolve host')
            || str_contains($lower, 'connection refused')
            || str_contains($lower, 'operation timed out')
            || str_contains($lower, 'failed to connect')
            || str_contains($lower, 'cURL error')
        ) {
            return __('api.crm_license_server_unreachable');
        }

        return $raw;
    }
}
