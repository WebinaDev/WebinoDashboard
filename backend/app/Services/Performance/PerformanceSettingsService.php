<?php

namespace App\Services\Performance;

use App\Services\Modules\ModuleSettingsService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

final class PerformanceSettingsService
{
    public const MODULE = 'performance';

    public const KEY = 'site';

    /** @var list<string> */
    private const PRESETS = ['beginner', 'recommended', 'aggressive', 'custom'];

    /** @var list<string> */
    private const CDN_PROVIDERS = ['auto', 'none', 'cloudflare', 'arvan', 'parspack', 'custom'];

    /** @var list<string> */
    private const CACHE_DRIVERS = ['file', 'redis', 'memcached'];

    /** @var list<string> */
    private const FONT_DISPLAY = ['swap', 'optional', 'fallback', 'block'];

    public function __construct(protected ModuleSettingsService $settings) {}

    /** @return array<string, mixed> */
    public function defaults(): array
    {
        return [
            'enabled' => true,
            'preset' => 'recommended',

            // Caching
            'page_cache_enabled' => true,
            'page_cache_driver' => 'file',
            'cache_separate_guests' => true,
            'cache_by_device' => false,
            'cache_query_string' => false,
            'purge_on_product_save' => true,
            'purge_on_content_save' => true,
            'preload_cache' => false,
            'object_cache_enabled' => false,
            'browser_cache_enabled' => true,
            'browser_cache_ttl' => 604800,
            'cache_busting' => true,
            'cdn_cache_hint' => true,
            'cdn_cache_control' => '',
            'surrogate_control' => '',

            // CSS / JS / HTML
            'minify_html' => false,
            'minify_css' => true,
            'minify_js' => true,
            'minify_inline_css' => false,
            'defer_js' => true,
            'delay_js' => false,
            'remove_unused_css' => false,
            'critical_css' => true,
            'combine_css' => false,
            'combine_js' => false,

            // Images
            'webp_enabled' => true,
            'avif_enabled' => false,
            'lazy_load' => true,
            'responsive_images' => true,
            'image_quality' => 82,
            'strip_image_meta' => true,
            'cdn_image_optimization' => true,
            'preload_lcp_image' => true,
            'retina_images' => false,

            // Fonts
            'preload_fonts' => true,
            'font_display' => 'swap',
            'self_host_fonts' => false,
            'reduce_font_weights' => true,

            // Critical rendering path
            'preload_critical' => true,
            'prefetch_next' => false,
            'preconnect_third_party' => true,
            'fetchpriority_lcp' => true,

            // Compression
            'brotli_gzip' => true,
            'compression_level' => 5,

            // Third-party scripts
            'defer_analytics' => true,
            'delay_third_party' => true,
            'third_party_facades' => false,

            // CDN
            'cdn_provider' => 'auto',
            'cdn_zone' => '',
            'cdn_api_token' => '',
            'cdn_early_hints' => false,
            'cdn_mobile_desktop_rules' => false,

            // Database tips / cleanup schedule (advisory + toggle)
            'db_cleanup_enabled' => false,
            'db_cleanup_schedule' => 'weekly',
            'db_tips_enabled' => true,

            // Monitoring / ISR
            'score_monitoring' => true,
            'alert_on_drop' => false,
            'isr_revalidate_seconds' => 60,
            'notes' => '',
        ];
    }

