<?php

namespace App\Services\Academy;

use App\Http\Controllers\Api\V1\SetupController;
use App\Models\AcademyCourse;
use App\Models\MediaAsset;
use App\Models\Tenant;
use App\Services\Shop\ShopSettings;
use Illuminate\Support\Facades\Storage;

final class AcademyCoursePresenter
{
    /** @var array<string, string> */
    private const LEVEL_LABELS_FA = [
        'beginner' => 'مقدماتی',
        'introductory' => 'مقدماتی',
        'intro' => 'مقدماتی',
        'elementary' => 'مقدماتی',
        'starter' => 'مقدماتی',
        'basic' => 'مقدماتی',
        'مقدماتی' => 'مقدماتی',
        'مبتدی' => 'مقدماتی',
        'intermediate' => 'متوسط',
        'medium' => 'متوسط',
        'متوسط' => 'متوسط',
        'advanced' => 'پیشرفته',
        'expert' => 'پیشرفته',
        'professional' => 'پیشرفته',
        'پیشرفته' => 'پیشرفته',
        'all' => 'همه سطوح',
        'all_levels' => 'همه سطوح',
        'همه سطوح' => 'همه سطوح',
    ];

    /** @var array<int, array<string, mixed>> */
    private array $currencyCache = [];

    /** @var array<int, string> */
    private array $originCache = [];

    /**
     * Public/list course card. Additive keys only; existing card fields stay in place.
     *
     * @return array<string, mixed>
     */
    public function card(AcademyCourse $course, bool $publishedLessonsOnly = false): array
    {
        $pricing = $this->pricing($course);
        $level = $this->level($course->level);

        return [
            'id' => $course->id,
            'slug' => $course->slug,
            'title' => $course->title,
            'description' => $course->description,
            'cover_url' => $this->coverUrl($course),
            'published' => (bool) $course->published,
            'sort_order' => $course->sort_order,
            'is_free' => (bool) $course->is_free,
            'price_minor' => $pricing['price_minor'],
            'sale_price_minor' => $pricing['sale_price_minor'],
            'regular' => $pricing['regular'],
            'on_sale' => $pricing['on_sale'],
            'currency_display' => $this->currencyDisplay((int) $course->tenant_id),
            'level' => $level['value'],
            'level_label' => $level['label'],
            'product_id' => $course->product_id,
            'rating_avg' => $course->rating_avg,
            'rating_count' => (int) $course->rating_count,
            'students_count' => (int) $course->students_count,
            'duration_minutes' => $course->duration_minutes,
            'lessons_count' => $this->lessonsCount($course, $publishedLessonsOnly),
        ];
    }

    /**
     * Merge card fields onto the full course row (admin / student lists).
     *
     * @return array<string, mixed>
     */
    public function enrich(AcademyCourse $course, bool $publishedLessonsOnly = false): array
    {
        return array_merge($course->toArray(), $this->card($course, $publishedLessonsOnly));
    }

    public function coverUrl(AcademyCourse $course): ?string
    {
        $origin = $this->origin((int) $course->tenant_id, $course);
        $candidates = [
            $course->cover_url,
            $course->product?->cover_image_url,
            $course->product?->image_url,
        ];
        $meta = is_array($course->meta) ? $course->meta : [];
        foreach (['cover_media_id', 'cover_url', 'image'] as $key) {
            if (isset($meta[$key]) && $meta[$key] !== '' && $meta[$key] !== null) {
                $candidates[] = $meta[$key];
            }
        }

        foreach ($candidates as $raw) {
            $url = $this->resolveMedia($raw, (int) $course->tenant_id, $origin);
            if ($url !== null) {
                return $url;
            }
        }

        return null;
    }

    /**
     * @return array{price_minor: ?int, sale_price_minor: ?int, regular: bool, on_sale: bool}
     */
    private function pricing(AcademyCourse $course): array
    {
        $product = $course->product_id ? $course->product : null;
        $regular = $course->price_minor;
        if ($regular === null && $product) {
            $regular = $product->regularPriceMinor();
        }
        if ($course->is_free && $regular === null) {
            $regular = 0;
        }

        $sale = $product?->effectiveSalePriceMinor();
        $onSale = $sale !== null && $sale > 0 && ($regular === null || (int) $regular <= 0 || $sale < (int) $regular);

        return [
            'price_minor' => $regular !== null ? (int) $regular : null,
            'sale_price_minor' => $onSale ? (int) $sale : null,
            'regular' => ! $onSale,
            'on_sale' => $onSale,
        ];
    }

