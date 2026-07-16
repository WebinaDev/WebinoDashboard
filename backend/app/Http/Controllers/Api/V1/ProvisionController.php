<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DashboardModule;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Models\User;
use App\Services\Modules\ModuleGitInstaller;
use App\Services\Provision\ProvisionContentSeeder;
use App\Services\Webino\WebinoLicenseClient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class ProvisionController extends Controller
{
    public function bootstrap(Request $request, WebinoLicenseClient $client, ModuleGitInstaller $installer, ProvisionContentSeeder $contentSeeder): \Illuminate\Http\JsonResponse
    {
        $token = (string) $request->header('X-Provision-Token', '');
        $expected = (string) env('TENANT_PROVISION_TOKEN', '');
        if ($expected === '' || ! hash_equals($expected, $token)) {
            return response()->json(['message' => __('api.invalid_provision_token')], 403);
        }

        $secret = (string) config('services.webino.provision_hmac_secret', '');
        if ($secret === '') {
            return response()->json(['message' => __('api.hmac_secret_missing')], 503);
        }
        $sig = (string) $request->header('X-Provision-Signature', '');
        $body = $request->getContent();
        if ($sig === '' || ! hash_equals(hash_hmac('sha256', $body, $secret), $sig)) {
            return response()->json(['message' => __('api.invalid_signature')], 403);
        }

        $data = $request->validate([
            'seed' => ['required', 'array'],
        ]);

        $tenant = Tenant::query()->first();
        if (! $tenant) {
            return response()->json(['message' => __('api.tenant_not_found')], 404);
        }

        $seed = $data['seed'];
        $tenant->fill([
            'name' => $seed['tenant_name'] ?? $tenant->name,
            'store_display_name' => $seed['store_display_name'] ?? $tenant->store_display_name,
            'default_currency' => $seed['default_currency'] ?? $tenant->default_currency ?? 'IRR',
            'domain' => $seed['domain'] ?? $tenant->domain,
            'license_key' => $seed['license_key'] ?? $tenant->license_key ?? env('TENANT_LICENSE_KEY'),
            'business_category_slug' => $seed['business_category_slug'] ?? null,
            'business_type_slug' => $seed['business_type_slug'] ?? null,
            'vertical' => $seed['vertical'] ?? null,
            'package_sku' => $seed['package_sku'] ?? null,
            'theme_preset' => $seed['theme_preset'] ?? null,
            'active_theme_slug' => $seed['active_theme_slug'] ?? $tenant->active_theme_slug,
            'nav_preset' => $seed['nav_preset'] ?? null,
            'branding' => $seed['branding'] ?? null,
            'home_blocks' => $seed['home_blocks'] ?? $tenant->home_blocks,
            'crm_account_id' => $seed['crm_account_id'] ?? null,
            'setup_completed' => false,
        ]);
        $tenant->save();

        $contentSeeder->seed($tenant, $seed);

        if (filled($tenant->license_key)) {
            $this->syncEntitlements($tenant, $client, $installer);
        }

        if (filled($seed['admin_email'] ?? null)) {
            User::query()->updateOrCreate(
                ['email' => (string) $seed['admin_email']],
                [
                    'name' => (string) ($seed['admin_name'] ?? 'Admin'),
                    'password' => Hash::make((string) ($seed['admin_password'] ?? Str::random(12))),
                    'tenant_id' => $tenant->id,
                    'role' => 'admin',
                ]
            );
        }

        return response()->json(['data' => ['ok' => true, 'tenant_id' => $tenant->id]]);
    }

    protected function syncEntitlements(Tenant $tenant, WebinoLicenseClient $client, ModuleGitInstaller $installer): void
    {
        try {
            $crm = $client->check($tenant->domain ?: 'localhost', $tenant->license_key);
        } catch (\Throwable) {
            return;
        }

        if (data_get($crm, 'data.status') !== 'valid') {
            return;
        }

        $moduleSlugs = data_get($crm, 'data.licensed_modules') ?? [];
        foreach ($moduleSlugs as $slug) {
            if (! is_string($slug) || $slug === '') {
                continue;
            }
            DashboardModule::query()->firstOrCreate(['slug' => $slug]);
            TenantModule::query()->updateOrCreate(
                ['tenant_id' => $tenant->id, 'module_slug' => $slug],
                ['enabled' => true, 'licensed' => true, 'synced_at' => now()]
            );
            try {
                $installer->install($tenant->id, $slug);
            } catch (\Throwable) {
                /* optional */
            }
        }

        $tenant->update([
            'vertical' => data_get($crm, 'data.vertical') ?? $tenant->vertical,
            'package_sku' => data_get($crm, 'data.sku') ?? $tenant->package_sku,
            'business_category_slug' => data_get($crm, 'data.business_category') ?? $tenant->business_category_slug,
            'business_type_slug' => data_get($crm, 'data.business_type') ?? $tenant->business_type_slug,
            'theme_preset' => data_get($crm, 'data.theme_preset') ?? $tenant->theme_preset,
            'nav_preset' => data_get($crm, 'data.nav_preset') ?? $tenant->nav_preset,
        ]);
    }
}
