<?php

namespace App\Services\Modules;

use App\Kernel\ModuleDiscovery;
use App\Models\DashboardModule;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Services\Webino\WebinoLicenseClient;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use RuntimeException;

/**
 * Hybrid installer: bundled modules are metadata-only; git modules clone into modules-external.
 */
class ModuleGitInstaller
{
    public function __construct(
        private readonly ModuleDiscovery $discovery,
    ) {}

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

        $isGit = ($def->distribution ?? 'bundled') === 'git' || $def->requires_license;

        if ($isGit) {
            $this->assertLicensed($tenantId, $slug, $row);
            $version = $this->installFromGit($tenantId, $slug, $def);
            $row->installed_version = $version;
            $row->licensed = true;
        } else {
            $row->installed_version = $def->default_version ?? 'bundled';
        }

        $row->synced_at = now();
        $row->save();

        if ($slug === 'accounting') {
            $this->maybeCopyAccountingBundle($tenantId);
        }

        return $row->fresh();
    }

    /** @return array{slug: string, distribution: string, installed: bool, external: bool, version: ?string, path: ?string, licensed: bool, enabled: bool} */
    public function status(int $tenantId, string $slug): array
    {
        $def = DashboardModule::query()->find($slug);
        $tm = TenantModule::query()
            ->where('tenant_id', $tenantId)
            ->where('module_slug', $slug)
            ->first();

        $external = $this->discovery->isInstalledExternally($slug);
        $present = $this->discovery->codePresent($slug);

        return [
            'slug' => $slug,
            'distribution' => $def->distribution ?? 'bundled',
            'installed' => $present && ($tm?->installed_version !== null),
            'external' => $external,
            'version' => $tm?->installed_version,
            'path' => $present ? $this->discovery->pathFor($slug) : null,
            'licensed' => (bool) ($tm?->licensed ?? false),
            'enabled' => (bool) ($tm?->enabled ?? false),
        ];
    }

    protected function assertLicensed(int $tenantId, string $slug, TenantModule $row): void
    {
        if ($row->licensed) {
            return;
        }

        $tenant = Tenant::query()->find($tenantId);
        if (! $tenant || ! is_string($tenant->domain) || $tenant->domain === '') {
            throw new RuntimeException('Tenant domain required for license check');
        }

        try {
            $crm = app(WebinoLicenseClient::class)->check($tenant->domain, $tenant->license_key);
        } catch (\Throwable $e) {
            throw new RuntimeException('License check failed: '.$e->getMessage(), 0, $e);
        }

        $licensed = data_get($crm, 'data.licensed_modules', data_get($crm, 'licensed_modules', []));
        if (! is_array($licensed) || ! in_array($slug, $licensed, true)) {
            abort(403, 'Module not licensed: '.$slug);
        }

        $row->licensed = true;
        $row->save();

        $gitRepos = data_get($crm, 'data.module_git_repos', data_get($crm, 'module_git_repos'));
        if (is_array($gitRepos) && isset($gitRepos[$slug]) && is_string($gitRepos[$slug])) {
            DashboardModule::query()->where('slug', $slug)->update(['git_repo' => $gitRepos[$slug]]);
        }
    }

    protected function installFromGit(int $tenantId, string $slug, DashboardModule $def): string
    {
        if (! filter_var(config('modules.git.enabled'), FILTER_VALIDATE_BOOLEAN)) {
            // Dev fallback: allow bundled copy when git disabled.
            if ($this->discovery->codePresent($slug)) {
                return $def->default_version ?? 'bundled';
            }
            throw new RuntimeException('MODULE_GIT_ENABLED is false and module code is missing');
        }

        $cloneUrl = is_string($def->git_repo) ? $def->git_repo : '';
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

        if ($cloneUrl === '') {
            // Transition: if already present in monorepo, treat as installed.
            if ($this->discovery->codePresent($slug)) {
                return $def->default_version ?? 'bundled';
            }
            throw new RuntimeException('No git_repo / clone URL for module '.$slug);
        }

        $this->assertAllowedHost($cloneUrl);

        $target = $this->discovery->externalPathFor($slug);
        $this->gitCloneOrPull($slug, $cloneUrl, $target);
        $this->normalizeExternalLayout($target, $slug);
        $this->runModuleMigrations($target);
        $this->syncFrontendExternal($target, $slug);
        $this->writeFrontendRegistry();

        return $this->detectVersion($target) ?? ($def->default_version ?? 'git');
    }

    protected function assertAllowedHost(string $url): void
    {
        $allowed = config('modules.git.allowed_hosts', []);
        if (! is_array($allowed) || $allowed === []) {
            return;
        }
        // Strip credentials for host parse
        $clean = preg_replace('#^(https?://)([^/@]+@)#', '$1', $url) ?? $url;
        $host = parse_url($clean, PHP_URL_HOST);
        if (! is_string($host) || $host === '') {
            throw new RuntimeException('Invalid clone URL host');
        }
        if (! in_array(strtolower($host), array_map('strtolower', $allowed), true)) {
            // Also allow hosts that look like self-hosted gitea/gitlab if explicitly configured via env.
            throw new RuntimeException('Clone host not allowed: '.$host);
        }
    }

    protected function gitCloneOrPull(string $slug, string $repo, string $target): void
    {
        @mkdir(dirname($target), 0755, true);

        if (is_dir($target.'/.git')) {
            $result = Process::timeout((int) config('modules.git.timeout', 120))
                ->path($target)
                ->run(['git', 'pull', '--ff-only']);
            if (! $result->successful()) {
                Log::warning('module.git.pull_failed', [
                    'slug' => $slug,
                    'stderr' => $result->errorOutput(),
                ]);
            }

            return;
        }

        if (is_dir($target)) {
            File::deleteDirectory($target);
        }

        $result = Process::timeout((int) config('modules.git.timeout', 120))->run([
            'git', 'clone', '--depth', '1', $repo, $target,
        ]);

        if (! $result->successful()) {
            Log::error('module.git.clone_failed', [
                'slug' => $slug,
                'stderr' => $result->errorOutput(),
            ]);
            throw new RuntimeException('Git clone failed for '.$slug.': '.$result->errorOutput());
        }
    }

    /**
     * Normalize layouts:
     * - flat: manifest.json + ServiceProvider at root
     * - nested: backend/ + frontend/
     */
    protected function normalizeExternalLayout(string $target, string $slug): void
    {
        $nestedBackend = $target.'/backend';
        if (is_dir($nestedBackend) && ! is_file($target.'/manifest.json') && is_file($nestedBackend.'/manifest.json')) {
            // Promote backend contents into Modules\{Slug} expected root while keeping frontend beside.
            // Keep as-is; discovery already supports backend/manifest.json.
            return;
        }

        if (! is_file($target.'/manifest.json') && is_file($target.'/module.json')) {
            File::copy($target.'/module.json', $target.'/manifest.json');
        }
    }

    protected function runModuleMigrations(string $target): void
    {
        $paths = [
            $target.'/database/migrations',
            $target.'/backend/database/migrations',
            $target.'/Database/Migrations',
            $target.'/backend/Database/Migrations',
        ];
        foreach ($paths as $path) {
            if (! is_dir($path)) {
                continue;
            }
            try {
                Artisan::call('migrate', [
                    '--path' => $path,
                    '--realpath' => true,
                    '--force' => true,
                ]);
            } catch (\Throwable $e) {
                Log::warning('module.migrate_failed', ['path' => $path, 'error' => $e->getMessage()]);
            }
        }
    }

    protected function syncFrontendExternal(string $target, string $slug): void
    {
        $frontendSrc = is_dir($target.'/frontend') ? $target.'/frontend' : null;
        if (! $frontendSrc) {
            return;
        }

        $destRoot = $this->frontendExternalRoot();
        $dest = $destRoot.'/'.$slug;
        if (! File::isDirectory($destRoot)) {
            File::makeDirectory($destRoot, 0755, true);
        }
        if (is_dir($dest)) {
            File::deleteDirectory($dest);
        }
        File::copyDirectory($frontendSrc, $dest);
    }

    protected function writeFrontendRegistry(): void
    {
        $destRoot = $this->frontendExternalRoot();
        if (! File::isDirectory($destRoot)) {
            File::makeDirectory($destRoot, 0755, true);
        }

        $entries = [];
        foreach (File::directories($destRoot) as $dir) {
            $slug = basename($dir);
            if ($slug === '.' || $slug === '..') {
                continue;
            }
            $manifestTs = $dir.'/manifest.ts';
            $manifestJson = $dir.'/manifest.json';
            $entries[] = [
                'slug' => $slug,
                'has_manifest_ts' => is_file($manifestTs),
                'has_manifest_json' => is_file($manifestJson),
                'path' => 'modules-external/'.$slug,
            ];
        }

        File::put(
            $destRoot.'/.registry.json',
            json_encode(['modules' => $entries, 'generated_at' => now()->toIso8601String()], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }

    protected function frontendExternalRoot(): string
    {
        $configured = config('modules.paths.frontend_external');
        if (is_string($configured) && $configured !== '') {
            return base_path($configured);
        }

        // backend/ is typically sibling of frontend/
        return dirname(base_path()).'/frontend/modules-external';
    }

    protected function detectVersion(string $target): ?string
    {
        $manifest = is_file($target.'/manifest.json')
            ? $target.'/manifest.json'
            : (is_file($target.'/backend/manifest.json') ? $target.'/backend/manifest.json' : null);
        if ($manifest) {
            $data = json_decode(File::get($manifest), true);
            if (is_array($data) && isset($data['version']) && is_string($data['version'])) {
                return $data['version'];
            }
        }

        $result = Process::path($target)->run(['git', 'rev-parse', '--short', 'HEAD']);
        if ($result->successful()) {
            return trim($result->output());
        }

        return null;
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
