<?php

namespace App\Console\Commands;

use App\Models\DashboardModule;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Models\User;
use App\Services\Modules\ModuleGitInstaller;
use App\Services\Provision\ProvisionContentSeeder;
use App\Services\Webino\WebinoLicenseClient;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class ProvisionBootstrapCommand extends Command
{
    protected $signature = 'webino:provision-bootstrap {--force : Run even if tenant already configured}';

    protected $description = 'Apply TENANT_SEED_JSON and license from provisioning env';

    public function handle(WebinoLicenseClient $licenseClient, ModuleGitInstaller $installer, ProvisionContentSeeder $contentSeeder): int
    {
        $seedJson = env('TENANT_SEED_JSON');
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
        $contentSeeder->seed($tenant, $seed);

        $licenseKey = env('TENANT_LICENSE_KEY') ?: ($seed['license_key'] ?? null);
        if (filled($licenseKey)) {
            $tenant->license_key = $licenseKey;
        }
        if (filled(env('TENANT_PROVISION_TOKEN'))) {
            $tenant->provision_token = env('TENANT_PROVISION_TOKEN');
        }
        $tenant->save();

        if (filled($tenant->license_key)) {
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
        $tenant->fill([
            'name' => $seed['tenant_name'] ?? $tenant->name,
            'store_display_name' => $seed['store_display_name'] ?? $tenant->store_display_name,
            'default_currency' => $seed['default_currency'] ?? $tenant->default_currency ?? 'IRR',
            'domain' => $seed['domain'] ?? $tenant->domain,
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
    }

    protected function syncLicense(Tenant $tenant, WebinoLicenseClient $client, ModuleGitInstaller $installer): void
    {
        try {
            $crm = $client->check($tenant->domain ?: 'localhost', $tenant->license_key);
        } catch (\Throwable $e) {
            $this->warn('License sync skipped: '.$e->getMessage());

            return;
        }

        if (data_get($crm, 'data.status') !== 'valid') {
            $this->warn('License not valid yet.');

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
                /* optional git install */
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
        $password = (string) ($seed['admin_password'] ?? Str::random(12));

        User::query()->updateOrCreate(
            ['email' => $email],
            [
                'name' => (string) ($seed['admin_name'] ?? 'Admin'),
                'password' => Hash::make($password),
                'tenant_id' => $tenant->id,
                'role' => 'admin',
            ]
        );
    }
}
