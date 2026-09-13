<?php

namespace App\Kernel;

use Illuminate\Support\Facades\File;

final class ModuleDiscovery
{
    /** @return list<ModuleManifest> */
    public function discover(): array
    {
        $bySlug = [];

        foreach ($this->scanDirectory($this->bundledPath()) as $manifest) {
            $bySlug[$manifest->slug] = $manifest;
        }

        // External (git-installed) overrides bundled for the same slug.
        foreach ($this->scanDirectory($this->externalPath()) as $manifest) {
            $bySlug[$manifest->slug] = $manifest;
        }

        $manifests = array_values($bySlug);
        usort($manifests, fn (ModuleManifest $a, ModuleManifest $b) => strcmp($a->slug, $b->slug));

        return $manifests;
    }

    /** @return array<string, ModuleManifest> */
    public function keyed(): array
    {
        $keyed = [];
        foreach ($this->discover() as $manifest) {
            $keyed[$manifest->slug] = $manifest;
        }

        return $keyed;
    }

    public function pathFor(string $moduleSlug): string
    {
        $external = $this->externalPathFor($moduleSlug);
        if (is_dir($external)) {
            return $external;
        }

        return $this->bundledPath().'/'.$this->dirName($moduleSlug);
    }

    public function externalPathFor(string $moduleSlug): string
    {
        return $this->externalPath().'/'.$this->dirName($moduleSlug);
    }

    protected function dirName(string $moduleSlug): string
    {
        return str_replace(' ', '', ucwords(str_replace(['-', '_'], ' ', $moduleSlug)));
    }

    public function isInstalledExternally(string $moduleSlug): bool
    {
        return is_file($this->externalPathFor($moduleSlug).'/manifest.json');
    }

    public function codePresent(string $moduleSlug): bool
    {
        return is_file($this->pathFor($moduleSlug).'/manifest.json');
    }

    public function bundledPath(): string
    {
        return base_path((string) config('modules.paths.bundled', 'modules'));
    }

    public function externalPath(): string
    {
        return base_path((string) config('modules.paths.external', 'modules-external'));
    }

    /**
     * @return list<ModuleManifest>
     */
    protected function scanDirectory(string $base): array
    {
        if (! is_dir($base)) {
            return [];
        }

        $manifests = [];
        foreach (File::directories($base) as $dir) {
            $manifestPath = $dir.'/manifest.json';
            if (! is_file($manifestPath)) {
                // Support repo layout: backend/manifest.json or module root with nested backend/
                $nested = $dir.'/backend/manifest.json';
                if (is_file($nested)) {
                    $manifestPath = $nested;
                } else {
                    continue;
                }
            }
            $data = json_decode(File::get($manifestPath), true);
            if (! is_array($data) || empty($data['slug'])) {
                continue;
            }
            $manifests[] = ModuleManifest::fromArray($data);
        }

        return $manifests;
    }
}
