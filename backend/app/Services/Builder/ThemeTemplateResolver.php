<?php

namespace App\Services\Builder;

use App\Models\BuilderTemplate;

class ThemeTemplateResolver
{
    public function resolve(int $tenantId, string $kind, ThemeRequestContext $context): ?BuilderTemplate
    {
        if (! ThemeTemplateKinds::is($kind)) {
            return null;
        }

        $rows = BuilderTemplate::query()
            ->where('tenant_id', $tenantId)
            ->where('kind', $kind)
            ->get();

        $picked = $this->pick($rows, $context);

        return $picked instanceof BuilderTemplate ? $picked : null;
    }

    /**
     * Non-default templates apply only when their conditions match.
     * The default for that kind is the fallback. Highest priority wins ties by newer id.
     *
     * @param  iterable<int, BuilderTemplate|array<string, mixed>>  $rows
     * @return BuilderTemplate|array<string, mixed>|null
     */
    public function pick(iterable $rows, ThemeRequestContext $context): BuilderTemplate|array|null
    {
        $best = null;
        $bestPriority = null;
        $bestId = null;
        $default = null;
        $defaultId = null;

        foreach ($rows as $row) {
            if (! $this->published($row)) {
                continue;
            }
            $id = (int) $this->field($row, 'id');
            if ($this->isDefault($row)) {
                if ($default === null || ($defaultId !== null && $id < $defaultId)) {
                    $default = $row;
                    $defaultId = $id;
                }

                continue;
            }
            $conditions = $this->field($row, 'conditions');
            if (! is_array($conditions) || ! $this->matches($conditions, $context)) {
                continue;
            }
            $priority = (int) $this->field($row, 'priority');
            if (
                $best === null
                || $bestPriority === null
                || $priority > $bestPriority
                || ($priority === $bestPriority && $bestId !== null && $id > $bestId)
            ) {
                $best = $row;
                $bestPriority = $priority;
                $bestId = $id;
            }
        }

        return $best ?? $default;
    }

    /** @param  array<string, mixed>|null  $conditions */
    public function matches(?array $conditions, ThemeRequestContext $context): bool
    {
        if (! is_array($conditions) || $conditions === []) {
            return false;
        }
        $include = is_array($conditions['include'] ?? null) ? $conditions['include'] : [];
        $exclude = is_array($conditions['exclude'] ?? null) ? $conditions['exclude'] : [];
        foreach ($exclude as $rule) {
            if ($this->ruleMatches($rule, $context)) {
                return false;
            }
        }
        if ($include === []) {
            return false;
        }
        foreach ($include as $rule) {
            if ($this->ruleMatches($rule, $context)) {
                return true;
            }
        }

        return false;
    }

    private function ruleMatches(mixed $rule, ThemeRequestContext $context): bool
    {
        if (! is_array($rule)) {
            return false;
        }
        $type = (string) ($rule['type'] ?? '');
        $value = trim((string) ($rule['value'] ?? ''));

        return match ($type) {
            'entire_site' => true,
            'url' => $context->path === ThemeRequestContext::normalizePath($value === '' ? '/' : $value),
            'url_prefix' => $this->prefix($context->path, $value),
            'url_contains' => $value !== '' && str_contains($context->path, $value),
            'singular' => $context->singular !== null && ($value === '' || $context->singular === $value),
            'archive' => $context->archive !== null && ($value === '' || $context->archive === $value),
            'search' => $context->search,
            'not_found' => $context->notFound,
            'product' => $context->singular === 'product' && $context->slug !== null && ($value === '' || mb_strtolower($value) === $context->slug),
            'product_category' => $context->category !== null && $value !== '' && mb_strtolower($value) === $context->category,
            'front_page' => $context->path === '/',
            'page' => $context->singular === 'page' && $context->slug !== null && ($value === '' || $this->inList($context->slug, $value)),
            'post' => $context->singular === 'post' && $context->slug !== null && ($value === '' || $this->inList($context->slug, $value)),
            'blog_category' => $context->category !== null && in_array($context->singular ?? $context->archive, ['post', 'blog', 'category'], true) && $value !== '' && $this->inList($context->category, $value),
            'brand' => $context->brand !== null && ($value === '' || $this->inList($context->brand, $value)),
            'tag' => $context->tag !== null && ($value === '' || $this->inList($context->tag, $value)),
            'date_range' => $this->inDateRange($value),
            'weekday' => $value !== '' && in_array((string) $this->now()->dayOfWeek, array_map('trim', explode(',', $value)), true),
            'time_range' => $this->inTimeRange($value),
            'collection' => $context->singular === 'collection_item' && $context->category !== null && ($value === '' || mb_strtolower($value) === $context->category),
            default => false,
        };
    }

    /** Comma-separated slug list match (case-insensitive). */
    private function inList(string $needle, string $list): bool
    {
        foreach (explode(',', $list) as $v) {
            if (mb_strtolower(trim($v)) === $needle) {
                return true;
            }
        }

        return false;
    }

    private function now(): \Carbon\CarbonInterface
    {
        return now('Asia/Tehran');
    }

    /** "1405-08-10..1405-09-10" Jalali (or Gregorian) dates, Tehran time; either end may be empty. */
    private function inDateRange(string $value): bool
    {
        if (! str_contains($value, '..')) {
            return false;
        }
        [$from, $to] = array_map(fn ($d) => $this->gregorian(trim($d)), explode('..', $value, 2));
        $today = $this->now()->toDateString();
        $ok = static fn (string $d) => (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $d);
        if (($from === '' || ! $ok($from)) && ($to === '' || ! $ok($to))) {
            return false;
        }

        return ($from === '' || ! $ok($from) || $today >= $from) && ($to === '' || ! $ok($to) || $today <= $to);
    }

    /** Accepts Jalali (1405-08-10, Persian digits ok) or Gregorian dates; returns Y-m-d or ''. */
    private function gregorian(string $d): string
    {
        $d = strtr($d, ['۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9', '/' => '-']);
        if (! preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})$/', $d, $m)) {
            return '';
        }
        [$y, $mo, $da] = [(int) $m[1], (int) $m[2], (int) $m[3]];
        if ($y < 1700) {
            [$y, $mo, $da] = \App\Services\Resume\Jalali::toGregorian($y, $mo, $da);
        }

        return sprintf('%04d-%02d-%02d', $y, $mo, $da);
    }

    /** "08:00-14:00" Tehran time; overnight ranges ("22:00-02:00") wrap. */
    private function inTimeRange(string $value): bool
    {
        if (! preg_match('/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/', $value, $m)) {
            return false;
        }
        $t = $this->now()->format('H:i');

        return $m[1] <= $m[2] ? ($t >= $m[1] && $t < $m[2]) : ($t >= $m[1] || $t < $m[2]);
    }

    private function prefix(string $path, string $value): bool
    {
        if ($value === '') {
            return false;
        }
        $prefix = ThemeRequestContext::normalizePath($value);
        if ($prefix === '/') {
            return true;
        }

        return $path === $prefix || str_starts_with($path, $prefix.'/');
    }

    private function published(BuilderTemplate|array $row): bool
    {
        $value = $this->field($row, 'published');

        return $value !== null && $value !== false;
    }

    private function isDefault(BuilderTemplate|array $row): bool
    {
        return filter_var($this->field($row, 'is_default'), FILTER_VALIDATE_BOOLEAN);
    }

    private function field(BuilderTemplate|array $row, string $key): mixed
    {
        if ($row instanceof BuilderTemplate) {
            return $row->getAttribute($key);
        }

        return $row[$key] ?? null;
    }
}
