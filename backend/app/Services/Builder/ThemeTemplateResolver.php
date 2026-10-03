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
            default => false,
        };
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