    /**
     * @return array{value: ?string, label: ?string}
     */
    private function level(mixed $level): array
    {
        $value = is_string($level) ? trim($level) : '';
        if ($value === '') {
            return ['value' => null, 'label' => null];
        }
        $key = mb_strtolower($value);

        return [
            'value' => $value,
            'label' => self::LEVEL_LABELS_FA[$key] ?? self::LEVEL_LABELS_FA[$value] ?? $value,
        ];
    }

    private function lessonsCount(AcademyCourse $course, bool $publishedOnly): ?int
    {
        if (array_key_exists('lessons_count', $course->getAttributes())) {
            return (int) $course->lessons_count;
        }
        if ($course->relationLoaded('lessons')) {
            $lessons = $course->lessons;
            if ($publishedOnly) {
                $lessons = $lessons->where('published', true);
            }

            return $lessons->count();
        }

        return null;
    }

    /**
     * Same shape as PublicCatalogController currency_display (builder money).
     *
     * @return array<string, mixed>
     */
    private function currencyDisplay(int $tenantId): array
    {
        if (isset($this->currencyCache[$tenantId])) {
            return $this->currencyCache[$tenantId];
        }
        $general = ShopSettings::getGeneral($tenantId);
        $tenant = Tenant::query()->find($tenantId, ['id', 'default_currency', 'branding']);
        $branding = $tenant && is_array($tenant->branding) ? $tenant->branding : [];

        return $this->currencyCache[$tenantId] = [
            'currency' => $general['currency'] ?? null,
            'currency_position' => $general['currency_position'] ?? null,
            'thousand_separator' => $general['thousand_separator'] ?? null,
            'decimal_separator' => $general['decimal_separator'] ?? null,
            'price_decimals' => $general['price_decimals'] ?? null,
            'currency_symbol' => SetupController::normalizeCurrencySymbol(
                (string) ($tenant?->default_currency ?? 'IRT'),
                is_string($branding['currency_symbol'] ?? null) ? $branding['currency_symbol'] : null
            ),
        ];
    }

    private function origin(int $tenantId, AcademyCourse $course): string
    {
        if (isset($this->originCache[$tenantId])) {
            return $this->originCache[$tenantId];
        }
        $domain = $course->relationLoaded('tenant') ? $course->tenant?->domain : null;
        if (! is_string($domain) || $domain === '') {
            $domain = Tenant::query()->where('id', $tenantId)->value('domain');
        }
        $domain = is_string($domain) ? preg_replace('#^https?://#i', '', rtrim($domain, '/')) : '';
        $origin = $domain !== ''
            ? 'https://'.$domain
            : rtrim((string) config('app.url'), '/');

        return $this->originCache[$tenantId] = rtrim((string) $origin, '/');
    }

    private function resolveMedia(mixed $raw, int $tenantId, string $origin): ?string
    {
        if (is_int($raw) || (is_string($raw) && preg_match('/^\d+$/', trim($raw)))) {
            $asset = MediaAsset::query()->where('tenant_id', $tenantId)->find((int) $raw);
            $raw = $asset?->url ?? $asset?->path;
        }
        $value = trim((string) $raw);
        if ($value === '') {
            return null;
        }
        if (preg_match('#^https?://#i', $value)) {
            return $this->publicAbsolute($value, $origin);
        }
        if (str_starts_with($value, '//')) {
            return $this->publicAbsolute('https:'.$value, $origin);
        }
        if (str_starts_with($value, '/storage/') || str_starts_with($value, '/media/')) {
            return $this->join($origin, $value);
        }
        if (str_starts_with($value, 'storage/') || str_starts_with($value, 'media/')) {
            return $this->join($origin, '/'.$value);
        }
        $url = Storage::disk('public')->url(ltrim($value, '/'));
        if (preg_match('#^https?://#i', $url)) {
            return $this->publicAbsolute($url, $origin);
        }

        return $this->join($origin, $url);
    }

    /**
     * Keep external/CDN URLs. Re-host local APP_URL / localhost storage URLs
     * onto the tenant origin so the storefront can load them.
     */
    private function publicAbsolute(string $url, string $origin): string
    {
        $parts = parse_url($url);
        $host = strtolower((string) ($parts['host'] ?? ''));
        if ($host === '') {
            return $url;
        }
        $appHost = strtolower((string) (parse_url((string) config('app.url'), PHP_URL_HOST) ?: ''));
        $local = in_array($host, ['localhost', '127.0.0.1', '::1'], true)
            || ($appHost !== '' && $host === $appHost);
        if (! $local || $origin === '') {
            return $url;
        }
        $path = (string) ($parts['path'] ?? '/');
        if (! empty($parts['query'])) {
            $path .= '?'.$parts['query'];
        }

        return $origin.$path;
    }

    private function join(string $origin, string $path): string
    {
        $path = '/'.ltrim($path, '/');
        if ($origin === '') {
            return $path;
        }

        return $origin.$path;
    }
}
