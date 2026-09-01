<?php

namespace App\Kernel;

use Illuminate\Support\Facades\File;

final class ModuleDiscovery
{
    private const MODULES_PATH = 'modules';

    /** @return list<ModuleManifest> */
    public function discover(): array
    {
        $base = base_path(self::MODULES_PATH);
        if (! is_dir($base)) {
            return [];
        }

        $manifests = [];
        foreach (File::directories($base) as $dir) {
            $manifestPath = $dir.'/manifest.json';
            if (! is_file($manifestPath)) {
                continue;
            }
            $data = json_decode(File::get($manifestPath), true);
            if (! is_array($data) || empty($data['slug'])) {
                continue;
            }
            $manifests[] = ModuleManifest::fromArray($data);
        }

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
        return base_path(self::MODULES_PATH.'/'.ucfirst($moduleSlug));
    }
}
