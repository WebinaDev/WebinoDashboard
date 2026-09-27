<?php

namespace App\Services\AiContent;

final class AiPrompts
{
    public function system(int $tenantId): string
    {
        $s = AiContentSettings::get($tenantId);
        $tpl = (string) ($s['prompt_system'] ?? '');

        return AiContentSettings::interpolate($tpl, $s);
    }

    public function entityHint(int $tenantId, string $entity): string
    {
        $s = AiContentSettings::get($tenantId);
        $map = [
            'product' => 'prompt_product', 'product_cat' => 'prompt_product_cat',
            'product_brand' => 'prompt_product_brand', 'blog' => 'prompt_blog',
            'blog_cat' => 'prompt_blog_cat', 'page' => 'prompt_page',
        ];
        $key = $map[$entity] ?? '';

        return $key ? AiContentSettings::interpolate((string) ($s[$key] ?? ''), $s) : '';
    }

    /** @return array<string, mixed> */
    public function productSchema(): array
    {
        return [
            'name' => 'string',
            'short_description' => 'html',
            'description' => 'html with h2/h3',
            'focus_keyword' => 'string',
            'faqs' => [['question' => 'string', 'answer' => 'string']],
            'ai_review_summary' => 'string',
            'related_product_ids' => ['int'],
            'internal_links' => [['anchor' => 'string', 'url' => 'string']],
        ];
    }

    /** @return array<string, mixed> */
    public function blogSchema(): array
    {
        return [
            'title' => 'string',
            'excerpt' => 'string',
            'body' => 'html with h2',
            'focus_keyword' => 'string',
            'slug' => 'string-kebab',
            'internal_links' => [['anchor' => 'string', 'url' => 'string']],
        ];
    }

    /** @return array<string, mixed> */
    public function termSchema(): array
    {
        return [
            'description' => 'html',
            'focus_keyword' => 'string',
        ];
    }

    /** @return array<string, mixed> */
    public function pageSchema(): array
    {
        return [
            'title' => 'string',
            'body' => 'semantic html',
            'focus_keyword' => 'string',
        ];
    }

    /** @return array<string, mixed> */
    public function topicsSchema(): array
    {
        return [
            'topics' => [[
                'topic' => 'string',
                'focus_keyword' => 'string',
                'rationale' => 'string',
            ]],
        ];
    }

    /** @param  array<string, mixed>  $ctx */
    public function productUser(int $tenantId, array $ctx): string
    {
        return $this->entityHint($tenantId, 'product')."\n\nContext:\n"
            .json_encode($ctx, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    }

    /** @param  array<string, mixed>  $ctx */
    public function blogUser(int $tenantId, array $ctx): string
    {
        return $this->entityHint($tenantId, 'blog')."\n\nContext:\n"
            .json_encode($ctx, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    }

    /** @param  array<string, mixed>  $ctx */
    public function termUser(int $tenantId, string $entity, array $ctx): string
    {
        $hintKey = $entity === 'product_brand' ? 'product_brand' : ($entity === 'blog_cat' || $entity === 'category' ? 'blog_cat' : 'product_cat');

        return $this->entityHint($tenantId, $hintKey)."\n\nContext:\n"
            .json_encode($ctx, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    }

    /** @param  array<string, mixed>  $ctx */
    public function pageUser(int $tenantId, array $ctx): string
    {
        return $this->entityHint($tenantId, 'page')."\n\nContext:\n"
            .json_encode($ctx, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    }
}
