<?php

namespace App\Services\Modules;

use App\Models\DashboardModule;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Services\Webino\WebinoLicenseClient;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;

/**
 * Install metadata; optional shallow git clone; accounting bundle copy from Webino tree when licensed.
 */
class ModuleGitInstaller
{
    public function install(int $tenantId, string $slug): TenantModule
    {
        /** @var DashboardModule|null $def */
        $def = DashboardModule::query()->find($slug);
        if (! $def) {
            abort(404, 'Unknown module');
        }

        /** @var TenantModule $row */
        $row = TenantModule::query()->firstOrCreate(
            ['tenant_id' => $tenantId, 'module_slug' => $slug],
            ['enabled' => false, 'licensed' => false]
        );

        $row->installed_version = $def->default_version ?? 'bundled';
        $row->synced_at = now();
        $row->save();

        if (filter_var(config('modules.git.enabled'), FILTER_VALIDATE_BOOLEAN)
            && is_string($def->git_repo)
            && $def->git_repo !== '') {
            $cloneUrl = $def->git_repo;
            if (filter_var(config('modules.git.crm_clone_auth'), FILTER_VALIDATE_BOOLEAN)) {
                $tenant = Tenant::query()->find($tenantId);
                if ($tenant && is_string($tenant->domain) && $tenant->domain !== '') {
                    $fromCrm = app(WebinoLicenseClient::class)->moduleCloneUrl(
                        $tenant->domain,
                        $tenant->license_key,
                        $slug
                    );
                    if (is_string($fromCrm) && $fromCrm !== '') {
                        $cloneUrl = $fromCrm;
                    }
                }
            }
            $this->maybeGitClone($tenantId, $slug, $cloneUrl);
        }

        if ($slug === 'accounting') {
            $this->maybeCopyAccountingBundle($tenantId);
        }

        return $row;
    }

    protected function maybeGitClone(int $tenantId, string $slug, string $repo): void
    {
        $target = storage_path('app/module-repos/'.$tenantId.'/'.$slug);
        if (is_dir($target)) {
            return;
        }

        @mkdir(dirname($target), 0755, true);

        $result = Process::timeout((int) config('modules.git.timeout', 120))->run([
            'git', 'clone', '--depth', '1', $repo, $target,
        ]);

        if (! $result->successful()) {
            Log::warning('module.git.clone_failed', [
                'slug' => $slug,
                'tenant_id' => $tenantId,
                'stderr' => $result->errorOutput(),
            ]);
        }
    }

    protected function maybeCopyAccountingBundle(int $tenantId): void
    {
        $tm = TenantModule::query()
            ->where('tenant_id', $tenantId)
            ->where('module_slug', 'accounting')
            ->first();

        $licensed = $tm?->licensed ?? false;
        $allow = (bool) config('accounting.allow_unlicensed_install');

        if (! $licensed && ! $allow) {
            return;
        }

        $src = config('accounting.source_path');
        if (! is_string($src) || $src === '' || ! is_dir($src)) {
            return;
        }

        $dest = storage_path('app/bundles/accounting');
        if (is_dir($dest) && count(array_diff(scandir($dest) ?: [], ['.', '..'])) > 0) {
            return;
        }

        if (! File::isDirectory(dirname($dest))) {
            File::makeDirectory(dirname($dest), 0755, true);
        }
        File::copyDirectory($src, $dest);
    }
}
