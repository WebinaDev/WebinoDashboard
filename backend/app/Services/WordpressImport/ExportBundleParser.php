<?php

namespace App\Services\WordpressImport;

use InvalidArgumentException;
use ZipArchive;

final class ExportBundleParser
{
    /** @var array<string, list<string>> */
    private const KEYS = [
        'media' => ['media', 'attachments'],
        'categories' => ['categories', 'product_categories'],
        'tags' => ['tags', 'product_tags'],
        'customers' => ['customers', 'users'],
        'products' => ['products', 'woo_products'],
        'pages' => ['pages'],
        'posts' => ['posts'],
        'orders' => ['orders'],
        'menus' => ['menus'],
        'stats' => ['stats', 'analytics'],
    ];

    /**
     * @return array<string, list<array<string, mixed>>>
     */
    public function fromUpload(string $contents, string $filename): array
    {
        $lower = strtolower($filename);
        if (str_ends_with($lower, '.zip')) {
            return $this->fromZip($contents);
        }

        return $this->fromJson($contents);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, list<array<string, mixed>>>
     */
    public function fromArray(array $payload): array
    {
        if (isset($payload['resource'], $payload['items']) && is_array($payload['items'])) {
            $resource = WordpressImportResources::canonical((string) $payload['resource']);

            return [$resource => $this->rows($payload['items'])];
        }

        $bundles = [];
        foreach (self::KEYS as $resource => $keys) {
            foreach ($keys as $key) {
                if (isset($payload[$key]) && is_array($payload[$key])) {
                    $bundles[$resource] = array_merge($bundles[$resource] ?? [], $this->rows($payload[$key]));
                }
            }
        }
        if ($bundles === []) {
            throw new InvalidArgumentException('Export has no known resources.');
        }

        return $bundles;
    }

    /**
     * @return array<string, list<array<string, mixed>>>
     */
    private function fromJson(string $contents): array
    {
        if (strlen($contents) > 20_000_000) {
            throw new InvalidArgumentException('Export is too large.');
        }
        $decoded = json_decode($contents, true);
        if (! is_array($decoded)) {
            throw new InvalidArgumentException('Export is not valid JSON.');
        }

        return $this->fromArray($decoded);
    }

    /**
     * @return array<string, list<array<string, mixed>>>
     */
    private function fromZip(string $contents): array
    {
        if (! class_exists(ZipArchive::class)) {
            throw new InvalidArgumentException('ZIP uploads need the PHP zip extension. Upload JSON instead.');
        }
        $tmp = tempnam(sys_get_temp_dir(), 'wpimp');
        if ($tmp === false) {
            throw new InvalidArgumentException('Could not read the ZIP.');
        }
        file_put_contents($tmp, $contents);
        $zip = new ZipArchive;
        if ($zip->open($tmp) !== true) {
            @unlink($tmp);
            throw new InvalidArgumentException('ZIP could not be opened.');
        }
        $merged = [];
        $bytes = 0;
        try {
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $name = (string) $zip->getNameIndex($i);
                if ($name === '' || str_contains($name, '..') || str_starts_with($name, '/') || str_contains($name, '\\')) {
                    throw new InvalidArgumentException('ZIP contains an unsafe path.');
                }
                if (! str_ends_with(strtolower($name), '.json')) {
                    continue;
                }
                $raw = $zip->getFromIndex($i);
                if (! is_string($raw)) {
                    continue;
                }
                $bytes += strlen($raw);
                if ($bytes > 30_000_000) {
                    throw new InvalidArgumentException('Uncompressed export is too large.');
                }
                $part = $this->fromJson($raw);
                foreach ($part as $resource => $rows) {
                    $merged[$resource] = array_merge($merged[$resource] ?? [], $rows);
                }
            }
        } finally {
            $zip->close();
            @unlink($tmp);
        }
        if ($merged === []) {
            throw new InvalidArgumentException('ZIP did not contain a JSON export.');
        }
        $count = array_sum(array_map('count', $merged));
        if ($count > 2000) {
            throw new InvalidArgumentException('Upload at most 2000 records. Push the rest in batches.');
        }

        return $merged;
    }

    /**
     * @param  list<mixed>  $rows
     * @return list<array<string, mixed>>
     */
    private function rows(array $rows): array
    {
        $clean = [];
        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }
            $external = trim((string) ($row['external_id'] ?? $row['id'] ?? ''));
            if ($external === '') {
                throw new InvalidArgumentException('Every record needs external_id.');
            }
            $row['external_id'] = mb_substr($external, 0, 191);
            $clean[] = $row;
        }

        return $clean;
    }
}
