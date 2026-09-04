<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Kernel\TenantActivationService;
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
    public function bootstrap(Request $request, WebinoLicenseClient $client, ModuleGitInstaller $installer, ProvisionContentSeeder $contentSeeder, TenantActivationService $activations): \Illuminate\Http\JsonResponse
    {
        $this->assertProvisionAuth($request);

        $data = $request->validate([
            'seed' => ['required', 'array'],
        ]);

        $seed = $data['seed'];

        $tenant = Tenant::query()->first();
        if (! $tenant) {
            $name = (string) ($seed['tenant_name'] ?? 'Site');
            $slug = Str::slug((string) ($seed['slug'] ?? $name));
            if ($slug === '') {
                $slug = 'site';
            }

            $tenant = Tenant::query()->create([
                'name' => $name,
                'slug' => $slug,
                'domain' => $seed['domain'] ?? null,
                'setup_completed' => false,
            ]);
        }

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

        $siteType = $seed['site_type_slug'] ?? $seed['business_type_slug'] ?? null;
        if (is_string($siteType) && $siteType !== '') {
            try {
                $activations->applySiteType($tenant, $siteType);
            } catch (\Throwable) {
                /* fallback to license sync */
            }
        } elseif (filled($tenant->license_key)) {
            $this->syncEntitlements($tenant, $client, $installer, $activations);
        }

        if (filled($seed['admin_email'] ?? null)) {
            $hasExplicitPassword = filled($seed['admin_password'] ?? null);
            User::query()->updateOrCreate(
                ['email' => (string) $seed['admin_email']],
                [
                    'name' => (string) ($seed['admin_name'] ?? 'Admin'),
                    'password' => Hash::make((string) ($seed['admin_password'] ?? Str::random(12))),
                    'password_must_change' => ! $hasExplicitPassword,
                    'tenant_id' => $tenant->id,
                    'role' => 'admin',
                ]
            );
        }

        return response()->json(['data' => ['ok' => true, 'tenant_id' => $tenant->id]]);
    }

    public function admin(Request $request): \Illuminate\Http\JsonResponse
    {
        $this->assertProvisionAuth($request);

        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'password' => ['nullable', 'string', 'min:8', 'max:255'],
        ]);

        $tenant = Tenant::query()->firstOrFail();
        $user = User::query()
            ->where('tenant_id', $tenant->id)
            ->where('role', 'admin')
            ->orderBy('id')
            ->first();

        if (! $user) {
            $user = User::query()->where('tenant_id', $tenant->id)->orderBy('id')->first();
        }

        if (! $user) {
            if (empty($data['email'])) {
                return response()->json(['message' => __('api.unauthorized')], 422);
            }
            $user = User::query()->create([
                'name' => (string) ($data['name'] ?? 'Admin'),
                'email' => (string) $data['email'],
                'password' => Hash::make((string) ($data['password'] ?? Str::random(16))),
                'password_must_change' => empty($data['password']),
                'tenant_id' => $tenant->id,
                'role' => 'admin',
                'is_active' => true,
            ]);
        } else {
            if (! empty($data['name'])) {
                $user->name = $data['name'];
            }
            if (! empty($data['email'])) {
                $user->email = $data['email'];
            }
            if (! empty($data['password'])) {
                $user->password = Hash::make($data['password']);
                $user->password_must_change = false;
            }
            $user->save();
        }

        return response()->json([
            'data' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
            ],
        ]);
    }

    public function branding(Request $request): \Illuminate\Http\JsonResponse
    {
        $this->assertProvisionAuth($request);

        $data = $request->validate([
            'logo_url' => ['nullable', 'string', 'max:2048'],
            'domain' => ['nullable', 'string', 'max:255'],
            'site_name' => ['nullable', 'string', 'max:255'],
        ]);

        $tenant = Tenant::query()->firstOrFail();
        $branding = is_array($tenant->branding) ? $tenant->branding : [];
        if (! empty($data['logo_url'])) {
            $branding['logo_url'] = $data['logo_url'];
        }
        $tenant->branding = $branding;
        if (! empty($data['domain'])) {
            $tenant->domain = $data['domain'];
        }
        if (! empty($data['site_name'])) {
            $tenant->name = $data['site_name'];
            $tenant->store_display_name = $data['site_name'];
        }
        $tenant->save();

        return response()->json(['data' => ['ok' => true, 'tenant_id' => $tenant->id]]);
    }

    public function installModule(Request $request, ModuleGitInstaller $installer): \Illuminate\Http\JsonResponse
    {
        $this->assertProvisionAuth($request);

        $data = $request->validate([
            'slug' => ['required', 'string', 'max:64'],
        ]);

        $tenant = Tenant::query()->firstOrFail();
        DashboardModule::query()->firstOrCreate(['slug' => $data['slug']]);
        TenantModule::query()->updateOrCreate(
            ['tenant_id' => $tenant->id, 'module_slug' => $data['slug']],
            ['enabled' => true, 'licensed' => true, 'synced_at' => now()]
        );

        try {
            $row = $installer->install($tenant->id, $data['slug']);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'data' => ['slug' => $data['slug'], 'licensed' => true],
            ], 422);
        }

        return response()->json(['data' => $row]);
    }

    public function licenseSync(Request $request, WebinoLicenseClient $client, ModuleGitInstaller $installer, TenantActivationService $activations): \Illuminate\Http\JsonResponse
    {
        $this->assertProvisionAuth($request);

        $tenant = Tenant::query()->firstOrFail();
        $this->syncEntitlements($tenant, $client, $installer, $activations);
        $activations->clearCache($tenant->id);

        return response()->json(['data' => ['ok' => true]]);
    }

    protected function assertProvisionAuth(Request $request): void
    {
        $token = (string) $request->header('X-Provision-Token', '');
        $expected = (string) env('TENANT_PROVISION_TOKEN', '');
        if ($expected === '' || ! hash_equals($expected, $token)) {
            throw new \Illuminate\Http\Exceptions\HttpResponseException(
                response()->json(['message' => __('api.invalid_provision_token')], 403)
            );
        }

        $secret = (string) config('services.webino.provision_hmac_secret', '');
        if ($secret === '') {
            throw new \Illuminate\Http\Exceptions\HttpResponseException(
                response()->json(['message' => __('api.hmac_secret_missing')], 503)
            );
        }
        $sig = (string) $request->header('X-Provision-Signature', '');
        $body = $request->getContent();
        if ($sig === '' || ! hash_equals(hash_hmac('sha256', $body, $secret), $sig)) {
            throw new \Illuminate\Http\Exceptions\HttpResponseException(
                response()->json(['message' => __('api.invalid_signature')], 403)
            );
        }
    }

    /** Escape a value for a single .env line (ERP parity). */
    protected function envLine(string $key, string $value): string
    {
        $escaped = str_replace(['\\', "\n", '"'], ['\\\\', '\\n', '\\"'], $value);

        return $key.'="'.$escaped.'"';
    }

    protected function syncEntitlements(Tenant $tenant, WebinoLicenseClient $client, ModuleGitInstaller $installer, ?TenantActivationService $activations = null): void
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
            'site_type_slug' => data_get($crm, 'data.site_type') ?? data_get($crm, 'data.business_type') ?? $tenant->site_type_slug,
            'theme_preset' => data_get($crm, 'data.theme_preset') ?? $tenant->theme_preset,
            'nav_preset' => data_get($crm, 'data.nav_preset') ?? $tenant->nav_preset,
        ]);

        $siteType = $tenant->site_type_slug ?? $tenant->business_type_slug;
        if ($activations && is_string($siteType) && $siteType !== '') {
            try {
                $activations->applySiteType($tenant->fresh(), $siteType);
            } catch (\Throwable) {
                /* keep license-based enables */
            }
        }
    }
}
