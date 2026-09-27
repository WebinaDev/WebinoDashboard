<?php

namespace App\Services\AiContent;

use App\Models\BlogPost;
use App\Models\Brand;
use App\Models\Category;
use App\Models\CmsPage;
use App\Models\Product;
use Illuminate\Support\Str;

final class AiWriter
{
    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $opts
     */
    public function applyProduct(int $tenantId, int $productId, array $data, array $opts = []): void
    {
        $p = Product::query()->where('tenant_id', $tenantId)->findOrFail($productId);
        if (AiContentSettings::fieldEnabled($tenantId, 'product', 'short_description') && ! empty($data['short_description'])) {
            $p->short_description = (string) $data['short_description'];
        }
        if (AiContentSettings::fieldEnabled($tenantId, 'product', 'description') && ! empty($data['description'])) {
            $p->description = (string) $data['description'];
        }
        if (AiContentSettings::fieldEnabled($tenantId, 'product', 'faqs') && ! empty($data['faqs']) && is_array($data['faqs'])) {
            $p->faqs = array_values(array_filter(array_map(function ($row) {
                if (! is_array($row)) {
                    return null;
                }

                return [
                    'question' => (string) ($row['question'] ?? ''),
                    'answer' => (string) ($row['answer'] ?? ''),
                ];
            }, $data['faqs'])));
        }
        if (AiContentSettings::fieldEnabled($tenantId, 'product', 'ai_review_summary') && ! empty($data['ai_review_summary'])) {
            $p->ai_review_summary = (string) $data['ai_review_summary'];
        }
        if (! empty($opts['related_ids']) && is_array($opts['related_ids'])) {
            $wanted = array_map('intval', is_array($data['related_product_ids'] ?? null) ? $data['related_product_ids'] : []);
            $pool = array_map('intval', $opts['related_ids']);
            $picked = $wanted !== [] ? array_values(array_intersect($pool, $wanted)) : $pool;
            $p->related_ids = array_slice($picked, 0, 8);
        }
        if (! empty($opts['set_status'])) {
            $status = ! empty($opts['publish']) ? (string) ($opts['status'] ?? 'draft') : 'draft';
            if (in_array($status, ['draft', 'publish', 'pending'], true)) {
                $p->status = $status === 'publish' ? 'publish' : 'draft';
            }
        }
        $p->save();
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $opts
     */
    public function applyBlog(int $tenantId, ?int $postId, array $data, array $opts = []): BlogPost
    {
        $title = (string) ($data['title'] ?? $opts['topic'] ?? 'Untitled');
        $slugBase = (string) ($data['slug'] ?? Str::slug($title) ?: 'post-'.time());
        $slug = $this->uniqueBlogSlug($tenantId, $slugBase, $postId);
        $attrs = [
            'title' => $title,
            'slug' => $slug,
            'excerpt' => (string) ($data['excerpt'] ?? ''),
            'body' => (string) ($data['body'] ?? ''),
            'cover_url' => $opts['cover_url'] ?? null,
            'category_id' => $opts['category_id'] ?? null,
            'status' => ! empty($opts['publish']) ? 'published' : 'draft',
            'published_at' => ! empty($opts['publish']) ? now() : null,
        ];
        if ($postId) {
            $post = BlogPost::query()->where('tenant_id', $tenantId)->findOrFail($postId);
            $post->fill(array_filter($attrs, fn ($v) => $v !== null))->save();

            return $post->fresh();
        }

        return BlogPost::query()->create(array_merge($attrs, ['tenant_id' => $tenantId]));
    }

    /** @param  array<string, mixed>  $data */
    public function applyTerm(int $tenantId, string $targetType, int $termId, array $data): void
    {
        $desc = (string) ($data['description'] ?? '');
        if ($desc === '') {
            return;
        }
        if ($targetType === 'product_brand') {
            Brand::query()->where('tenant_id', $tenantId)->whereKey($termId)->update(['description' => $desc]);

            return;
        }
        if ($targetType === 'category' || $targetType === 'blog_cat') {
            // BlogCategory has no description column in this schema — no-op.
            return;
        }
        Category::query()->where('tenant_id', $tenantId)->whereKey($termId)->update(['description' => $desc]);
    }

    /** @param  array<string, mixed>  $data */
    public function applyPage(int $tenantId, int $pageId, array $data): void
    {
        $page = CmsPage::query()->where('tenant_id', $tenantId)->findOrFail($pageId);
        if (! empty($data['title']) && AiContentSettings::fieldEnabled($tenantId, 'page', 'title')) {
            $page->title = (string) $data['title'];
        }
        if (! empty($data['body'])) {
            $page->body = (string) $data['body'];
        }
        $page->save();
    }

    private function uniqueBlogSlug(int $tenantId, string $base, ?int $exceptId): string
    {
        $slug = $base;
        $i = 2;
        while (
            BlogPost::query()
                ->where('tenant_id', $tenantId)
                ->where('slug', $slug)
                ->when($exceptId, fn ($q) => $q->where('id', '!=', $exceptId))
                ->exists()
        ) {
            $slug = $base.'-'.$i;
            $i++;
        }

        return $slug;
    }
}
