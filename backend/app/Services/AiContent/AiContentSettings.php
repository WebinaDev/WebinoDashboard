<?php

namespace App\Services\AiContent;

use App\Services\Modules\ModuleSettingsService;
use Illuminate\Support\Facades\Crypt;

/**
 * AI Content settings (port of Webino_Dashboard_AI_Content_Settings).
 */
final class AiContentSettings
{
    public const MODULE = 'settings';

    public const KEY = 'site.ai';

    private const SECRET_KEYS = [
        'grok_api_key', 'gemini_api_key', 'openai_api_key', 'gapgpt_api_key', 'api_key',
    ];

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            'enabled' => true,
            'default_provider' => 'grok',
            'fallback_order' => ['grok', 'gemini', 'openai', 'gapgpt'],
            'grok_api_key' => '',
            'gemini_api_key' => '',
            'openai_api_key' => '',
            'gapgpt_api_key' => '',
            'grok_model' => 'grok-2-latest',
            'gemini_model' => 'gemini-2.0-flash',
            'openai_model' => 'gpt-4o-mini',
            'gapgpt_model' => 'gpt-4o-mini',
            'site_name' => '',
            'site_topic' => '',
            'site_description' => '',
            'tone' => 'professional, friendly',
            'language' => 'fa',
            'temperature' => 0.55,
            'max_tokens' => 4096,
            'web_research' => false,
            'daily_blog_quota' => 1,
            'daily_product_quota' => 5,
            'auto_publish' => false,
            'publish_status' => 'draft',
            'min_blog_words' => 400,
            'min_product_words' => 200,
            'min_term_words' => 100,
            'min_page_words' => 100,
            'usd_to_toman' => 100000,
            'do_product' => true,
            'do_product_cat' => true,
            'do_product_brand' => true,
            'do_blog' => true,
            'do_blog_cat' => true,
            'do_blog_image' => true,
            'do_page' => true,
            'title_enabled' => true,
            'title_pattern' => '{product} {brand}',
            'blog_topics' => [],
            'queue_paused' => false,
            'prompt_system' => 'You write SEO-friendly commerce content. Language: {{language}}. Tone: {{tone}}. Site: {{site_name}}. Topic: {{site_topic}}. Return valid JSON only.',
            'prompt_product' => 'Fill missing product fields. Prefer factual, useful copy with H2/H3 when long.',
            'prompt_product_cat' => 'Write a category description for an online store.',
            'prompt_product_brand' => 'Write a brand description for an online store.',
            'prompt_blog' => 'Write a long-form blog post with intro, sections and conclusion.',
            'prompt_blog_cat' => 'Write a blog category description.',
            'prompt_page' => 'Write clean semantic HTML for a CMS page body.',
            // Legacy bridge keys
            'provider' => 'native',
            'api_key' => '',
            'model' => '',
            'fields' => self::fieldDefaults(),
        ];
    }

    /** @return array<string, array<string, bool>> */
    public static function fieldDefaults(): array
    {
        return [
            'product' => [
                'name' => false, 'short_description' => true, 'description' => true,
                'faqs' => true, 'ai_review_summary' => true, 'related' => true, 'attributes' => false,
            ],
            'blog' => ['title' => true, 'excerpt' => true, 'body' => true, 'cover' => true],
            'term' => ['description' => true],
            'page' => ['body' => true, 'title' => false],
        ];
    }

    /** @return array<string, mixed> */
    public static function get(int $tenantId): array
    {
        $stored = app(ModuleSettingsService::class)->get($tenantId, self::MODULE, self::KEY);
        $merged = array_merge(self::defaults(), is_array($stored) ? $stored : []);
        $merged = self::migrateLegacy($merged, is_array($stored) ? $stored : []);
        foreach (self::SECRET_KEYS as $k) {
            if (! empty($merged[$k]) && is_string($merged[$k]) && str_starts_with($merged[$k], 'enc:')) {
                try {
                    $merged[$k] = Crypt::decryptString(substr($merged[$k], 4));
                } catch (\Throwable) {
                    $merged[$k] = '';
                }
            }
        }

        return $merged;
    }

    /**
     * @param  array<string, mixed>  $merged
     * @param  array<string, mixed>  $stored
     * @return array<string, mixed>
     */
    private static function migrateLegacy(array $merged, array $stored): array
    {
        $legacyKey = trim((string) ($stored['api_key'] ?? ''));
        $legacyProvider = strtolower(trim((string) ($stored['provider'] ?? '')));
        if ($legacyKey !== '' && $legacyProvider !== '' && $legacyProvider !== 'native' && $legacyProvider !== 'none') {
            $map = [
                'grok' => 'grok_api_key', 'xai' => 'grok_api_key',
                'gemini' => 'gemini_api_key', 'google' => 'gemini_api_key',
                'openai' => 'openai_api_key', 'chatgpt' => 'openai_api_key',
                'gapgpt' => 'gapgpt_api_key',
            ];
            $field = $map[$legacyProvider] ?? null;
            if ($field && empty($merged[$field])) {
                $merged[$field] = $legacyKey;
                $merged['default_provider'] = in_array($legacyProvider, ['grok', 'gemini', 'openai', 'gapgpt'], true)
                    ? $legacyProvider : 'openai';
            }
            if (! empty($stored['model'])) {
                $modelField = $merged['default_provider'].'_model';
                if (isset($merged[$modelField]) && empty($stored[$modelField])) {
                    $merged[$modelField] = (string) $stored['model'];
                }
            }
        }

        return $merged;
    }

    /** @return array<string, mixed> */
    public static function public(int $tenantId): array
    {
        $s = self::get($tenantId);
        foreach (self::SECRET_KEYS as $k) {
            $raw = (string) ($s[$k] ?? '');
            $s[$k] = $raw === '' ? '' : self::mask($raw);
            $s[$k.'_set'] = $raw !== '';
        }

        return $s;
    }

    public static function mask(string $key): string
    {
        $len = mb_strlen($key);
        if ($len <= 8) {
            return str_repeat('*', $len);
        }

        return mb_substr($key, 0, 4).str_repeat('*', max(4, $len - 8)).mb_substr($key, -4);
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function save(int $tenantId, array $input): array
    {
        $current = self::get($tenantId);
        $clean = self::sanitize($input);
        $next = array_merge($current, $clean);

        foreach (self::SECRET_KEYS as $k) {
            if (! array_key_exists($k, $input)) {
                $next[$k] = $current[$k];
                continue;
            }
            $val = is_scalar($input[$k]) ? trim((string) $input[$k]) : '';
            if ($val === '' || str_contains($val, '*')) {
                $next[$k] = $current[$k];
            } else {
                $next[$k] = $val;
            }
        }

        $toStore = $next;
        foreach (self::SECRET_KEYS as $k) {
            if (! empty($toStore[$k])) {
                $toStore[$k] = 'enc:'.Crypt::encryptString((string) $toStore[$k]);
            }
        }
        $toStore['provider'] = 'native';
        $toStore['api_key'] = '';
        app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::KEY, $toStore);

        return self::public($tenantId);
    }

    /**
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>
     */
    public static function sanitize(array $raw): array
    {
        $out = [];
        foreach ([
            'enabled', 'web_research', 'auto_publish', 'do_product', 'do_product_cat', 'do_product_brand',
            'do_blog', 'do_blog_cat', 'do_blog_image', 'do_page', 'title_enabled', 'queue_paused',
        ] as $k) {
            if (array_key_exists($k, $raw)) {
                $out[$k] = filter_var($raw[$k], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? false;
            }
        }
        foreach ([
            'default_provider', 'grok_model', 'gemini_model', 'openai_model', 'gapgpt_model',
            'site_name', 'site_topic', 'site_description', 'tone', 'language', 'publish_status', 'title_pattern',
            'prompt_system', 'prompt_product', 'prompt_product_cat', 'prompt_product_brand',
            'prompt_blog', 'prompt_blog_cat', 'prompt_page',
        ] as $k) {
            if (array_key_exists($k, $raw) && is_scalar($raw[$k])) {
                $out[$k] = (string) $raw[$k];
            }
        }
        if (isset($raw['fallback_order']) && is_array($raw['fallback_order'])) {
            $out['fallback_order'] = array_values(array_filter(array_map(
                fn ($v) => is_scalar($v) ? strtolower(trim((string) $v)) : '',
                $raw['fallback_order']
            )));
        }
        if (isset($raw['blog_topics']) && is_array($raw['blog_topics'])) {
            $out['blog_topics'] = array_values($raw['blog_topics']);
        }
        if (isset($raw['fields']) && is_array($raw['fields'])) {
            $out['fields'] = $raw['fields'];
        }
        foreach (['temperature' => [0.0, 2.0], 'usd_to_toman' => [1000, 1_000_000]] as $k => [$min, $max]) {
            if (isset($raw[$k])) {
                $out[$k] = max($min, min($max, (float) $raw[$k]));
            }
        }
        foreach ([
            'max_tokens' => [256, 128000], 'daily_blog_quota' => [0, 100], 'daily_product_quota' => [0, 500],
            'min_blog_words' => [50, 5000], 'min_product_words' => [50, 5000],
            'min_term_words' => [20, 2000], 'min_page_words' => [20, 5000],
        ] as $k => [$min, $max]) {
            if (isset($raw[$k])) {
                $out[$k] = max($min, min($max, (int) $raw[$k]));
            }
        }

        return $out;
    }

    public static function enabled(int $tenantId): bool
    {
        return ! empty(self::get($tenantId)['enabled']);
    }

    public static function hasAnyKey(int $tenantId): bool
    {
        $s = self::get($tenantId);
        foreach (['grok_api_key', 'gemini_api_key', 'openai_api_key', 'gapgpt_api_key'] as $k) {
            if (trim((string) ($s[$k] ?? '')) !== '') {
                return true;
            }
        }

        return false;
    }

    public static function assertReady(int $tenantId): void
    {
        if (! self::enabled($tenantId)) {
            throw new \RuntimeException('AI content module is disabled');
        }
        if (! self::hasAnyKey($tenantId)) {
            throw new \RuntimeException('No AI provider API key configured');
        }
    }

    public static function entityEnabled(int $tenantId, string $entity): bool
    {
        $s = self::get($tenantId);
        $map = [
            'product' => 'do_product', 'product_cat' => 'do_product_cat', 'product_brand' => 'do_product_brand',
            'blog' => 'do_blog', 'blog_cat' => 'do_blog_cat', 'page' => 'do_page',
        ];

        return ! empty($s[$map[$entity] ?? ''] ?? false);
    }

    public static function fieldEnabled(int $tenantId, string $entity, string $field): bool
    {
        $fields = self::get($tenantId)['fields'] ?? self::fieldDefaults();
        if (! is_array($fields) || ! isset($fields[$entity]) || ! is_array($fields[$entity])) {
            return true;
        }

        return ! empty($fields[$entity][$field]);
    }

    public static function interpolate(string $tpl, array $settings): string
    {
        return strtr($tpl, [
            '{{language}}' => (string) ($settings['language'] ?? 'fa'),
            '{{tone}}' => (string) ($settings['tone'] ?? ''),
            '{{site_name}}' => (string) ($settings['site_name'] ?? ''),
            '{{site_topic}}' => (string) ($settings['site_topic'] ?? ''),
            '{{site_description}}' => (string) ($settings['site_description'] ?? ''),
        ]);
    }
}
