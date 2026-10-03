<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Kernel\TenantActivationService;
use App\Models\Tenant;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class BootstrapController extends Controller
{
    public function show(
        Request $request,
        TenantActivationService $activations,
        ModuleSettingsService $settings,
    ): \Illuminate\Http\JsonResponse {
        $user = $request->user()->load('tenant');
        /** @var Tenant|null $tenant */
        $tenant = $user->tenant;

        $sms = $tenant
            ? $settings->get((int) $tenant->id, 'settings', 'site.sms', [
                'otp_login_enabled' => false,
                'otp_register_enabled' => false,
                'otp_length' => 5,
            ])
            : [];

        $licenseStatus = $tenant ? $tenant->normalizedLicenseStatus() : 'unknown';
        $licenseActive = $tenant ? $tenant->isLicenseEntitled() : false;
        $licenseDemo = $tenant ? $tenant->isLicenseDemo() : false;

        return response()->json([
            'data' => [
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'phone' => $user->phone,
                    'role' => $user->role,
                    'ui_preferences' => $user->ui_preferences,
                    'capabilities' => $this->capabilitiesFor($user->role),
                ],
                'tenant' => $tenant ? [
                    'id' => $tenant->id,
                    'name' => $tenant->name,
                    'slug' => $tenant->slug,
                    'domain' => $tenant->domain,
                    'branding' => $tenant->branding,
                    'default_currency' => $tenant->default_currency,
                    'site_type_slug' => $tenant->site_type_slug,
                    'setup_completed' => (bool) $tenant->setup_completed,
                ] : null,
                'license' => [
                    'status' => $licenseStatus,
                    'active' => $licenseActive,
                    'demo' => $licenseDemo,
                    'checked_at' => $tenant?->license_checked_at?->toIso8601String(),
                    'unreachable' => (bool) ($tenant?->license_unreachable),
                ],
                'activations' => $activations->activationsForTenant((int) $user->tenant_id),
                'otp_auth' => [
                    'login_enabled' => (bool) ($sms['otp_login_enabled'] ?? false),
                    'register_enabled' => (bool) ($sms['otp_register_enabled'] ?? false),
                    'length' => (int) ($sms['otp_length'] ?? 5),
                ],
                'menu_acl' => $this->menuAclFor($user->role),
            ],
        ]);
    }

    /** @return list<array{menu_key: string, allowed: bool}> */
    private function menuAclFor(?string $role): array
    {
        $role = (string) $role;
        if ($role === '' || ! Schema::hasTable('role_menu_acl')) {
            return [];
        }

        return DB::table('role_menu_acl')
            ->where('role', $role)
            ->orderBy('menu_key')
            ->get(['menu_key', 'allowed'])
            ->map(fn ($row) => [
                'menu_key' => (string) $row->menu_key,
                'allowed' => (bool) $row->allowed,
            ])
            ->values()
            ->all();
    }

    /** @return list<string> */
    private function capabilitiesFor(?string $role): array
    {
        $role = (string) $role;
        if ($role === 'admin') {
            return ['*'];
        }

        if (! Schema::hasTable('role_capabilities')) {
            return in_array($role, ['staff', 'shop_manager', 'seller', 'accountant', 'author', 'editor'], true)
                ? ['*']
                : [];
        }

        return DB::table('role_capabilities')
            ->where('role', $role)
            ->pluck('capability')
            ->map(fn ($c) => (string) $c)
            ->values()
            ->all();
    }
}
