<?php

namespace App\Services\Payments\Drivers\Concerns;

trait ChecksRequiredConfig
{
    /**
     * @param  list<string>  $keys
     * @param  array<string, mixed>  $config
     * @return array{ok: bool, message: string}|null
     */
    protected function missingRequired(array $config, array $keys): ?array
    {
        $missing = [];
        foreach ($keys as $key) {
            if (! filled($config[$key] ?? null)) {
                $missing[] = $key;
            }
        }
        if ($missing === []) {
            return null;
        }

        return ['ok' => false, 'message' => 'فیلدهای الزامی ناقص: '.implode(', ', $missing)];
    }
}
