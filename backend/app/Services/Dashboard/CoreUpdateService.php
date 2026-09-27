<?php

namespace App\Services\Dashboard;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use ZipArchive;

final class CoreUpdateService
{
    private const CACHE_KEY = 'dashboard:core_update_status';

    private const CACHE_TTL = 900;

    private const LOCK_KEY = 'dashboard:core_update_lock';

    private const MAX_BACKUPS = 5;

    /** @return array<string, mixed> */
    public function cachedStatus(): array
    {
        $current = (string) config('dashboard.version', '0.0.0');
        $cached = Cache::get(self::CACHE_KEY);
        if (is_array($cached)) {
            $cached['version'] = $current;
            $cached['self_update_enabled'] = (bool) config('dashboard.self_update');

            return $cached;
        }

        return [
            'version' => $current,
            'latest_version' => $current,
            'update_available' => false,
            'release_notes' => '',
            'package_available' => false,
            'license_active' => true,
            'unavailable' => true,
            'self_update_enabled' => (bool) config('dashboard.self_update'),
        ];
    }

    /** @return array<string, mixed> */
    public function check(bool $forceRefresh, DashboardReleaseClient $client): array
    {
        $current = (string) config('dashboard.version', '0.0.0');
        if (! $forceRefresh) {
            $cached = Cache::get(self::CACHE_KEY);
            if (is_array($cached)) {
                $cached['version'] = $current;
                $cached['self_update_enabled'] = (bool) config('dashboard.self_update');

                return $cached;
            }
        }

        try {
            $data = $client->check($current);
        } catch (\Throwable) {
            $payload = [
                'version' => $current,
                'latest_version' => $current,
                'update_available' => false,
                'release_notes' => '',
                'package_available' => false,
                'license_active' => true,
                'unavailable' => true,
                'self_update_enabled' => (bool) config('dashboard.self_update'),
            ];
            Cache::put(self::CACHE_KEY, $payload, 120);

            return $payload;
        }

        $payload = [
            'version' => $current,
            'latest_version' => (string) ($data['latest_version'] ?? $current),
            'update_available' => ! empty($data['update_available']),
            'release_notes' => (string) ($data['release_notes'] ?? ''),
            'package_available' => ! empty($data['package_available']),
            'license_active' => true,
            'unavailable' => false,
            'self_update_enabled' => (bool) config('dashboard.self_update'),
        ];
        Cache::put(self::CACHE_KEY, $payload, self::CACHE_TTL);

        return $payload;
    }

    /**
     * @return array<string, mixed>
     */
    public function downloadPackage(?string $version, DashboardReleaseClient $client): array
    {
        $grant = $client->downloadGrant($version);
        $downloadUrl = (string) ($grant['download_url'] ?? '');
        if ($downloadUrl === '') {
            throw new \RuntimeException('Download URL missing from release service');
        }

        $dir = storage_path('app/updates');
        File::ensureDirectoryExists($dir);
        $targetVersion = (string) ($grant['version'] ?? $version ?? config('dashboard.version'));
        $filename = 'dashboard-'.$targetVersion.'-'.gmdate('YmdHis').'.zip';
        $dest = $dir.'/'.$filename;

        $client->downloadTo($downloadUrl, $dest);

        return [
            'ok' => true,
            'path' => $dest,
            'filename' => $filename,
            'version' => $targetVersion,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function apply(?string $version, DashboardReleaseClient $client): array
    {
        if (! config('dashboard.self_update')) {
            throw new \DomainException('Self-update is disabled on this host');
        }

        if (! class_exists(ZipArchive::class)) {
            throw new \RuntimeException('ZipArchive is not available on this server');
        }

        $lock = Cache::lock(self::LOCK_KEY, 900);
        if (! $lock->get()) {
            throw new \RuntimeException('A core update is already in progress');
        }

        try {
            $download = $this->downloadPackage($version, $client);
            $zipPath = (string) $download['path'];
            $backupDir = $this->createBackup();
            $extractRoot = storage_path('app/releases/'.($download['version'] ?? 'unknown').'-'.gmdate('YmdHis'));
            File::ensureDirectoryExists($extractRoot);

            $zip = new ZipArchive;
            if ($zip->open($zipPath) !== true) {
                throw new \RuntimeException('Could not open update package');
            }
            $zip->extractTo($extractRoot);
            $zip->close();

            $pointer = [
                'version' => (string) ($download['version'] ?? config('dashboard.version')),
                'path' => $extractRoot,
                'applied_at' => now()->toIso8601String(),
                'backup_path' => $backupDir,
                'package_path' => $zipPath,
            ];
            File::ensureDirectoryExists(storage_path('app/releases'));
            File::put(storage_path('app/releases/current.json'), json_encode($pointer, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

            Cache::forget(self::CACHE_KEY);
            $this->pruneBackups();

            return [
                'ok' => true,
                'version' => $pointer['version'],
                'previous_version' => (string) config('dashboard.version'),
                'reload_required' => true,
                'backup_path' => $backupDir,
            ];
        } finally {
            optional($lock)->release();
        }
    }

    /** @return list<array<string, mixed>> */
    public function listBackups(): array
    {
        $root = storage_path('app/updates/backups');
        if (! is_dir($root)) {
            return [];
        }

        $entries = [];
        foreach (File::directories($root) as $dir) {
            $entries[] = [
                'name' => basename($dir),
                'path' => $dir,
                'created_at' => date('c', filemtime($dir) ?: time()),
            ];
        }

        usort($entries, fn ($a, $b) => strcmp($b['created_at'], $a['created_at']));

        return $entries;
    }

    private function createBackup(): string
    {
        $root = storage_path('app/updates/backups');
        File::ensureDirectoryExists($root);
        $dest = $root.'/'.gmdate('Y-m-d-His');
        File::ensureDirectoryExists($dest);

        $sources = [
            base_path() => $dest.'/backend',
            dirname(base_path()).'/frontend' => $dest.'/frontend',
        ];

        foreach ($sources as $src => $target) {
            if (is_dir($src)) {
                File::copyDirectory($src, $target);
            }
        }

        return $dest;
    }

    private function pruneBackups(): void
    {
        $root = storage_path('app/updates/backups');
        if (! is_dir($root)) {
            return;
        }

        $dirs = collect(File::directories($root))
            ->sortByDesc(fn ($path) => filemtime($path) ?: 0)
            ->values();

        foreach ($dirs->slice(self::MAX_BACKUPS) as $old) {
            File::deleteDirectory($old);
        }
    }
}
