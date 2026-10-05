<?php

namespace App\Services\Performance;

use App\Services\Modules\ModuleSettingsService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;

final class PerformanceSettingsService
{
    public const MODULE = 'performance';

    public const KEY = 'site';

    public function __construct(protected ModuleSettingsService $settings) {}

    /** @return array<string, mixed> */
    public function defaults(): array
    {
        return [
            'webp_enabled' => true,
            'lazy_load' => true,
            'minify_inline_css' => false,
            'purge_on_product_save' => true,
            'purge_on_content_save' => true,
            'isr_revalidate_seconds' => 60,
            'cdn_cache_hint' => true,
            'preload_fonts' => false,
            'defer_analytics' => true,
            'image_quality' => 82,
            'notes' => '',
        ];
    }

    /** @return array<string, mixed> */
    public function get(int $tenantId): array
    {
        $perf = $this->settings->get($tenantId, self::MODULE, self::KEY, []);
        $optimizer = $this->settings->get($tenantId, 'shop', 'theme_optimizer', []);
        $merged = array_merge($this->defaults(), is_array($optimizer) ? $optimizer : [], is_array($perf) ? $perf : []);

        return $merged;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function save(int $tenantId, array $input): array
    {
        $current = $this->get($tenantId);
        foreach ($this->defaults() as $key => $default) {
            if (! array_key_exists($key, $input)) {
                continue;
            }
            $value = $input[$key];
            if (is_bool($default)) {
                $current[$key] = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? (bool) $value;
            } elseif (is_int($default)) {
                $current[$key] = max(0, (int) $value);
            } else {
                $current[$key] = is_scalar($value) ? mb_substr((string) $value, 0, 2000) : $default;
            }
        }
        // Keep theme_optimizer in sync for existing consumers.
        $this->settings->put($tenantId, 'shop', 'theme_optimizer', [
            'webp_enabled' => (bool) $current['webp_enabled'],
            'lazy_load' => (bool) $current['lazy_load'],
            'minify_inline_css' => (bool) $current['minify_inline_css'],
        ]);
        $this->settings->put($tenantId, self::MODULE, self::KEY, $current);

        return $this->get($tenantId);
    }

    /** @return array{ok: bool, cleared: list<string>} */
    public function purge(int $tenantId, string $reason = 'manual'): array
    {
        $cleared = [];
        Cache::forget('tenant:'.$tenantId.':public-tenant');
        $cleared[] = 'tenant-public';
        Cache::forget('seo:sitemap:'.$tenantId);
        $cleared[] = 'seo-sitemap';
        try {
            Artisan::call('cache:clear');
            $cleared[] = 'app-cache';
        } catch (\Throwable) {
            // Host may disallow artisan in request lifecycle.
        }
        Cache::put('performance:last_purge:'.$tenantId, [
            'at' => now()->toIso8601String(),
            'reason' => mb_substr($reason, 0, 120),
        ], 86400);

        return ['ok' => true, 'cleared' => $cleared];
    }

    public function maybePurge(int $tenantId, string $kind): void
    {
        $cfg = $this->get($tenantId);
        $should = match ($kind) {
            'product' => ! empty($cfg['purge_on_product_save']),
            'content' => ! empty($cfg['purge_on_content_save']),
            default => false,
        };
        if ($should) {
            $this->purge($tenantId, $kind.'_save');
        }
    }
}
