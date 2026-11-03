<?php

namespace App\Console\Commands;

use App\Kernel\TenantActivationService;
use App\Models\DashboardModule;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Models\User;
use App\Services\Modules\ModuleGitInstaller;
use App\Services\Provision\SiteTypeDemoSeeder;
use App\Services\Webino\WebinoLicenseClient;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class ProvisionBootstrapCommand extends Command
{
    protected $signature = 'webino:provision-bootstrap {--force : Run even if tenant already configured}';

    protected $description = 'Apply TENANT_SEED_JSON and license from provisioning env';

    public function handle(WebinoLicenseClient $licenseClient, ModuleGitInstaller $installer, SiteTypeDemoSeeder $contentSeeder): int
    {
        $seedJson = config('webino_runtime.tenant_seed_json');
        if (! filled($seedJson)) {
            $this->comment('No TENANT_SEED_JSON — skipping provision bootstrap.');

            return self::SUCCESS;
        }

        $seed = json_decode($seedJson, true);
        if (! is_array($seed)) {
            $this->error('Invalid TENANT_SEED_JSON');

            return self::FAILURE;
        }

        $tenant = Tenant::query()->first();
        if (! $tenant) {
            $this->error('No tenant found.');

            return self::FAILURE;
        }

        if ($tenant->setup_completed && ! $this->option('force')) {
            $this->comment('Tenant setup already completed.');

            return self::SUCCESS;
        }

        $this->applySeed($tenant, $seed);
        $siteType = $seed['site_type_slug'] ?? $seed['business_type_slug'] ?? $tenant->site_type_slug ?? $tenant->business_type_slug;
        // Never force-seed on --force: that flag only re-runs bootstrap metadata/license.
        // Demo content remains gated (new/empty/never-seeded); use setup/import-demo for explicit load.
        $contentSeeder->seed(
            $tenant->fresh(),
            is_string($siteType) ? $siteType : null,
            $seed,
        );

        // Domain is the license identity; ignore legacy TENANT_LICENSE_KEY / seed license_key.
        if (filled($tenant->domain)) {
            $tenant->license_key = $tenant->domain; // deprecated column mirror
        }
        if (filled(config('webino_runtime.tenant_provision_token'))) {
            $tenant->provision_token = config('webino_runtime.tenant_provision_token');
        }
        $tenant->save();

        if (filled($tenant->domain)) {
            $this->syncLicense($tenant, $licenseClient, $installer);
        }

        if (filled($seed['admin_email'])) {
            $this->ensureAdminUser($tenant, $seed);
        }

        $this->info('Provision bootstrap complete.');

        return self::SUCCESS;
    }

    /**
     * @param  array<string, mixed>  $seed
     */
    protected function applySeed(Tenant $tenant, array $seed): void
    {
        $wasCompleted = (bool) $tenant->setup_completed;
        $fill = [
            'name' => $seed['tenant_name'] ?? $tenant->name,
            'store_display_name' => $seed['store_display_name'] ?? $tenant->store_display_name,
            'default_currency' => $seed['default_currency'] ?? $tenant->default_currency ?? 'IRT',
            'domain' => $seed['domain'] ?? $tenant->domain,
            'business_category_slug' => $seed['business_category_slug'] ?? $tenant->business_category_slug,
            'business_type_slug' => $seed['business_type_slug'] ?? $tenant->business_type_slug,
            'site_type_slug' => $seed['site_type_slug'] ?? $seed['business_type_slug'] ?? $tenant->site_type_slug,
            'vertical' => $seed['vertical'] ?? $tenant->vertical,
            'package_sku' => $seed['package_sku'] ?? $tenant->package_sku,
            'theme_preset' => $seed['theme_preset'] ?? $tenant->theme_preset,
            'active_theme_slug' => $seed['active_theme_slug'] ?? $tenant->active_theme_slug,
            'nav_preset' => $seed['nav_preset'] ?? $tenant->nav_preset,
            'home_blocks' => $seed['home_blocks'] ?? $tenant->home_blocks,
            'crm_account_id' => $seed['crm_account_id'] ?? $tenant->crm_account_id,
        ];
        // Never reopen onboarding or wipe branding (incl. demo_seeded_at) on live-site re-bootstrap.
        if (! $wasCompleted) {
            $fill['branding'] = $seed['branding'] ?? $tenant->branding;
            $fill['setup_completed'] = false;
        } elseif (array_key_exists('branding', $seed) && is_array($seed['branding'])) {
            $current = is_array($tenant->branding) ? $tenant->branding : [];
            $fill['branding'] = array_replace($current, $seed['branding']);
        }
        $tenant->fill($fill);
        if (array_key_exists('domain_aliases', $seed) && is_array($seed['domain_aliases'])) {
            $tenant->domain_aliases = array_values(array_filter(array_map('strval', $seed['domain_aliases'])));
        }
        if (filled($seed['alias_subdomain'] ?? null)) {
            $tenant->alias_subdomain = (string) $seed['alias_subdomain'];
        }
        $tenant->save();
    }

    protected function syncLicense(Tenant $tenant, WebinoLicenseClient $client, ModuleGitInstaller $installer): void
    {
        try {
            $crm = $client->check($tenant->domain ?: 'localhost', config('services.webino.product', config('webino_runtime.tenant_product', 'webinodashboard')));
        } catch (\Throwable $e) {
            $this->warn('License sync skipped: '.$e->getMessage());

            return;
        }

        if (data_get($crm, 'data.status') !== 'valid') {
            $this->warn('License not valid yet.');

            return;
        }

        $moduleSlugs = data_get($crm, 'data.licensed_modules') ?? [];
        $slugs = [];
        foreach ($moduleSlugs as $slug) {
            if (is_string($slug) && $slug !== '') {
                $slugs[] = $slug;
            }
        }
        TenantActivationService::ensureDashboardModules($slugs);
        app(TenantActivationService::class)->licenseModules($tenant, $slugs, true);
        foreach ($slugs as $slug) {
            try {
                $installer->install($tenant->id, $slug);
            } catch (\Throwable) {
                /* optional git install */
            }
        }

        $siteType = $tenant->site_type_slug ?? $tenant->business_type_slug ?? data_get($crm, 'data.site_type') ?? data_get($crm, 'data.business_type');
        if (is_string($siteType) && $siteType !== '') {
            try {
                app(TenantActivationService::class)->applySiteType($tenant->fresh(), $siteType);
            } catch (\Throwable) {
                /* keep license-based enables */
            }
        }

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

    /**
     * @param  array<string, mixed>  $seed
     */
    protected function ensureAdminUser(Tenant $tenant, array $seed): void
    {
        $email = (string) $seed['admin_email'];
        $hasExplicitPassword = filled($seed['admin_password'] ?? null);
        $password = (string) ($seed['admin_password'] ?? Str::random(12));

        // tenant_id/role are not mass-assignable on User; assign explicitly (trusted provisioning path).
        $admin = User::query()->updateOrCreate(
            ['email' => $email],
            [
                'name' => (string) ($seed['admin_name'] ?? 'Admin'),
                'password' => Hash::make($password),
                'password_must_change' => ! $hasExplicitPassword,
            ]
        );
        $admin->forceFill(['tenant_id' => $tenant->id, 'role' => 'admin'])->save();
    }
}