    /** @return array<string, mixed> */
    public function get(int $tenantId): array
    {
        $perf = $this->settings->get($tenantId, self::MODULE, self::KEY, []);
        $optimizer = $this->settings->get($tenantId, 'shop', 'theme_optimizer', []);
        $merged = array_merge($this->defaults(), is_array($optimizer) ? $optimizer : [], is_array($perf) ? $perf : []);
        $merged['cdn_api_token'] = $this->maskSecret((string) ($merged['cdn_api_token'] ?? ''));

        return $merged;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function save(int $tenantId, array $input): array
    {
        $current = $this->getRaw($tenantId);
        $defaults = $this->defaults();

        foreach ($defaults as $key => $default) {
            if (! array_key_exists($key, $input)) {
                continue;
            }
            $value = $input[$key];

            if ($key === 'preset') {
                $preset = is_string($value) ? $value : 'custom';
                $current[$key] = in_array($preset, self::PRESETS, true) ? $preset : 'custom';
                if ($current[$key] !== 'custom') {
                    $current = array_merge($current, $this->presetValues($current[$key]));
                    $current['preset'] = $current[$key];
                }

                continue;
            }

            if ($key === 'page_cache_driver') {
                $driver = is_string($value) ? $value : 'file';
                $current[$key] = in_array($driver, self::CACHE_DRIVERS, true) ? $driver : 'file';

                continue;
            }

            if ($key === 'cdn_provider') {
                $provider = is_string($value) ? $value : 'auto';
                $current[$key] = in_array($provider, self::CDN_PROVIDERS, true) ? $provider : 'auto';

                continue;
            }

            if ($key === 'font_display') {
                $display = is_string($value) ? $value : 'swap';
                $current[$key] = in_array($display, self::FONT_DISPLAY, true) ? $display : 'swap';

                continue;
            }

            if ($key === 'db_cleanup_schedule') {
                $schedule = is_string($value) ? $value : 'weekly';
                $current[$key] = in_array($schedule, ['daily', 'weekly', 'monthly', 'manual'], true) ? $schedule : 'weekly';

                continue;
            }

            if ($key === 'cdn_api_token') {
                $token = is_scalar($value) ? trim((string) $value) : '';
                if ($token === '' || $this->isMaskedSecret($token)) {
                    continue;
                }
                $current[$key] = mb_substr($token, 0, 512);

                continue;
            }

            if (is_bool($default)) {
                $current[$key] = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? (bool) $value;
            } elseif (is_int($default)) {
                $min = match ($key) {
                    'image_quality' => 40,
                    'compression_level' => 1,
                    default => 0,
                };
                $max = match ($key) {
                    'image_quality' => 100,
                    'compression_level' => 11,
                    'isr_revalidate_seconds' => 86400,
                    'browser_cache_ttl' => 31536000,
                    default => PHP_INT_MAX,
                };
                $current[$key] = max($min, min($max, (int) $value));
            } else {
                $current[$key] = is_scalar($value) ? mb_substr((string) $value, 0, 2000) : $default;
            }
        }

        if (($current['preset'] ?? '') !== 'custom' && $this->differsFromPreset($current)) {
            $current['preset'] = 'custom';
        }

        $this->settings->put($tenantId, 'shop', 'theme_optimizer', [
            'webp_enabled' => (bool) $current['webp_enabled'],
            'lazy_load' => (bool) $current['lazy_load'],
            'minify_inline_css' => (bool) $current['minify_inline_css'],
            'critical_css' => (bool) $current['critical_css'],
            'avif_enabled' => (bool) $current['avif_enabled'],
            'image_quality' => (int) $current['image_quality'],
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
        Cache::forget('performance:score:'.$tenantId);
        $cleared[] = 'performance-score';
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
        $cfg = $this->getRaw($tenantId);
        if (empty($cfg['enabled'])) {
            return;
        }
        $should = match ($kind) {
            'product' => ! empty($cfg['purge_on_product_save']),
            'content' => ! empty($cfg['purge_on_content_save']),
            default => false,
        };
        if ($should) {
            $this->purge($tenantId, $kind.'_save');
        }
    }

    /**
     * Approximate page-speed score + prioritized actions from current settings.
     *
     * @return array{
     *   score: int,
     *   structure: int,
     *   grade: string,
     *   last_purge: array{at?: string, reason?: string}|null,
     *   checklist: list<array{id: string, ok: bool, weight: int, label: string}>,
     *   actions: list<array{id: string, priority: string, title: string, hint: string, setting?: string}>
     * }
     */
    public function insights(int $tenantId): array
    {
        $cfg = $this->getRaw($tenantId);
        $checklist = [];
        $actions = [];

        $checks = [
            ['id' => 'module_enabled', 'ok' => ! empty($cfg['enabled']), 'weight' => 8, 'label' => 'module_enabled', 'setting' => 'enabled', 'priority' => 'high', 'title' => 'enable_module', 'hint' => 'enable_module_hint'],
            ['id' => 'page_cache', 'ok' => ! empty($cfg['page_cache_enabled']), 'weight' => 14, 'label' => 'page_cache', 'setting' => 'page_cache_enabled', 'priority' => 'high', 'title' => 'enable_page_cache', 'hint' => 'enable_page_cache_hint'],
            ['id' => 'browser_cache', 'ok' => ! empty($cfg['browser_cache_enabled']), 'weight' => 8, 'label' => 'browser_cache', 'setting' => 'browser_cache_enabled', 'priority' => 'high', 'title' => 'enable_browser_cache', 'hint' => 'enable_browser_cache_hint'],
            ['id' => 'cdn_hints', 'ok' => ! empty($cfg['cdn_cache_hint']) || (($cfg['cdn_provider'] ?? 'none') !== 'none'), 'weight' => 8, 'label' => 'cdn_hints', 'setting' => 'cdn_cache_hint', 'priority' => 'medium', 'title' => 'cdn_hints_action', 'hint' => 'cdn_hints_action_hint'],
            ['id' => 'lazy_load', 'ok' => ! empty($cfg['lazy_load']), 'weight' => 8, 'label' => 'lazy_load', 'setting' => 'lazy_load', 'priority' => 'high', 'title' => 'enable_lazy_load', 'hint' => 'enable_lazy_load_hint'],
            ['id' => 'webp', 'ok' => ! empty($cfg['webp_enabled']), 'weight' => 7, 'label' => 'webp', 'setting' => 'webp_enabled', 'priority' => 'medium', 'title' => 'enable_webp', 'hint' => 'enable_webp_hint'],
            ['id' => 'critical_css', 'ok' => ! empty($cfg['critical_css']), 'weight' => 9, 'label' => 'critical_css', 'setting' => 'critical_css', 'priority' => 'high', 'title' => 'enable_critical_css', 'hint' => 'enable_critical_css_hint'],
            ['id' => 'minify_css', 'ok' => ! empty($cfg['minify_css']), 'weight' => 5, 'label' => 'minify_css', 'setting' => 'minify_css', 'priority' => 'medium', 'title' => 'enable_minify_css', 'hint' => 'enable_minify_css_hint'],
            ['id' => 'minify_js', 'ok' => ! empty($cfg['minify_js']), 'weight' => 5, 'label' => 'minify_js', 'setting' => 'minify_js', 'priority' => 'medium', 'title' => 'enable_minify_js', 'hint' => 'enable_minify_js_hint'],
            ['id' => 'defer_js', 'ok' => ! empty($cfg['defer_js']) || ! empty($cfg['delay_js']), 'weight' => 7, 'label' => 'defer_js', 'setting' => 'defer_js', 'priority' => 'high', 'title' => 'enable_defer_js', 'hint' => 'enable_defer_js_hint'],
            ['id' => 'preload_lcp', 'ok' => ! empty($cfg['preload_lcp_image']) || ! empty($cfg['fetchpriority_lcp']), 'weight' => 7, 'label' => 'preload_lcp', 'setting' => 'preload_lcp_image', 'priority' => 'high', 'title' => 'enable_preload_lcp', 'hint' => 'enable_preload_lcp_hint'],
            ['id' => 'fonts', 'ok' => ! empty($cfg['preload_fonts']), 'weight' => 4, 'label' => 'fonts', 'setting' => 'preload_fonts', 'priority' => 'low', 'title' => 'enable_preload_fonts', 'hint' => 'enable_preload_fonts_hint'],
            ['id' => 'compression', 'ok' => ! empty($cfg['brotli_gzip']), 'weight' => 6, 'label' => 'compression', 'setting' => 'brotli_gzip', 'priority' => 'medium', 'title' => 'enable_compression', 'hint' => 'enable_compression_hint'],
            ['id' => 'third_party', 'ok' => ! empty($cfg['defer_analytics']) || ! empty($cfg['delay_third_party']), 'weight' => 4, 'label' => 'third_party', 'setting' => 'delay_third_party', 'priority' => 'medium', 'title' => 'delay_third_party_action', 'hint' => 'delay_third_party_action_hint'],
        ];

        $earned = 0;
        $total = 0;
        foreach ($checks as $check) {
            $total += $check['weight'];
            if ($check['ok']) {
                $earned += $check['weight'];
            } else {
                $actions[] = [
                    'id' => $check['id'],
                    'priority' => $check['priority'],
                    'title' => $check['title'],
                    'hint' => $check['hint'],
                    'setting' => $check['setting'],
                ];
            }
            $checklist[] = [
                'id' => $check['id'],
                'ok' => $check['ok'],
                'weight' => $check['weight'],
                'label' => $check['label'],
            ];
        }

        $score = $total > 0 ? (int) round(($earned / $total) * 100) : 0;
        $structureBonus = 0;
        if (! empty($cfg['responsive_images'])) {
            $structureBonus += 3;
        }
        if (! empty($cfg['cache_busting'])) {
            $structureBonus += 2;
        }
        if (! empty($cfg['preconnect_third_party'])) {
            $structureBonus += 2;
        }
        if (($cfg['cdn_provider'] ?? 'none') !== 'none') {
            $structureBonus += 3;
        }
        $structure = min(100, $score + $structureBonus);

        $grade = match (true) {
            $score >= 90 => 'A',
            $score >= 80 => 'B',
            $score >= 65 => 'C',
            $score >= 50 => 'D',
            default => 'F',
        };

        $lastPurge = Cache::get('performance:last_purge:'.$tenantId);
        if (! is_array($lastPurge)) {
            $lastPurge = null;
        }

        usort($actions, static function (array $a, array $b): int {
            $rank = ['high' => 0, 'medium' => 1, 'low' => 2];

            return ($rank[$a['priority']] ?? 9) <=> ($rank[$b['priority']] ?? 9);
        });

        return [
            'score' => $score,
            'structure' => $structure,
            'grade' => $grade,
            'last_purge' => $lastPurge,
            'checklist' => $checklist,
            'actions' => array_slice($actions, 0, 12),
            'db_tips' => ! empty($cfg['db_tips_enabled']) ? [
                'index_hot_queries',
                'purge_old_logs',
                'avoid_n_plus_one',
                'use_object_cache',
            ] : [],
        ];
    }

    /** @return array<string, mixed> */
    private function getRaw(int $tenantId): array
    {
        $perf = $this->settings->get($tenantId, self::MODULE, self::KEY, []);
        $optimizer = $this->settings->get($tenantId, 'shop', 'theme_optimizer', []);

        return array_merge($this->defaults(), is_array($optimizer) ? $optimizer : [], is_array($perf) ? $perf : []);
    }

    /** @return array<string, mixed> */
    private function presetValues(string $preset): array
    {
        $base = $this->defaults();
        unset($base['notes'], $base['cdn_zone'], $base['cdn_api_token'], $base['cdn_cache_control'], $base['surrogate_control']);

        return match ($preset) {
            'beginner' => array_merge($base, [
                'preset' => 'beginner',
                'page_cache_enabled' => true,
                'object_cache_enabled' => false,
                'minify_html' => false,
                'minify_css' => true,
                'minify_js' => false,
                'critical_css' => false,
                'delay_js' => false,
                'avif_enabled' => false,
                'cdn_early_hints' => false,
                'db_cleanup_enabled' => false,
                'remove_unused_css' => false,
                'third_party_facades' => false,
            ]),
            'aggressive' => array_merge($base, [
                'preset' => 'aggressive',
                'page_cache_enabled' => true,
                'object_cache_enabled' => true,
                'cache_by_device' => true,
                'preload_cache' => true,
                'minify_html' => true,
                'minify_css' => true,
                'minify_js' => true,
                'minify_inline_css' => true,
                'defer_js' => true,
                'delay_js' => true,
                'remove_unused_css' => true,
                'critical_css' => true,
                'avif_enabled' => true,
                'webp_enabled' => true,
                'cdn_early_hints' => true,
                'cdn_mobile_desktop_rules' => true,
                'delay_third_party' => true,
                'third_party_facades' => true,
                'db_cleanup_enabled' => true,
                'prefetch_next' => true,
            ]),
            default => array_merge($base, ['preset' => 'recommended']),
        };
    }

    /** @param  array<string, mixed>  $current */
    private function differsFromPreset(array $current): bool
    {
        $preset = (string) ($current['preset'] ?? 'custom');
        if ($preset === 'custom' || ! in_array($preset, self::PRESETS, true)) {
            return true;
        }
        $expected = $this->presetValues($preset);
        foreach ($expected as $key => $value) {
            if ($key === 'preset' || $key === 'notes' || str_starts_with($key, 'cdn_')) {
                continue;
            }
            if (($current[$key] ?? null) !== $value) {
                return true;
            }
        }

        return false;
    }

    private function maskSecret(string $value): string
    {
        $value = trim($value);
        if ($value === '') {
            return '';
        }
        if (strlen($value) <= 4) {
            return '••••';
        }

        return '••••'.substr($value, -4);
    }

    private function isMaskedSecret(string $value): bool
    {
        return str_starts_with($value, '••••');
    }
}
